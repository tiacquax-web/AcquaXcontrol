// API: /api/user/comunicados — Lista e cria comunicados (uploads)
//
// GET  → lista comunicados visíveis para o usuário (ou todos, se admin com ?admin=true)
// POST → cria um comunicado (somente administrador/programador do sistema)
//
// Visibilidade = público-alvo (audiences) + condomínios (complexIds).
// complexIds vazio significa "todos os condomínios".
import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import { getComunicadoScope } from '@/lib/comunicado-scope';

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
  complexIds: true,
  isPublished: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdByUserId: true,
} as const;

/** Mapa id → nome dos condomínios citados nos comunicados listados. */
async function buildComplexMap(lists: { complexIds?: string[] | null }[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(lists.flatMap((c) => c.complexIds || []).filter(Boolean)));
  if (ids.length === 0) return {};
  const complexes = await prisma.complex.findMany({
    where: { id: { in: ids } },
    select: { id: true, socialName: true, aliasName: true },
  });
  const map: Record<string, string> = {};
  complexes.forEach((c) => {
    map[c.id] = (c.aliasName || c.socialName || '').trim();
  });
  return map;
}

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
      const complexMap = await buildComplexMap(list);
      return NextResponse.json({ comunicados: list, isAdmin: true, complexMap });
    }

    // ── Visão do usuário comum: publicados, do seu público e dos seus condomínios ──
    const scope = await getComunicadoScope(userId);
    const userAudiences = scope.userAudiences;

    // Filtro por público: 'all' OU algum público do usuário
    const audienceFilter =
      userAudiences.length > 0
        ? {
            OR: [
              { audiences: { has: 'all' } },
              { audiences: { hasSome: userAudiences as string[] } },
            ],
          }
        : { audiences: { has: 'all' } };

    // Filtro por condomínio: comunicado sem condomínio definido (todos)
    // OU que contemple pelo menos um condomínio do usuário.
    const complexFilter =
      scope.complexIds.length > 0
        ? {
            OR: [
              { complexIds: { isEmpty: true } },
              { complexIds: { hasSome: scope.complexIds } },
            ],
          }
        : { complexIds: { isEmpty: true } };

    const list = await prisma.comunicado.findMany({
      where: {
        isPublished: true,
        AND: [audienceFilter, complexFilter],
      },
      select: META_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    const complexMap = await buildComplexMap(list);

    return NextResponse.json({ comunicados: list, isAdmin, complexMap });
  } catch (e: any) {
    console.error('[COMUNICADOS] GET error:', e);
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
}

/** Lê a lista de condomínios enviada (JSON, repetida ou separada por vírgula). */
function parseComplexIds(raw: string[]): string[] {
  if (raw.length === 0) return [];
  const out: string[] = [];
  for (const value of raw) {
    const text = String(value || '').trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) out.push(...parsed.map(String));
      else if (typeof parsed === 'string') out.push(parsed);
    } catch {
      out.push(...text.split(',').map((s) => s.trim()));
    }
  }
  // 'all' é apenas um atalho de interface: equivale a nenhum condomínio = todos
  return out.filter((id) => id && id !== 'all');
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
    let complexIdsRaw: string[] = [];
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

      // Condomínios destinatários (mesmos formatos aceitos para audiences)
      complexIdsRaw = parseComplexIds(form.getAll('complexIds').map(String));

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
      complexIdsRaw = Array.isArray(body.complexIds) ? body.complexIds.map(String) : [];
      if (String(body.complexIdsMode || '') === 'all') complexIdsRaw = [];
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
    const VALID_AUDIENCES = ['all', 'morador', 'sindico', 'administradora', 'programador', 'administrador'];
    let audiences = Array.from(new Set(audiencesRaw.filter((a) => VALID_AUDIENCES.includes(a))));
    if (audiences.length === 0) audiences = ['all'];

    // Normaliza condomínios: mantém apenas IDs que existem na base
    let complexIds = Array.from(new Set(complexIdsRaw.map((id) => String(id).trim()).filter(Boolean)));
    if (complexIds.length > 0) {
      const found = await prisma.complex.findMany({
        where: { id: { in: complexIds } },
        select: { id: true },
      });
      const foundSet = new Set(found.map((c) => c.id));
      complexIds = complexIds.filter((id) => foundSet.has(id));
      if (complexIds.length === 0) {
        return NextResponse.json(
          { error: 'Os condomínios selecionados não foram encontrados.' },
          { status: 400 },
        );
      }
    }

    const created = await prisma.comunicado.create({
      data: {
        title,
        description,
        fileName,
        fileType,
        fileSize: buffer.length,
        fileBase64: buffer.toString('base64'),
        audiences,
        complexIds,
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
