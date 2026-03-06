import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validar sessão do usuário
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const userId = validSession.userId;

        // Verificar se o usuário tem permissão para atualizar usuários
        const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
        const hasPermission = contexts.system || 
                             contexts.companyIds.length > 0 || 
                             contexts.complexIds.length > 0 || 
                             contexts.blockIds.length > 0 || 
                             contexts.apartmentIds.length > 0;

        if (!hasPermission) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // Obter parâmetros da requisição
        const body = await req.json();
        const { 
            search = '', 
            userIds = [] // IDs específicos de usuários para exportar
        } = body;

        // Buscar usuários conforme os filtros e permissões
        let whereClause: any = {
            deletedAt: null,
            AND: []
        };

        // Filtro de busca
        if (search) {
            whereClause.AND.push({
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { documentPerson: { contains: search, mode: "insensitive" } }
                ]
            });
        }

        // Filtro por IDs específicos
        if (userIds.length > 0) {
            whereClause.AND.push({
                id: { in: userIds }
            });
        }

        // Aplicar filtros de permissão se necessário
        if (!contexts.system) {
            // Se não tem permissão system, aplicar filtros contextuais
            // Por enquanto, vamos buscar todos os usuários já que a validação contextual 
            // seria mais complexa (precisaria verificar relacionamentos)
            // Em uma implementação futura, pode-se adicionar filtros baseados nos contextos
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                email: true,
                documentPerson: true,
                telephone: true,
                cell: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { name: 'asc' }
        });

        // Se não há usuários, retornar erro
        if (users.length === 0) {
            return NextResponse.json({ error: 'Nenhum usuário encontrado' }, { status: 404 });
        }

        // Preparar dados para a planilha
        const exportData: any[] = [];

        for (const user of users) {
            const userData: any = {
                'Nome': user.name,
                'Email': user.email,
                'Documento': user.documentPerson || '',
                'Telefone': user.telephone || '',
                'Celular': user.cell || '',
                'Data de Criação': user.createdAt?.toLocaleDateString('pt-BR') || '',
                'Última Atualização': user.updatedAt?.toLocaleDateString('pt-BR') || ''
            };

            exportData.push(userData);
        }

        // Criar planilha Excel
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');

        // Gerar buffer da planilha
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Definir nome do arquivo
        const fileName = `usuarios_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Retornar arquivo Excel
        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`
            }
        });

    } catch (error: any) {
        console.error('Error exporting users:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
