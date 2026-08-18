import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';

export async function GET(req: NextRequest) {
    const { userId } = await validateUserSession(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const stats = await prisma.emailJob.groupBy({
            by: ['status'],
            _count: { id: true }
        });

        const lastJobs = await prisma.emailJob.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
                id: true,
                toEmail: true,
                subject: true,
                status: true,
                attempts: true,
                errorMessage: true,
                createdAt: true,
                sentAt: true
            }
        });

        return NextResponse.json({ stats, lastJobs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
