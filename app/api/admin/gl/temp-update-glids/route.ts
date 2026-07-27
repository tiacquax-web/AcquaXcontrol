import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { default: prisma } = await import('@/lib/prisma');

    // The meter we need to update: register contains "2898602" or "CAMPISTA"
    // Target glId: E15L0005842D
    const meters = await prisma.meter.findMany({
      where: {
        OR: [
          { register: { contains: '2898602' } },
          { register: { contains: 'CAMPISTA' } },
        ]
      },
      select: { id: true, register: true, glId: true, status: true, deletedAt: true },
    });

    const results: any[] = [];

    for (const m of meters) {
      if (m.glId === 'E15L0005842D') {
        results.push({ register: m.register, action: 'already_set', glId: m.glId });
        continue;
      }
      await prisma.meter.update({
        where: { id: m.id },
        data: { glId: 'E15L0005842D' },
      });
      results.push({ register: m.register, action: 'updated', oldGlId: m.glId, newGlId: 'E15L0005842D' });
    }

    // Also verify all 7 are now correct
    const allTargetGlIds = ['3617385304','D21l0008407d','3617385433','3617385457','E15L0005842D','3617385479','3617385506'];
    const verify = await prisma.meter.findMany({
      where: { OR: allTargetGlIds.map(g => ({ glId: g })) },
      select: { register: true, glId: true, status: true },
    });

    return NextResponse.json({
      foundMeters: meters.map(m => ({ register: m.register, glId: m.glId, status: m.status, deletedAt: m.deletedAt })),
      updateResults: results,
      verification: verify.map(m => ({ register: m.register, glId: m.glId, status: m.status })),
      verificationCount: verify.length,
    });
  } catch (err: any) {
    console.error('[temp-update-glids] erro:', err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
