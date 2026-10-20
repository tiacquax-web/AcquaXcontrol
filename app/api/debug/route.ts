/**
 * GET /api/debug
 *
 * Diagnóstico de conectividade com o banco.
 *
 * ⚠️ INCIDENTE 2026-10-20: esta rota estava PÚBLICA (sem nenhuma autenticação)
 * e devolvia o host do MongoDB e a contagem de registros de cada coleção.
 * Qualquer pessoa na internet podia chamar
 * https://www.acquaxcontrol.com.br/api/debug e descobrir:
 *   - o host do banco (db-mongodb-...mongo.ondigitalocean.com)
 *   - contagem de usuários / condomínios / empresas / unidades
 * Além disso a mensagem de erro crua do Prisma era devolvida ao cliente,
 * expondo IPs internos e nome do replica set.
 *
 * Agora exige o mesmo segredo do cron (CRON_SECRET) via header Authorization.
 * O middleware já bloqueia o caminho "/api/debug"? Não — o honeypot cobre
 * "/debug", não "/api/debug". Por isso a checagem é feita aqui.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Autoriza via Bearer CRON_SECRET (mesmo padrão das rotas de cron). */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Sem segredo configurado, nega tudo — nunca deixar a rota aberta.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  // Responde 404 (não 401) para não confirmar a existência da rota a scanners.
  if (!isAuthorized(req)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const dbUrl = process.env.DATABASE_URL || "";
    // Só o host, e só para quem já está autenticado com o segredo.
    const host = dbUrl.includes("@") ? dbUrl.split("@")[1]?.split("/")[0] : "unknown";

    const companiesCount = await prisma.company.count();
    const complexesCount = await prisma.complex.count();
    const usersCount = await prisma.user.count();
    const apartmentsCount = await prisma.apartment.count();

    return NextResponse.json(
      {
        db_host: host,
        is_digitalocean: host.includes("ondigitalocean"),
        is_atlas: host.includes("mongodb.net"),
        counts: {
          companies: companiesCount,
          complexes: complexesCount,
          users: usersCount,
          apartments: apartmentsCount,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Loga o detalhe no servidor, devolve mensagem genérica ao cliente.
    console.error("[debug] falha ao consultar o banco:", error);

    return NextResponse.json(
      {
        error: "Falha ao consultar o banco de dados.",
        hint: "Verifique /api/health e o status do cluster MongoDB no DigitalOcean.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
