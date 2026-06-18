/**
 * GET /api/admin/gl/diagnostics
 *
 * Rota de diagnóstico da integração GL.
 * Verifica:
 *   1. Variáveis de ambiente S3
 *   2. Quantidade de medidores com glId preenchido no banco
 *   3. Amostra dos glIds cadastrados
 *   4. Conexão S3: lista arquivos de hoje (ou data informada via ?date=YYYY-MM-DD)
 *   5. Últimos 5 GlImportLogs
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, error: sessionError } = await validateUserSession(req);
    if (sessionError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { default: prisma } = await import('@/lib/prisma');

    const dateParam = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD
    const testDate = dateParam ? new Date(dateParam + 'T12:00:00Z') : new Date();

    // ── 1. Env vars ─────────────────────────────────────────────────────────────
    const region = process.env.GL_S3_REGION;
    const accessKeyId = process.env.GL_S3_ACCESS_KEY_ID ?? process.env.GL_ACESS_KEY_ID;
    const secretAccessKey = process.env.GL_S3_SECRET_ACCESS_KEY ?? process.env.GL_S3_SECRET_ACESS_KEY;
    const bucket = process.env.GL_S3_BUCKET;
    const pathPrefix = process.env.GL_S3_PATH_PREFIX ?? 'events';

    const envCheck = {
      GL_S3_REGION: region ? `✅ ${region}` : '❌ AUSENTE',
      GL_S3_BUCKET: bucket ? `✅ ${bucket}` : '❌ AUSENTE',
      GL_ACESS_KEY_ID: accessKeyId
        ? `✅ presente (${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)})`
        : '❌ AUSENTE',
      GL_S3_SECRET_ACESS_KEY: secretAccessKey
        ? `✅ presente (${secretAccessKey.slice(0, 4)}...)`
        : '❌ AUSENTE',
      GL_S3_PATH_PREFIX: pathPrefix,
    };

    // ── 2. Medidores com glId ───────────────────────────────────────────────────
    const totalMeters = await prisma.meter.count({ where: { deletedAt: null } });
    const metersWithGlId = await prisma.meter.count({
      where: { deletedAt: null, glId: { not: null } },
    });
    const sampleMetersWithGlId = await prisma.meter.findMany({
      where: { deletedAt: null, glId: { not: null } },
      select: { id: true, register: true, glId: true, apartmentId: true },
      take: 10,
    });
    const metersWithoutGlId = totalMeters - metersWithGlId;

    // ── 3. Teste S3 ─────────────────────────────────────────────────────────────
    let s3Test: any = { status: 'não testado' };

    if (region && accessKeyId && secretAccessKey && bucket) {
      try {
        const yyyy = testDate.getUTCFullYear();
        const mm = String(testDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(testDate.getUTCDate()).padStart(2, '0');
        const prefix = `${pathPrefix}/${yyyy}/${mm}/${dd}/`;

        const client = new S3Client({
          region,
          credentials: { accessKeyId, secretAccessKey },
        });

        const response = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
        );

        const keys = (response.Contents ?? []).map((obj) => obj.Key);
        s3Test = {
          status: '✅ conexão OK',
          prefix,
          arquivosEncontrados: keys.length,
          keys: keys.slice(0, 10),
          isTruncated: response.IsTruncated ?? false,
        };
      } catch (e: any) {
        s3Test = {
          status: '❌ erro',
          message: e.message,
          code: e.Code ?? e.code ?? e.name,
        };
      }
    } else {
      s3Test = { status: '❌ credenciais ausentes — S3 não testado' };
    }

    // ── 4. Readings GL no banco ─────────────────────────────────────────────────
    // Conta readings cujo meterId pertence a um medidor com glId (indicador de que a importação funcionou)
    const glMeterIds = sampleMetersWithGlId.map((m) => m.id);
    // Pega todos os ids de medidores com glId (não só amostra)
    const allGlMeterIds = await prisma.meter.findMany({
      where: { deletedAt: null, glId: { not: null } },
      select: { id: true },
    }).then((ms) => ms.map((m) => m.id));

    let readingsGl: any = { total: 0, maisRecente: null, maisAntiga: null };
    if (allGlMeterIds.length > 0) {
      const [countResult, newest, oldest] = await Promise.all([
        prisma.reading.count({ where: { meterId: { in: allGlMeterIds }, deletedAt: null } }),
        prisma.reading.findFirst({
          where: { meterId: { in: allGlMeterIds }, deletedAt: null },
          orderBy: { readAt: 'desc' },
          select: { readAt: true, meterId: true, reading: true },
        }),
        prisma.reading.findFirst({
          where: { meterId: { in: allGlMeterIds }, deletedAt: null },
          orderBy: { readAt: 'asc' },
          select: { readAt: true, meterId: true, reading: true },
        }),
      ]);
      readingsGl = {
        total: countResult,
        maisRecente: newest ? { readAt: newest.readAt, reading: newest.reading } : null,
        maisAntiga:  oldest ? { readAt: oldest.readAt, reading: oldest.reading } : null,
        alerta: countResult === 0
          ? '❌ ZERO readings GL no banco — importação retroativa ainda não rodou ou falhou'
          : `✅ ${countResult} readings GL gravadas no banco`,
      };
    } else {
      readingsGl = { total: 0, alerta: '❌ Nenhum medidor com glId — não há readings GL' };
    }

    // ── 5. Últimos GlImportLogs ─────────────────────────────────────────────────
    let recentLogs: any[] = [];
    try {
      recentLogs = await (prisma as any).glImportLog.findMany({
        orderBy: { executedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          executedAt: true,
          filesFound: true,
          filesProcessed: true,
          rowsTotal: true,
          imported: true,
          skipped: true,
          errors: true,
          errorMessage: true,
        },
      });
    } catch (e: any) {
      recentLogs = [{ error: e.message }];
    }

    // ── Resposta ─────────────────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      testedDate: testDate.toISOString().slice(0, 10),
      envVars: envCheck,
      readingsGL: readingsGl,
      medidores: {
        total: totalMeters,
        comGlId: metersWithGlId,
        semGlId: metersWithoutGlId,
        alerta: metersWithGlId === 0
          ? '⚠️ NENHUM medidor tem glId preenchido — a importação descartará 100% das linhas'
          : metersWithGlId < 10
          ? `⚠️ Poucos medidores com glId (${metersWithGlId}/${totalMeters})`
          : `✅ ${metersWithGlId} de ${totalMeters} medidores têm glId`,
        amostra: sampleMetersWithGlId,
      },
      s3: s3Test,
      ultimosLogs: recentLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
