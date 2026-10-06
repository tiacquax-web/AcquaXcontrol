// API: /api/user/comunicados/[id]
//
// GET    → serve o arquivo do comunicado (visualizar ou baixar) com verificação de acesso
// DELETE → remove (soft-delete) o comunicado — somente administrador
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import {
  getUserAudiences,
  canViewComunicado,
  type ComunicadoAudience,
} from '@/lib/comunicado-audience';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID não identificado' }, { status: 400 });

    const comunicado = await prisma.comunicado.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileBase64: true,
        audiences: true,
        isPublished: true,
        deletedAt: true,
      },
    });

    if (!comunicado || comunicado.deletedAt) {
      return NextResponse.json({ error: 'Comunicado não encontrado' }, { status: 404 });
    }

    // Verificar se o usuário pode ver este comunicado
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = !!contexts.system;

    if (!isAdmin) {
      if (!comunicado.isPublished) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
      }

      const assignments = await prisma.roleAssignment.findMany({
        where: { userId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
        select: { contextType: true, Role: { select: { name: true } } },
      });

      const isSystem = assignments.some(
        (a) =>
          a.contextType === 'system' ||
          ['administrador', 'programador', 'master', 'admin'].includes((a.Role?.name || '').toLowerCase()),
      );
      const systemRoles = assignments
        .filter((a) => a.contextType === 'system')
        .map((a) => a.Role?.name || '')
        .filter(Boolean);

      const userAudiences: ComunicadoAudience[] = getUserAudiences({
        isSystem,
        systemRoles,
        hasApartment: assignments.some((a) => a.contextType === 'apartment'),
        hasBlock: assignments.some((a) => a.contextType === 'block'),
        hasComplex: assignments.some((a) => a.contextType === 'complex'),
        hasCompany: assignments.some((a) => a.contextType === 'company'),
      });

      if (!canViewComunicado(comunicado.audiences, userAudiences)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
      }
    }

    const buffer = Buffer.from(comunicado.fileBase64 || '', 'base64');
    const isDownload = req.nextUrl.searchParams.get('download') === '1';
    const disposition = isDownload ? 'attachment' : 'inline';
    // Sanitiza o nome do arquivo para o header
    const safeName = (comunicado.fileName || 'comunicado').replace(/["\\\r\n]/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': comunicado.fileType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${disposition}; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e: any) {
    console.error('[COMUNICADOS] GET [id] error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Somente admin de sistema pode excluir
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'delete');
    if (!contexts.system) {
      return NextResponse.json({ error: 'Apenas administradores podem excluir comunicados.' }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID não identificado' }, { status: 400 });

    const existing = await prisma.comunicado.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'Comunicado não encontrado' }, { status: 404 });
    }

    await prisma.comunicado.update({
      where: { id },
      data: { deletedAt: new Date(), isPublished: false },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[COMUNICADOS] DELETE error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno ao excluir' }, { status: 500 });
  }
}
