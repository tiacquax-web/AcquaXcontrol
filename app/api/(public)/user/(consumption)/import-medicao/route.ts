import { NextRequest, NextResponse } from "next/server";
import { validateUserSession } from "@/lib/users";
import { parseMedicaoFile } from "@/lib/services/medicao-parser";
import prisma from "@/lib/prisma";

/**
 * POST /api/(public)/user/(consumption)/import-medicao
 *
 * Recebe o arquivo .xlsx e retorna um preview dos dados extraídos
 * (contas + resumo das unidades), sem gravar nada no banco ainda.
 *
 * Body: FormData com campo "file" (arquivo .xlsx)
 *
 * Response: { contas, unidadesSummary, warnings, errors }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const contentType = req.headers.get("content-type") || "";

    let buffer: ArrayBuffer;
    let fileName = "planilha.xlsx";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
      fileName = file.name;
      buffer = await file.arrayBuffer();
    } else {
      // JSON com base64
      const body = await req.json();
      if (!body.fileBase64) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
      fileName = body.fileName || fileName;
      const b64 = body.fileBase64.replace(/^data:[^;]+;base64,/, "");
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      buffer = arr.buffer;
    }

    // Verificar tamanho (max 20MB)
    if (buffer.byteLength > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo muito grande (máx 20MB)" }, { status: 400 });
    }

    // Parse da planilha
    const parsed = await parseMedicaoFile(buffer);

    if (parsed.errors.length > 0) {
      return NextResponse.json({ errors: parsed.errors, warnings: parsed.warnings }, { status: 422 });
    }

    if (parsed.contas.length === 0) {
      return NextResponse.json({
        errors: ["Não foi possível extrair dados da planilha. Verifique se o formato está correto."],
        warnings: parsed.warnings,
      }, { status: 422 });
    }

    // Buscar condomínios disponíveis para o usuário para fazer o match
    const complexes = await prisma.complex.findMany({
      where: { deletedAt: null },
      select: { id: true, socialName: true, aliasName: true },
    });

    // Buscar concessionárias cadastradas
    const dealerships = await prisma.dealership.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    // Para cada conta extraída, tentar fazer o match com condomínio e concessionária
    const contasEnriquecidas = parsed.contas.map(conta => {
      // Match condomínio
      const condName = conta.condominioName.toLowerCase().trim();
      const complexMatch = complexes.find(c =>
        c.socialName?.toLowerCase().includes(condName) ||
        condName.includes(c.socialName?.toLowerCase() || "__") ||
        c.aliasName?.toLowerCase().includes(condName) ||
        condName.includes(c.aliasName?.toLowerCase() || "__")
      );

      // Match concessionária
      const dealerName = conta.dealershipName.toLowerCase().trim();
      const dealerMatch = dealerships.find(d =>
        d.name?.toLowerCase().includes(dealerName) ||
        dealerName.includes(d.name?.toLowerCase() || "__")
      );

      return {
        ...conta,
        complexId: complexMatch?.id || null,
        complexSocialName: complexMatch?.socialName || null,
        
        dealershipId: dealerMatch?.id || null,
        dealershipMatchedName: dealerMatch?.name || null,
        unidadesCount: parsed.unidades[conta.sheetName]?.length || 0,
        fotosCount: parsed.unidades[conta.sheetName]?.filter(u => u.foto?.trim()).length || 0,
      };
    });

    // Resumo por aba
    const unidadesSummary: Record<string, { total: number, comFoto: number, comLeitura: number, condominioName: string }> = {};
    for (const [sheet, rows] of Object.entries(parsed.unidades)) {
      unidadesSummary[sheet] = {
        total: rows.length,
        comFoto: rows.filter(r => r.foto?.trim()).length,
        comLeitura: rows.filter(r => r.leitura && r.leitura > 0).length,
        condominioName: rows[0]?.condominio || "",
      };
    }

    return NextResponse.json({
      contas: contasEnriquecidas,
      unidadesSummary,
      warnings: parsed.warnings,
      errors: [],
      complexesDisponiveis: complexes.map(c => ({ id: c.id, socialName: c.socialName, aliasName: c.aliasName })),
      dealershipsDisponiveis: dealerships.map(d => ({ id: d.id, name: d.name })),
    });

  } catch (error: any) {
    console.error("Erro no import-medicao preview:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
