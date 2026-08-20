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

        const lastJobsRaw = await prisma.emailJob.findMany({
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
                sentAt: true,
                complexId: true,
                apartmentId: true,
                monthRef: true,
                yearRef: true,
                apartmentConsumptionReport: {
                    select: {
                        apartment: {
                            select: {
                                id: true,
                                name: true,
                                block: {
                                    select: {
                                        id: true,
                                        name: true,
                                        complex: { select: { id: true, socialName: true, aliasName: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Alguns jobs antigos guardam apenas apartmentId/complexId. Os mapas
        // abaixo preservam o contexto mesmo quando não há relatório vinculado.
        const apartmentIds = [...new Set(lastJobsRaw.map((job) => job.apartmentId).filter(Boolean))] as string[];
        const complexIds = [...new Set(lastJobsRaw.map((job) => job.complexId).filter(Boolean))] as string[];
        const [apartments, complexes] = await Promise.all([
            apartmentIds.length
                ? prisma.apartment.findMany({
                    where: { id: { in: apartmentIds } },
                    select: { id: true, name: true, block: { select: { id: true, name: true, complex: { select: { id: true, socialName: true, aliasName: true } } } }, },
                })
                : Promise.resolve([]),
            complexIds.length
                ? prisma.complex.findMany({ where: { id: { in: complexIds } }, select: { id: true, socialName: true, aliasName: true } })
                : Promise.resolve([]),
        ]);
        const apartmentMap = new Map((apartments as any[]).map((apartment) => [apartment.id, apartment]));
        const complexMap = new Map((complexes as any[]).map((complex) => [complex.id, complex]));

        const lastJobs = lastJobsRaw.map((job) => {
            const apartment = job.apartmentConsumptionReport?.apartment || apartmentMap.get(job.apartmentId || '');
            const complex = apartment?.block?.complex || complexMap.get(job.complexId || '');
            const complexName = complex?.socialName || complex?.aliasName || null;
            const blockName = apartment?.block?.name || null;
            const apartmentName = apartment?.name || null;
            const contextLabel = [complexName, blockName ? `Bloco ${blockName}` : null, apartmentName ? `Unidade ${apartmentName}` : null]
                .filter(Boolean)
                .join(' · ') || 'Contexto não identificado';

            return {
                id: job.id,
                toEmail: job.toEmail,
                subject: job.subject,
                status: job.status,
                attempts: job.attempts,
                errorMessage: job.errorMessage,
                createdAt: job.createdAt,
                sentAt: job.sentAt,
                monthRef: job.monthRef,
                yearRef: job.yearRef,
                complexName,
                blockName,
                apartmentName,
                contextLabel,
            };
        });

        return NextResponse.json({ stats, lastJobs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
