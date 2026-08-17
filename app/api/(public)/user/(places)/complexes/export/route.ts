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
        const contexts = await getUserContextsForActionOnEntity(userId, 'complex', 'read');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 || contexts.complexIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', complexIds = [] } = body;

        const where: any = { deletedAt: null };
        if (search) {
            where.OR = [
                { socialName: { contains: search, mode: 'insensitive' } },
                { aliasName: { contains: search, mode: 'insensitive' } },
                { documentCompany: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (complexIds.length > 0) where.id = { in: complexIds };

        const complexes = await prisma.complex.findMany({
            where,
            select: {
                id: true,
                socialName: true,
                aliasName: true,
                documentCompany: true,
                city: true,
                state: true,
                street: true,
                number: true,
                telephone: true,
                cell: true,
                status: true,
                createdAt: true,
                _count: { select: { blocks: true } }
            },
            orderBy: { socialName: 'asc' },
        });

        if (complexes.length === 0) return NextResponse.json({ error: 'Nenhum condomínio encontrado' }, { status: 404 });

        const exportData = complexes.map(c => ({
            'Nome': c.socialName || '',
            'Nome Fantasia': c.aliasName || '',
            'CNPJ': c.documentCompany || '',
            'Cidade': c.city || '',
            'Estado': c.state || '',
            'Endereço': [c.street, c.number].filter(Boolean).join(', ') || '',
            'Telefone': c.telephone || '',
            'Celular': c.cell || '',
            'Status': c.status || '',
            'Blocos': c._count.blocks,
            'Cadastrado em': c.createdAt?.toLocaleDateString('pt-BR') || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const colWidths = Object.keys(exportData[0] || {}).map(k => ({
            wch: Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Condomínios');
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `condominios_${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error('Error exporting complexes:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
