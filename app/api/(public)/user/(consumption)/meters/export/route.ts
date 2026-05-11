import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const userId = validSession.userId;
        const contexts = await getUserContextsForActionOnEntity(userId, 'meter', 'read');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', complexId = '', blockId = '', meterIds = [] } = body;

        const where: any = { deletedAt: null };
        if (search) {
            where.OR = [
                { register: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (blockId) {
            where.apartment = { blockId };
        } else if (complexId) {
            where.apartment = { complexId };
        }
        if (meterIds.length > 0) where.id = { in: meterIds };

        const meters = await prisma.meter.findMany({
            where,
            select: {
                id: true,
                register: true,
                deviceIdIoT: true,
                status: true,
                location: true,
                initialReading: true,
                yearManufacture: true,
                createdAt: true,
                apartment: {
                    select: {
                        name: true,
                        block: { select: { name: true, complex: { select: { socialName: true } } } }
                    }
                },
                typeMeter: { select: { name: true } },
                meterDeviceLinks: {
                    where: {
                        deletedAt: null,
                        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
                    },
                    take: 1,
                    orderBy: { startDate: 'desc' },
                    include: {
                        device: {
                            select: {
                                deviceId: true,
                                remoteId: true,
                                name: true,
                                pilotMode: true,
                                lastSeenDate: true,
                            },
                        },
                    },
                },
                Readings: {
                    where: { deletedAt: null },
                    orderBy: { readAt: 'desc' },
                    take: 1,
                    select: {
                        reading: true,
                        readAtDate: true,
                        source: true,
                    },
                },
            },
            orderBy: [{ apartment: { block: { complex: { socialName: 'asc' } } } }, { register: 'asc' }],
            take: 50000,
        });

        if (meters.length === 0) return NextResponse.json({ error: 'Nenhum medidor encontrado' }, { status: 404 });

        const explicitDeviceIds = Array.from(new Set(meters.map((meter) => meter.deviceIdIoT).filter(Boolean))) as string[];
        const explicitDevices = explicitDeviceIds.length
            ? await prisma.iotDevice.findMany({
                where: {
                    deviceId: { in: explicitDeviceIds },
                    deletedAt: null,
                },
                select: {
                    deviceId: true,
                    remoteId: true,
                    name: true,
                    pilotMode: true,
                    lastSeenDate: true,
                },
            })
            : [];
        const explicitDeviceMap = new Map(explicitDevices.map((device) => [device.deviceId, device]));

        const exportData = meters.map(m => {
            const activeLink = m.meterDeviceLinks?.[0];
            const linkedDevice = activeLink?.device || (m.deviceIdIoT ? explicitDeviceMap.get(m.deviceIdIoT) : undefined);
            const lastReading = m.Readings?.[0];
            return ({
            'Chassi/Registro': m.register || '',
            'Tipo': m.typeMeter?.name || '',
            'Condomínio': m.apartment?.block?.complex?.socialName || '',
            'Bloco': m.apartment?.block?.name || '',
            'Apartamento': m.apartment?.name || '',
            'deviceIdIoT': m.deviceIdIoT || linkedDevice?.deviceId || '',
            'Status vínculo': m.deviceIdIoT || linkedDevice?.deviceId ? 'vinculado' : 'desvinculado',
            'Última leitura': lastReading?.reading ?? '',
            'Última leitura data': lastReading?.readAtDate || '',
            'Última comunicação': linkedDevice?.lastSeenDate || '',
            'PilotMode': linkedDevice?.pilotMode ? 'Sim' : 'Não',
            'remoteId': linkedDevice?.remoteId || '',
            'deviceName': linkedDevice?.name || '',
            'Origem da leitura': lastReading?.source || '',
            'Local': m.location || '',
            'Leitura Inicial': m.initialReading ?? '',
            'Ano Fabricação': m.yearManufacture || '',
            'Status': m.status || '',
            'Cadastrado em': m.createdAt?.toLocaleDateString('pt-BR') || '',
        })});

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const colWidths = Object.keys(exportData[0] || {}).map(k => ({
            wch: Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Medidores');
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `medidores_${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error('Error exporting meters:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
