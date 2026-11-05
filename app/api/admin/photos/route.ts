/**
 * /api/admin/photos
 *
 * Ferramenta interna de fotos de medidor (restrita a e-mails em PHOTO_ADMIN_EMAILS,
 * padrao admin@acquax.com).
 *
 * GET  ?list=complexes                       -> lista de condominios
 * GET  ?complexId=..&month=05&year=2026      -> blocos/unidades + foto atual do mes
 * POST (multipart)                            -> sobe foto(s) para o CDN e grava em Reading.urlCover
 *        campos: month, year, complexId, [apartmentId] , files[]
 *        sem apartmentId = lote (casa o nome do arquivo com a unidade/referencia)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import sharp from 'sharp';
import {
  buildKeyForNew,
  isPhotoStorageConfigured,
  keyFromCdnUrl,
  putPhoto,
} from '@/lib/services/photo-storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function adminEmails(): string[] {
  return (process.env.PHOTO_ADMIN_EMAILS || 'admin@acquax.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function requirePhotoAdmin(req: NextRequest): Promise<{ ok: boolean; email?: string; error?: NextResponse }> {
  const { userId } = await validateUserSession(req);
  if (!userId) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { email: true },
  });
  const email = (user?.email || '').toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return { ok: false, error: NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 }) };
  }
  return { ok: true, email };
}

function monthVariants(month: string): string[] {
  const n = Number(month);
  const name = MONTHS_PT[n - 1] || '';
  return [String(n).padStart(2, '0'), String(n), name, name.toLowerCase()];
}

/** "RSDCA507.jpg" / "507.JPG" -> "507" (usado para casar arquivo com unidade). */
function digitsOf(value: string): string {
  return (value.match(/\d+/g) || []).join('');
}

