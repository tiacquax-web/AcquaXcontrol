/**
 * app/api/(public)/user/bulk-import/process/route.ts
 *
 * Processa a importação/atualização em massa de moradores a partir de uma planilha Excel.
 *
 * Para cada linha válida:
 *   - [create]        Apartamento sem morador + email novo no sistema:
 *                     cria usuário com senha provisória, vincula como Morador,
 *                     envia email de boas-vindas.
 *   - [update]        Apartamento JÁ tem morador vinculado (ex: usuário com email
 *                     interno/provisório tipo @acquax...). Atualiza o email,
 *                     gera nova senha provisória, marca mustUpdateCredentials,
 *                     envia email de boas-vindas.
 *   - [link_only]     Email já existe no sistema (morador de outro condomínio):
 *                     apenas vincula ao apartamento. Sem nova senha, sem email.
 *   - [skip]          Apartamento já tem morador com o mesmo email da planilha: pula.
 *   - [error]         Apartamento não encontrado: registra erro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession, normalizeEmail } from '@/lib/users';
import prisma from '@/lib/prisma';
import { hash } from 'bcryptjs';
import * as XLSX from 'xlsx';
import { sendEmail, isEmailConfigured } from '@/lib/services/email-service';
import { generateWelcomeEmail } from '@/lib/services/welcome-email-template';
import { isBlockedEmailDomain } from '@/lib/services/filipeta-email-dispatcher';
import { ContextType } from '@prisma/client';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

function generateProvisionalPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars[crypto.randomInt(0, chars.length)];
  }
  return pwd;
}

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

    // Ler planilha
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1, defval: '' }) as any[][];

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Planilha vazia ou sem dados.' }, { status: 400 });
    }

    // Detectar colunas
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
      return NextResponse.json({ error: 'Coluna de e-mail não encontrada.' }, { status: 400 });
    }

    // Buscar condomínio
    const complex = await prisma.complex.findUnique({
      where: { id: complexId },
      select: { id: true, socialName: true },
    });
    if (!complex) return NextResponse.json({ error: 'Condomínio não encontrado.' }, { status: 404 });

    // Buscar blocos e apartamentos
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
    if (!moradorRole) return NextResponse.json({ error: 'Role "Morador" não encontrada.' }, { status: 500 });

    const emailConfigured = isEmailConfigured();

    const results: any[] = [];
    let created = 0;
    let updated = 0;
    let linked = 0;
    let skipped = 0;
    let errors = 0;
    let emailsSent = 0;
    let emailsSkipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const blockName = String(row[blockCol] || '').trim();
      const aptName = String(row[aptCol] || '').trim();
      const residentName = String(row[nameCol] || '').trim();
      const rawEmail = String(row[emailCol] || '').trim();
      const email = normalizeEmail(rawEmail);

      if (!aptName || !email || !email.includes('@')) continue;

      // Encontrar apartamento
      let aptKey = `${blockName.toLowerCase()}|${aptName.toLowerCase()}`;
      let apartment = apartmentMap.get(aptKey);
      if (!apartment && !blockName) {
        aptKey = `__|${aptName.toLowerCase()}`;
        apartment = apartmentMap.get(aptKey);
      }

      if (!apartment) {
        results.push({ row: i + 1, aptName, email, status: 'error', message: `Unidade "${blockName} - ${aptName}" não encontrada no condomínio` });
        errors++;
        continue;
      }

      // Verificar se já existe RoleAssignment (morador) para este apartamento
      const existingAssignment = await prisma.roleAssignment.findFirst({
        where: {
          roleId: moradorRole.id,
          contextType: ContextType.apartment,
          contextId: apartment.id,
          deletedAt: null,
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });

      const existingUserEmail = existingAssignment?.user?.email?.toLowerCase();

      // Caso 1: apartamento já tem morador com o MESMO email → skip
      if (existingAssignment && existingUserEmail === email) {
        results.push({ row: i + 1, aptName, email, status: 'skipped', message: 'Já vinculado a esta unidade' });
        skipped++;
        continue;
      }

      // Caso 2: apartamento já tem morador com email DIFERENTE (provavelmente interno/provisório)
      // → atualizar o email, gerar nova senha provisória, enviar welcome email
      if (existingAssignment && existingAssignment.user && existingUserEmail !== email) {
        // Verificar se o email novo já existe em outro usuário
        const userWithEmail = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          select: { id: true },
        });

        if (userWithEmail && userWithEmail.id !== existingAssignment.user.id) {
          // O email novo pertence a outro usuário (morador de outro condomínio)
          // → vincular o usuário existente ao apartamento E remover o vínculo do usuário antigo
          await prisma.roleAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              userId: userWithEmail.id,
              updatedByUserId: userId,
            },
          });
          results.push({
            row: i + 1, aptName, email, status: 'linked',
            message: `Vinculado à unidade ${apartment.blockName} - ${apartment.name} (email já cadastrado)`,
          });
          linked++;
          continue;
        }

        // Atualizar o usuário existente: novo email + nova senha provisória
        const provisionalPassword = generateProvisionalPassword();
        const hashedPassword = await hash(provisionalPassword, 10);

        await prisma.user.update({
          where: { id: existingAssignment.user.id },
          data: {
            email,
            ...(residentName ? { name: residentName } : {}),
            password: hashedPassword,
            mustUpdateCredentials: true,
            resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN',
            resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            updatedByUserId: userId,
          },
        });

        // Enviar email de boas-vindas
        let emailMessage = 'Usuário atualizado';
        if (emailConfigured && !isBlockedEmailDomain(email)) {
          try {
            const { subject, html, text } = generateWelcomeEmail({
              residentName: residentName || existingAssignment.user.name || `Morador ${apartment.name}`,
              apartmentName: apartment.name,
              blockName: apartment.blockName,
              complexName: complex.socialName || '',
              email,
              provisionalPassword,
            });
            const result = await sendEmail({ to: email, toName: residentName || undefined, subject, html, text });
            emailMessage = result.success ? 'Usuário atualizado e email enviado' : `Usuário atualizado (falha no email: ${result.error})`;
            if (result.success) emailsSent++;
          } catch (e: any) {
            emailMessage = `Usuário atualizado (erro no email: ${e.message})`;
          }
        } else {
          emailsSkipped++;
        }

        results.push({ row: i + 1, aptName, email, status: 'updated', message: emailMessage });
        updated++;
        continue;
      }

      // Caso 3: apartamento sem morador → verificar se email já existe no sistema
      const existingUser = await prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, name: true, email: true },
      });

      if (existingUser) {
        // Email já existe (morador de outro condomínio) → apenas vincular
        await prisma.roleAssignment.create({
          data: {
            userId: existingUser.id,
            roleId: moradorRole.id,
            contextType: ContextType.apartment,
            contextId: apartment.id,
            complexId,
            createdByUserId: userId,
          },
        });
        results.push({
          row: i + 1, aptName, email, status: 'linked',
          message: `Vinculado à unidade ${apartment.blockName} - ${apartment.name}`,
        });
        linked++;
        continue;
      }

      // Caso 4: novo usuário → criar com senha provisória
      const provisionalPassword = generateProvisionalPassword();
      const hashedPassword = await hash(provisionalPassword, 10);

      const newUser = await prisma.user.create({
        data: {
          name: residentName || `Morador ${apartment.name}`,
          email,
          password: hashedPassword,
          mustUpdateCredentials: true,
          resetToken: 'FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN',
          resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          createdByUserId: userId,
        },
      });

      await prisma.roleAssignment.create({
        data: {
          userId: newUser.id,
          roleId: moradorRole.id,
          contextType: ContextType.apartment,
          contextId: apartment.id,
          complexId,
          createdByUserId: userId,
        },
      });

      // Enviar welcome email
      let emailMessage = 'Usuário criado';
      if (emailConfigured && !isBlockedEmailDomain(email)) {
        try {
          const { subject, html, text } = generateWelcomeEmail({
            residentName: residentName || `Morador ${apartment.name}`,
            apartmentName: apartment.name,
            blockName: apartment.blockName,
            complexName: complex.socialName || '',
            email,
            provisionalPassword,
          });
          const result = await sendEmail({ to: email, toName: residentName || undefined, subject, html, text });
          emailMessage = result.success ? 'Usuário criado e email enviado' : `Usuário criado (falha no email: ${result.error})`;
          if (result.success) emailsSent++;
        } catch (e: any) {
          emailMessage = `Usuário criado (erro no email: ${e.message})`;
        }
      } else {
        emailsSkipped++;
      }

      results.push({ row: i + 1, aptName, email, status: 'created', message: emailMessage });
      created++;
    }

    return NextResponse.json({
      summary: { total: results.length, created, updated, linked, skipped, errors, emailsSent, emailsSkipped },
      results,
    });
  } catch (error: any) {
    console.error('[BULK_IMPORT_PROCESS] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro ao processar importação' }, { status: 500 });
  }
}
