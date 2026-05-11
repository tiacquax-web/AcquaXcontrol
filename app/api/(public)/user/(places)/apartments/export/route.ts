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
        const contexts = await getUserContextsForActionOnEntity(userId, 'apartment', 'read');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0 || contexts.blockIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', complexId = '', blockId = '', apartmentIds = [] } = body;

        const where: any = { deletedAt: null };
        if (search) {
            where.OR = [{ name: { contains: search, mode: 'insensitive' } }];
        }
        if (blockId) where.blockId = blockId;
        else if (complexId) where.complexId = complexId;
        if (apartmentIds.length > 0) where.id = { in: apartmentIds };
        where.block = { is: { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } };

        const apartments = await prisma.apartment.findMany({
            where,
            select: {
                id: true,
                name: true,
                status: true,
                createdAt: true,
                block: { select: { name: true, complex: { select: { socialName: true } } } },
                _count: { select: { meters: true } }
            },
            orderBy: [{ block: { complex: { socialName: 'asc' } } }, { block: { name: 'asc' } }, { name: 'asc' }],
        });

        if (apartments.length === 0) return NextResponse.json({ error: 'Nenhum apartamento encontrado' }, { status: 404 });

        const exportData = apartments.map(a => ({
            'Apartamento': a.name || '',
            'Bloco': a.block?.name || '',
            'Condomínio': a.block?.complex?.socialName || '',
            'Status': a.status || '',
            'Medidores': a._count.meters,
            'Cadastrado em': a.createdAt?.toLocaleDateString('pt-BR') || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const colWidths = Object.keys(exportData[0] || {}).map(k => ({
            wch: Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Apartamentos');
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `apartamentos_${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error('Error exporting apartments:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