async function loadUnits(complexId: string, month: string, year: string) {
  const blocks = await prisma.block.findMany({
    where: { complexId, deletedAt: null },
    select: {
      id: true,
      name: true,
      apartments: {
        where: { deletedAt: null },
        select: { id: true, name: true, meters: { where: { deletedAt: null }, select: { id: true, register: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Inclui leituras soft-deleted: no Capri e em outros condominios o mes foi
  // reprocessado e o relatorio continua apontando para a leitura antiga. Se a foto
  // do mes estiver nela, ainda assim precisa aparecer aqui para ser substituida.
  const raw = await prisma.$runCommandRaw({
    find: 'Readings',
    filter: {
      complexId,
      yearRef: { $in: [year, Number(year)] },
      monthRef: { $in: monthVariants(month) },
    },
    projection: { _id: 1, apartmentId: 1, urlCover: 1, reading: 1, monthRef: 1, yearRef: 1, deletedAt: 1 },
    batchSize: 3000,
  });
  const readings = ((raw as any)?.cursor?.firstBatch ?? []).map((r: any) => ({
    id: r._id as string,
    apartmentId: r.apartmentId as string | null,
    urlCover: (r.urlCover as string | null) ?? null,
    reading: (r.reading as number | null) ?? null,
    monthRef: r.monthRef as string | null,
    yearRef: String(r.yearRef ?? ''),
    softDeleted: r.deletedAt != null,
  }));

  const byApartment = new Map<string, (typeof readings)[number]>();
  for (const r of readings) {
    if (!r.apartmentId) continue;
    const current = byApartment.get(r.apartmentId);
    if (!current) { byApartment.set(r.apartmentId, r); continue; }
    // prefere leitura viva; entre elas, a que ja tem foto
    if (current.softDeleted && !r.softDeleted) { byApartment.set(r.apartmentId, r); continue; }
    if (current.softDeleted === r.softDeleted && !current.urlCover && r.urlCover) byApartment.set(r.apartmentId, r);
  }

  return blocks.map((b) => ({
    id: b.id,
    name: b.name,
    apartments: b.apartments
      .map((a) => {
        const reading = byApartment.get(a.id);
        return {
          id: a.id,
          name: a.name,
          registers: a.meters.map((m) => m.register).filter(Boolean) as string[],
          readingId: reading?.id ?? null,
          reading: reading?.reading ?? null,
          monthRef: reading?.monthRef ?? null,
          yearRef: reading?.yearRef ?? null,
          urlCover: reading?.urlCover ?? null,
          readingSoftDeleted: reading?.softDeleted ?? false,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR', { numeric: true })),
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePhotoAdmin(req);
    if (!auth.ok) return auth.error!;

    const params = req.nextUrl.searchParams;

    if (params.get('list') === 'complexes') {
      const complexes = await prisma.complex.findMany({
        where: { deletedAt: null },
        select: { id: true, socialName: true },
      });
      return NextResponse.json({
        storageConfigured: isPhotoStorageConfigured(),
        complexes: complexes
          .map((c) => ({ id: c.id, name: c.socialName }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      });
    }

    const complexId = params.get('complexId') || '';
    const month = params.get('month') || String(new Date().getMonth() + 1).padStart(2, '0');
    const year = params.get('year') || String(new Date().getFullYear());
    if (!complexId) return NextResponse.json({ error: 'Informe o condomínio.' }, { status: 400 });

    const complex = await prisma.complex.findFirst({
      where: { id: complexId, deletedAt: null },
      select: { id: true, socialName: true },
    });
    if (!complex) return NextResponse.json({ error: 'Condomínio não encontrado.' }, { status: 404 });

    const blocks = await loadUnits(complexId, month, year);
    return NextResponse.json({
      storageConfigured: isPhotoStorageConfigured(),
      complex: { id: complex.id, name: complex.socialName },
      month,
      year,
      blocks,
    });
  } catch (e: any) {
    console.error('[admin/photos] GET erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao carregar dados.' }, { status: 500 });
  }
}

interface UploadResult {
  file: string;
  ok: boolean;
  url?: string;
  block?: string;
  unit?: string;
  register?: string;
  readingId?: string;
  updated?: boolean;
  warnings?: string[];
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePhotoAdmin(req);
    if (!auth.ok) return auth.error!;

    if (!isPhotoStorageConfigured()) {
      return NextResponse.json(
        { error: 'Armazenamento de fotos não configurado. Cadastre B2_KEY_ID, B2_APP_KEY e B2_BUCKET.' },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const complexId = String(form.get('complexId') || '');
    const apartmentId = String(form.get('apartmentId') || '');
    const month = String(form.get('month') || '').padStart(2, '0');
    const year = String(form.get('year') || '');
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (!complexId) return NextResponse.json({ error: 'Informe o condomínio.' }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    if (!/^\d{2}$/.test(month) || !/^\d{4}$/.test(year)) {
      return NextResponse.json({ error: 'Mês/ano inválidos.' }, { status: 400 });
    }

    const complex = await prisma.complex.findFirst({
      where: { id: complexId, deletedAt: null },
      select: { id: true, socialName: true },
    });
    if (!complex) return NextResponse.json({ error: 'Condomínio não encontrado.' }, { status: 404 });

    const blocks = await loadUnits(complexId, month, year);
    const allUnits = blocks.flatMap((b) => b.apartments.map((a) => ({ ...a, blockName: b.name })));

    const results: UploadResult[] = [];

    for (const file of files) {
      const result: UploadResult = { file: file.name, ok: false };
      try {
        // 1) Descobre a unidade
        let unit = apartmentId ? allUnits.find((u) => u.id === apartmentId) : undefined;

        if (!unit) {
          const base = file.name.replace(/\.[^.]+$/, '');
          const digits = digitsOf(base);
          if (digits) {
            unit =
              allUnits.find((u) => u.name.trim() === base.trim()) ||
              allUnits.find((u) => u.name.replace(/\D/g, '') === digits) ||
              allUnits.find((u) => u.registers.some((r) => digitsOf(r) === digits || digitsOf(r).endsWith(digits)));
          }
        }

        if (!unit) {
          result.error = 'Unidade não encontrada para este arquivo (renomeie com o número da unidade ou a referência do medidor).';
          results.push(result);
          continue;
        }

        result.block = unit.blockName;
        result.unit = unit.name;
        result.register = unit.registers[0];
        result.readingId = unit.readingId ?? undefined;

        // 2) Define a chave no bucket: reaproveita o link atual quando ja e do CDN
        const existingKey = keyFromCdnUrl(unit.urlCover);
        const unitForFile = (unit.name || '').trim() || digitsOf(unit.registers[0] || '');
        const key =
          existingKey ||
          buildKeyForNew({
            complexName: complex.socialName,
            year,
            month,
            unit: unitForFile,
          });

        // 3) Normaliza a imagem (max 1600px, JPEG) e sobe
        const buffer = Buffer.from(await file.arrayBuffer());
        const processed = await sharp(buffer)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();

        const url = await putPhoto(key, processed, 'image/jpeg');
        result.url = url;

        // 4) Grava o link na leitura do mes
        if (unit.readingId) {
          if ((unit as any).readingSoftDeleted) {
            // Leitura removida em reprocessamento: grava o link sem reativa-la.
            await prisma.$runCommandRaw({
              update: 'Readings',
              updates: [
                { q: { _id: unit.readingId }, u: [{ $set: { urlCover: url, updatedAt: '$$NOW' } }] },
              ],
            });
          } else {
            await prisma.reading.update({
              where: { id: unit.readingId },
              data: { urlCover: url, updatedAt: new Date() },
            });
          }
          result.updated = true;
        } else {
          result.warnings = [
            'Foto enviada, mas não existe leitura desta unidade neste mês: o link não foi gravado automaticamente.',
          ];
        }

        result.ok = true;
      } catch (e: any) {
        result.error = e?.message || 'Falha ao enviar a foto.';
        console.error('[admin/photos] upload erro:', file.name, e?.message);
      }
      results.push(result);
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ success: okCount > 0, okCount, total: results.length, results });
  } catch (e: any) {
    console.error('[admin/photos] POST erro:', e?.message);
    return NextResponse.json({ error: 'Erro ao processar o envio.' }, { status: 500 });
  }
}
