import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateUserSession } from '@/lib/users';
import { getUserLocations } from '@/lib/user-location';

export async function GET(req: NextRequest) {
    const { userId } = await validateUserSession(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const [stats, byCategory] = await Promise.all([
            prisma.emailJob.groupBy({ by: ['status'], _count: { id: true } }),
            prisma.emailJob.groupBy({ by: ['category'], _count: { id: true } }),
        ]);

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
                category: true,
                origin: true,
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

        // ── Contexto por destinatário ─────────────────────────────────────────
        // Reset de senha e boas-vindas não carregam complexId/apartmentId no job.
        // Resolvemos a unidade pelo e-mail do destinatário (RoleAssignments) para
        // não exibir "Contexto não identificado" nesses disparos.
        const emailsSemContexto = [...new Set(
            lastJobsRaw
                .filter((job) => !job.apartmentId && !job.complexId && job.toEmail)
                .map((job) => String(job.toEmail).toLowerCase().trim()),
        )] as string[];

        const locationByEmail = new Map<string, { complexName: string | null; blockName: string | null; apartmentName: string | null }>();
        if (emailsSemContexto.length) {
            const users = await prisma.user.findMany({
                where: { email: { in: emailsSemContexto }, deletedAt: null },
                select: { id: true, email: true },
            });
            const locations = await getUserLocations(users.map((u) => u.id));
            for (const user of users) {
                const loc = locations.get(user.id);
                if (!loc) continue;
                const key = String(user.email).toLowerCase().trim();
                const previous = locationByEmail.get(key);
                // Mantém o vínculo mais específico (apartamento > bloco > condomínio)
                const score = (l: { apartmentName: string | null; blockName: string | null; complexName: string | null }) =>
                    (l.apartmentName ? 4 : 0) + (l.blockName ? 2 : 0) + (l.complexName ? 1 : 0);
                const current = {
                    complexName: loc.complexName ?? null,
                    blockName: loc.blockName ?? null,
                    apartmentName: loc.apartmentName ?? null,
                };
                if (!previous || score(current) > score(previous)) locationByEmail.set(key, current);
            }
        }

        const lastJobs = lastJobsRaw.map((job) => {
            const apartment = job.apartmentConsumptionReport?.apartment || apartmentMap.get(job.apartmentId || '');
            const complex = apartment?.block?.complex || complexMap.get(job.complexId || '');
            const fallbackLocation = locationByEmail.get(String(job.toEmail || '').toLowerCase().trim());
            const complexName = complex?.socialName || complex?.aliasName || fallbackLocation?.complexName || null;
            const blockName = apartment?.block?.name || fallbackLocation?.blockName || null;
            const apartmentName = apartment?.name || fallbackLocation?.apartmentName || null;
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
                category: job.category || 'outro',
                origin: job.origin || 'queue',
                complexName,
                blockName,
                apartmentName,
                contextLabel,
            };
        });

        return NextResponse.json({ stats, byCategory, lastJobs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
