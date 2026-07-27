import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { default: prisma } = await import('@/lib/prisma');

    const targetChassis = ['3617385304','3617385379','3617385433','3617385457','3617385475','3617385479','3617385506'];
    const targetGlIds = ['3617385304','D21l0008407d','3617385433','3617385457','E15L0005842D','3617385479','3617385506'];
    
    // Search by register (chassi) — including soft-deleted, case insensitive
    // The Prisma middleware adds deletedAt filter, so we use $queryRaw to bypass it
    const db = (prisma as any);
    
    // Try 1: find by register containing any of the chassis (partial match)
    const metersByRegister = await prisma.meter.findMany({
      where: { 
        OR: targetChassis.map(c => ({ register: { contains: c } }))
      },
      select: { id: true, register: true, glId: true, status: true, deletedAt: true, apartmentId: true },
    });

    // Try 2: find meters where glId is already set to any of the target glIds
    const metersByGlId = await prisma.meter.findMany({
      where: {
        OR: targetGlIds.map(g => ({ glId: { contains: g } }))
      },
      select: { id: true, register: true, glId: true, status: true, deletedAt: true },
    });

    // Try 3: get a sample of meters to see what registers look like
    const sampleMeters = await prisma.meter.findMany({
      take: 20,
      select: { id: true, register: true, glId: true, status: true },
    });

    return NextResponse.json({
      metersByRegister: metersByRegister.map(m => ({ register: m.register, glId: m.glId, status: m.status, deletedAt: m.deletedAt })),
      metersByRegisterCount: metersByRegister.length,
      metersByGlId: metersByGlId.map(m => ({ register: m.register, glId: m.glId, status: m.status })),
      metersByGlIdCount: metersByGlId.length,
      sampleMeters: sampleMeters.map(m => ({ register: m.register, glId: m.glId, status: m.status })),
    });
  } catch (err: any) {
    console.error('[temp-update-glids] erro:', err);
    return NextResponse.json({ error: String(err?.message ?? err), stack: err?.stack?.substring(0, 500) }, { status: 500 });
  }
}
