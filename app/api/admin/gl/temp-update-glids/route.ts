import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { default: prisma } = await import('@/lib/prisma');

    const rows = [
      { chassi: '3617385304', glId: '3617385304' },
      { chassi: '3617385379', glId: 'D21l0008407d' },
      { chassi: '3617385433', glId: '3617385433' },
      { chassi: '3617385457', glId: '3617385457' },
      { chassi: '3617385475', glId: 'E15L0005842D' },
      { chassi: '3617385479', glId: '3617385479' },
      { chassi: '3617385506', glId: '3617385506' },
    ];

    // Find all meters by chassi (register)
    const allChassis = rows.map(r => r.chassi.toUpperCase());
    const existingMeters = await prisma.meter.findMany({
      where: { register: { in: allChassis } },
      select: { id: true, register: true, glId: true, status: true, deletedAt: true },
    });

    const existingMap = new Map(existingMeters.map(m => [m.register.toUpperCase(), m]));

    const notFound: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const row of rows) {
      const existing = existingMap.get(row.chassi.toUpperCase());
      if (!existing) {
        notFound.push(row.chassi);
        continue;
      }
      if (existing.glId === row.glId) {
        skipped.push(row.chassi);
        continue;
      }
      await prisma.meter.update({
        where: { id: existing.id },
        data: { glId: row.glId },
      });
      updated.push(`${row.chassi} -> ${row.glId}`);
    }

    return NextResponse.json({
      message: 'Update concluído',
      updated,
      updatedCount: updated.length,
      skipped,
      notFound,
      allMetersFound: existingMeters.map(m => ({ register: m.register, glId: m.glId, status: m.status })),
    });
  } catch (err: any) {
    console.error('[temp-update-glids] erro:', err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
