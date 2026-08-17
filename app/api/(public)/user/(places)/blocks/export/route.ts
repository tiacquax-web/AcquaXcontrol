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
        const contexts = await getUserContextsForActionOnEntity(userId, 'block', 'read');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0 || contexts.blockIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', complexId = '', blockIds = [] } = body;

        const where: any = { deletedAt: null };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (complexId) where.complexId = complexId;
        if (blockIds.length > 0) where.id = { in: blockIds };

        const blocks = await prisma.block.findMany({
            where,
            select: {
                id: true,
                name: true,
                status: true,
                createdAt: true,
                complex: { select: { socialName: true } },
                _count: { select: { apartments: true } }
            },
            orderBy: [{ complex: { socialName: 'asc' } }, { name: 'asc' }],
        });

        if (blocks.length === 0) return NextResponse.json({ error: 'Nenhum bloco encontrado' }, { status: 404 });

        const exportData = blocks.map(b => ({
            'Nome do Bloco': b.name || '',
            'Condomínio': b.complex?.socialName || '',
            'Status': b.status || '',
            'Qtd Apartamentos': b._count.apartments,
            'Cadastrado em': b.createdAt?.toLocaleDateString('pt-BR') || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const colWidths = Object.keys(exportData[0] || {}).map(k => ({
            wch: Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Blocos');
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `blocos_${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error('Error exporting blocks:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
