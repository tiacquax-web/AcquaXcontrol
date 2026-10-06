// API: /api/user/comunicados — Lista e cria comunicados (uploads)
//
// GET  → lista comunicados visíveis para o usuário (ou todos, se admin com ?admin=true)
// POST → cria um comunicado (somente administrador/programador do sistema)
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import {
  getUserAudiences,
  type ComunicadoAudience,
} from '@/lib/comunicado-audience';

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

// Metadados sem o conteúdo do arquivo (evita payload gigante)
const META_SELECT = {
  id: true,
  title: true,
  description: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  audiences: true,
  isPublished: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdByUserId: true,
} as const;

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const isAdminView = req.nextUrl.searchParams.get('admin') === 'true';

    // Admin de sistema (programador/administrador)
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
    const isAdmin = !!contexts.system;

    // ── Visão do administrador: lista TODOS os comunicados (gerenciamento) ──
    if (isAdminView && isAdmin) {
      const list = await prisma.comunicado.findMany({
        select: META_SELECT,
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ comunicados: list, isAdmin: true });
    }

    // ── Visão do usuário comum: apenas publicados e do seu público ──
    // Descobre a quais públicos o usuário pertence.
    const assignments = await prisma.roleAssignment.findMany({
      where: {
        userId,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
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

    const hasApartment = assignments.some((a) => a.contextType === 'apartment');
    const hasBlock = assignments.some((a) => a.contextType === 'block');
    const hasComplex = assignments.some((a) => a.contextType === 'complex');
    const hasCompany = assignments.some((a) => a.contextType === 'company');

    const userAudiences: ComunicadoAudience[] = getUserAudiences({
      isSystem,
      systemRoles,
      hasApartment,
      hasBlock,
      hasComplex,
      hasCompany,
    });

    // Filtro: publicados E (destinados a 'all' OU a algum público do usuário)
    const audienceFilter =
      userAudiences.length > 0
        ? {
            OR: [
              { audiences: { has: 'all' } },
              { audiences: { hasSome: userAudiences as string[] } },
            ],
          }
        : { audiences: { has: 'all' } };

    const list = await prisma.comunicado.findMany({
      where: {
        isPublished: true,
        ...audienceFilter,
      },
      select: META_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ comunicados: list, isAdmin });
  } catch (e: any) {
    console.error('[COMUNICADOS] GET error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
    if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Somente admin de sistema pode publicar comunicados
    const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'create');
    const isAdmin = !!contexts.system;
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem publicar comunicados.' },
        { status: 403 },
      );
    }

    const contentType = req.headers.get('content-type') || '';

    let title = '';
    let description: string | undefined;
    let audiencesRaw: string[] = [];
    let fileName = 'comunicado';
    let fileType = 'application/octet-stream';
    let buffer: Buffer | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      title = String(form.get('title') || '').trim();
      description = String(form.get('description') || '').trim() || undefined;

      // audiences pode vir como JSON string, repetido ou separado por vírgula
      const audField = form.getAll('audiences');
      if (audField.length === 1) {
        const raw = String(audField[0]);
        try {
          const parsed = JSON.parse(raw);
          audiencesRaw = Array.isArray(parsed) ? parsed.map(String) : [raw];
        } catch {
          audiencesRaw = raw.split(',').map((s) => s.trim());
        }
      } else if (audField.length > 1) {
        audiencesRaw = audField.map(String);
      }

      const file = form.get('file') as File | null;
      if (file) {
        fileName = file.name || fileName;
        fileType = file.type || fileType;
        buffer = Buffer.from(await file.arrayBuffer());
      }
    } else {
      // JSON com base64
      const body = await req.json();
      title = String(body.title || '').trim();
      description = body.description ? String(body.description).trim() : undefined;
      audiencesRaw = Array.isArray(body.audiences) ? body.audiences.map(String) : [];
      fileName = body.fileName || fileName;
      fileType = body.fileType || fileType;
      if (body.fileBase64) {
        const b64 = String(body.fileBase64).replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(b64, 'base64');
      }
    }

    if (!title) return NextResponse.json({ error: 'O título é obrigatório.' }, { status: 400 });
    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'É necessário anexar um arquivo.' }, { status: 400 });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx 8MB).' }, { status: 400 });
    }

    // Normaliza audiences: remove vazios, valida contra a lista conhecida
    const VALID = ['all', 'morador', 'sindico', 'administradora', 'programador', 'administrador'];
    let audiences = Array.from(new Set(audiencesRaw.filter((a) => VALID.includes(a))));
    if (audiences.length === 0) audiences = ['all'];

    const created = await prisma.comunicado.create({
      data: {
        title,
        description,
        fileName,
        fileType,
        fileSize: buffer.length,
        fileBase64: buffer.toString('base64'),
        audiences,
        isPublished: true,
        publishedAt: new Date(),
        createdByUserId: userId,
      },
      select: META_SELECT,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    console.error('[COMUNICADOS] POST error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno ao publicar comunicado' }, { status: 500 });
  }
}
