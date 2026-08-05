/**
 * app/api/(public)/user/bulk-import/parse/route.ts
 *
 * Faz o parse de uma planilha Excel e retorna um preview das unidades,
 * indicando a ação que será tomada para cada linha:
 *   - create:        novo usuário + vínculo
 *   - update:        usuário existente no apartamento (email interno/provisório) → atualizar email
 *   - link_only:     email já existe no sistema → apenas vincular
 *   - skip:          já vinculado com o mesmo email
 *   - error:         unidade não encontrada
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { ContextType } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const complexId = formData.get('complexId') as string | null;

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });
    if (!complexId) return NextResponse.json({ error: 'Condomínio não informado' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1, defval: '' }) as any[][];

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Planilha vazia ou sem dados.' }, { status: 400 });
    }

    // Detectar colunas pelo cabeçalho
    const header = rows[0].map((h: any) => String(h || '').toLowerCase().trim());
    const colMap = {
      block: header.findIndex((h: string) => h.includes('bloco') || h.includes('block')),
      apartment: header.findIndex((h: string) => h.includes('apart') || h.includes('apt') || h.includes('unidade') || h.includes('unit')),
      name: header.findIndex((h: string) => h.includes('nome') || h.includes('name') || h.includes('morador')),
      email: header.findIndex((h: string) => h.includes('email') || h.includes('e-mail') || h.includes('mail')),
    };

    const blockCol = colMap.block >= 0 ? colMap.block : 0;
    const aptCol = colMap.apartment >= 0 ? colMap.apartment : 1;
    const nameCol = colMap.name >= 0 ? colMap.name : 2;
    const emailCol = colMap.email >= 0 ? colMap.email : 3;

    if (emailCol < 0) {
      return NextResponse.json({ error: 'Coluna de e-mail não encontrada na planilha.' }, { status: 400 });
    }

    // Buscar blocos e apartamentos do condomínio
    const blocks = await prisma.block.findMany({
      where: { complexId, deletedAt: null },
      include: { apartments: { where: { deletedAt: null } } },
    });

    const apartmentMap = new Map<string, { id: string; name: string; blockName: string; blockId: string }>();
    for (const block of blocks) {
      for (const apt of block.apartments) {
        const key = `${block.name.trim().toLowerCase()}|${apt.name.trim().toLowerCase()}`;
        apartmentMap.set(key, { id: apt.id, name: apt.name, blockName: block.name, blockId: block.id });
        if (!apartmentMap.has(`__|${apt.name.trim().toLowerCase()}`)) {
          apartmentMap.set(`__|${apt.name.trim().toLowerCase()}`, { id: apt.id, name: apt.name, blockName: block.name, blockId: block.id });
        }
      }
    }

    // Buscar role "Morador"
    const moradorRole = await prisma.role.findFirst({ where: { name: 'Morador', deletedAt: null } });

    const parsedRows: any[] = [];
    const allEmails: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const blockName = String(row[blockCol] || '').trim();
      const aptName = String(row[aptCol] || '').trim();
      const residentName = String(row[nameCol] || '').trim();
      const email = String(row[emailCol] || '').trim().toLowerCase();

      if (!aptName || !email || !email.includes('@')) continue;

      let aptKey = `${blockName.toLowerCase()}|${aptName.toLowerCase()}`;
      let apartment = apartmentMap.get(aptKey);
      if (!apartment && !blockName) {
        aptKey = `__|${aptName.toLowerCase()}`;
        apartment = apartmentMap.get(aptKey);
      }

      allEmails.push(email);
      parsedRows.push({
        row: i + 1,
        blockName,
        apartmentName: aptName,
        residentName,
        email,
        apartmentFound: !!apartment,
        apartmentId: apartment?.id || null,
        blockFound: apartment?.blockName || null,
      });
    }

    // Buscar usuários existentes por email
    const existingUsers = allEmails.length > 0
      ? await prisma.user.findMany({
          where: { email: { in: allEmails }, deletedAt: null },
          select: { id: true, email: true, name: true },
        })
      : [];
    const existingEmailsSet = new Set(existingUsers.map(u => u.email.toLowerCase()));

    // Buscar RoleAssignments existentes para os apartamentos
    const apartmentIds = parsedRows.filter(r => r.apartmentId).map(r => r.apartmentId);
    const existingAssignments = apartmentIds.length > 0 && moradorRole
      ? await prisma.roleAssignment.findMany({
          where: {
            roleId: moradorRole.id,
            contextType: ContextType.apartment,
            contextId: { in: apartmentIds },
            deletedAt: null,
          },
          include: { user: { select: { id: true, email: true, name: true } } },
        })
      : [];
    const assignmentMap = new Map<string, { userId: string; email: string }>();
    for (const a of existingAssignments) {
      if (a.user?.email) {
        assignmentMap.set(a.contextId, { userId: a.user.id, email: a.user.email.toLowerCase() });
      }
    }

    // Montar preview
    const preview = parsedRows.map(r => {
      const userExists = existingEmailsSet.has(r.email);
      const assignment = r.apartmentId ? assignmentMap.get(r.apartmentId) : undefined;

      let action = 'create';
      if (!r.apartmentFound) {
        action = 'error_not_found';
      } else if (assignment && assignment.email === r.email) {
        action = 'skip_already_linked';
      } else if (assignment && assignment.email !== r.email) {
        // Apartamento já tem morador, mas com email diferente → atualizar
        action = 'update';
      } else if (userExists) {
        action = 'link_only';
      }

      return {
        ...r,
        currentEmail: assignment?.email || null,
        action,
        actionLabel: {
          create: 'Criar usuário',
          update: 'Atualizar email',
          link_only: 'Vincular unidade',
          skip_already_linked: 'Já vinculado',
          error_not_found: 'Unidade não encontrada',
        }[action],
      };
    });

    const summary = {
      total: preview.length,
      create: preview.filter(p => p.action === 'create').length,
      update: preview.filter(p => p.action === 'update').length,
      link_only: preview.filter(p => p.action === 'link_only').length,
      skip: preview.filter(p => p.action === 'skip_already_linked').length,
      errors: preview.filter(p => p.action === 'error_not_found').length,
    };

    return NextResponse.json({ preview, summary, complexId });
  } catch (error: any) {
    console.error('[BULK_IMPORT_PARSE] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro ao processar planilha' }, { status: 500 });
  }
}
