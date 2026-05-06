import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

const sanitizeSheetName = (name: string) =>
  name.replace(/[\\/*?:[\]]/g, '').substring(0, 31);

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const session = req.cookies.get('session')?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const userId = validSession.userId;
        const contexts = await getUserContextsForActionOnEntity(userId, 'user', 'update');
        const hasPermission = contexts.system || contexts.companyIds.length > 0 ||
            contexts.complexIds.length > 0 || contexts.blockIds.length > 0 || contexts.apartmentIds.length > 0;
        if (!hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', userIds = [], complexId = '', roleId = '' } = body;

        // Se filtro por condomínio: buscar os userId vinculados ao complexId via RoleAssignment
        let filteredByComplexUserIds: string[] | null = null;
        if (complexId) {
            // Busca usuários com RoleAssignment no contexto do condomínio, bloco ou apt do condomínio
            const blockIds = (await prisma.block.findMany({
                where: { complexId, deletedAt: null }, select: { id: true }
            })).map(b => b.id);
            const aptIds = (await prisma.apartment.findMany({
                where: { complexId, deletedAt: null }, select: { id: true }
            })).map(a => a.id);

            const assigns = await prisma.roleAssignment.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { contextId: complexId, contextType: 'complex' },
                        { contextId: { in: blockIds }, contextType: 'block' },
                        { contextId: { in: aptIds }, contextType: 'apartment' },
                    ]
                },
                select: { userId: true }
            });
            filteredByComplexUserIds = [...new Set(assigns.map(a => a.userId))];
        }

        // Se filtro por papel
        let filteredByRoleUserIds: string[] | null = null;
        if (roleId) {
            const assigns = await prisma.roleAssignment.findMany({
                where: { roleId, deletedAt: null },
                select: { userId: true }
            });
            filteredByRoleUserIds = [...new Set(assigns.map(a => a.userId))];
        }

        // Construir cláusula where
        const andClauses: any[] = [{ deletedAt: null }];
        if (search) {
            andClauses.push({ OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ]});
        }
        if (userIds.length > 0) andClauses.push({ id: { in: userIds } });
        if (filteredByComplexUserIds && filteredByComplexUserIds.length > 0) {
  andClauses.push({ id: { in: filteredByComplexUserIds } });
}

if (filteredByRoleUserIds && filteredByRoleUserIds.length > 0) {
  andClauses.push({ id: { in: filteredByRoleUserIds } });
}

        const users = await prisma.user.findMany({
            where: { AND: andClauses },
            select: { id: true, name: true, email: true, documentPerson: true, telephone: true, cell: true, createdAt: true },
            orderBy: { name: 'asc' },
        });

        if (users.length === 0) {
  const worksheet = XLSX.utils.json_to_sheet([]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');

  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(excelBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="usuarios_vazio.xlsx"',
    },
  });
}

        // Buscar papel de cada usuário
        const allAssigns = await prisma.roleAssignment.findMany({
            where: { userId: { in: users.map(u => u.id) }, deletedAt: null },
            select: { userId: true, roleId: true, contextType: true, contextId: true }
        });
        const allRoleIds = [...new Set(allAssigns.map(a => a.roleId))];
        const roles = await prisma.role.findMany({ where: { id: { in: allRoleIds } }, select: { id: true, name: true } });
        const roleMap: Record<string, string> = {};
        roles.forEach(r => { roleMap[r.id] = r.name; });

        // Buscar nome do condomínio se filtro ativo
        let complexName = '';
        if (complexId) {
            const cx = await prisma.complex.findUnique({ where: { id: complexId }, select: { socialName: true } });
            complexName = cx?.socialName || '';
        }

        // Montar planilha
        const exportData = users.map(user => {
            const assigns = allAssigns.filter(a => a.userId === user.id);
            const papeis = assigns.map(a => roleMap[a.roleId] || a.roleId).join(', ');
            return {
                'Nome': user.name,
                'Email': user.email,
                'Documento': user.documentPerson || '',
                'Telefone': user.telephone || '',
                'Celular': user.cell || '',
                'Papéis': papeis,
                'Data de Cadastro': user.createdAt
  ? new Date(user.createdAt)
      .toISOString()
      .split('T')[0]
      .split('-')
      .reverse()
      .join('/')
  : '',
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        // Auto-largura de colunas
        const colWidths = Object.keys(exportData[0] || {}).map(k => ({
            wch: Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        const sanitizeSheetName = (name: string) =>
  name.replace(/[\\/*?:[\]]/g, '').substring(0, 31);

const sheetName = complexName
  ? sanitizeSheetName(`Usuários - ${complexName}`)
  : 'Usuários';
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `usuarios_${complexName ? complexName.replace(/\s+/g, '_') + '_' : ''}${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error('Error exporting users:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
