/**
 * Retorna o par (yearRef, monthRef) mais recente de ApartmentConsumptionReport
 * por condomínio, usando sondas indexadas (findFirst) em vez do
 * `distinct + orderBy` global do Prisma — que varre e ordena TODOS os relatórios
 * (~362k docs, chegando a 37s) e pressiona a memória do servidor de 2GB.
 * Equivalente ao distinct+orderBy do Prisma: para cada complexId, o primeiro
 * documento na ordem yearRef desc, monthRef desc (índice {complexId, yearRef, monthRef, deletedAt}).
 */
import prisma from '@/lib/prisma';

export type LatestReportMap = Record<string, { yearRef: number; monthRef: number }>;

export async function latestReportByComplex(complexIds: string[]): Promise<LatestReportMap> {
  const map: LatestReportMap = {};
  const CHUNK = 50;
  for (let i = 0; i < complexIds.length; i += CHUNK) {
    const chunk = complexIds.slice(i, i + CHUNK);
    const rows = await Promise.all(chunk.map(async (complexId) => {
      const r = await prisma.apartmentConsumptionReport.findFirst({
        where: { complexId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
        orderBy: [{ yearRef: 'desc' }, { monthRef: 'desc' }],
        select: { yearRef: true, monthRef: true },
      });
      return r ? { complexId, yearRef: r.yearRef, monthRef: r.monthRef } : null;
    }));
    for (const r of rows) {
      if (r) map[r.complexId] = { yearRef: Number(r.yearRef), monthRef: Number(r.monthRef) };
    }
  }
  return map;
}
