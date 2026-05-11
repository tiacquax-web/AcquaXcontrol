import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid } from '@/lib/users';
import { getUserContextsForActionOnEntity } from '@/lib/userContexts';
import { getTemporaryPasswordFromPreferences } from '@/lib/userAccess';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

const MAX_XLSX_CELL_LENGTH = 32767;
const MAX_XLSX_COLUMN_WIDTH = 80;

function sanitizeSheetName(name: string) {
    const sanitized = name.replace(/[\\/*?:[\]]/g, '').trim();
    return (sanitized || 'Usuários').substring(0, 31);
}

function sanitizeFileNamePart(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 80);
}

function xlsxCell(value: unknown) {
    const raw = value == null ? '' : String(value);
    return raw.length > MAX_XLSX_CELL_LENGTH ? raw.substring(0, MAX_XLSX_CELL_LENGTH) : raw;
}

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
        const { search = '', userIds = [], complexId = '', blockId = '', apartmentId = '', roleId = '' } = body;

        // Se filtro por contexto: buscar os userId vinculados via RoleAssignment
        let filteredByComplexUserIds: string[] | null = null;
        if (complexId || blockId || apartmentId) {
            let blockIds: string[] = [];
            let aptIds: string[] = [];
            if (apartmentId) {
                const apartment = await prisma.apartment.findFirst({
                    where: {
                        id: apartmentId,
                        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
                    },
                    select: { id: true, blockId: true, complexId: true },
                });
                if (!apartment || (blockId && apartment.blockId !== blockId) || (complexId && apartment.complexId !== complexId)) {
                    filteredByComplexUserIds = [];
                } else {
                    aptIds = [apartment.id];
                    blockIds = apartment.blockId ? [apartment.blockId] : [];
                }
            } else {
                blockIds = blockId ? [blockId] : (await prisma.block.findMany({
                    where: { complexId, deletedAt: null }, select: { id: true }
                })).map(b => b.id);
                aptIds = (await prisma.apartment.findMany({
                    where: { OR: [
                        ...(complexId ? [{ complexId, deletedAt: null }] : []),
                        ...(blockId ? [{ blockId, deletedAt: null }] : []),
                    ]}, select: { id: true }
                })).map(a => a.id);
            }

            const contextFilters = apartmentId
                ? [{ contextId: { in: aptIds }, contextType: 'apartment' as const }]
                : blockId
                    ? [
                        ...(blockIds.length ? [{ contextId: { in: blockIds }, contextType: 'block' as const }] : []),
                        ...(aptIds.length ? [{ contextId: { in: aptIds }, contextType: 'apartment' as const }] : []),
                    ]
                    : [
                        ...(complexId ? [{ contextId: complexId, contextType: 'complex' as const }] : []),
                        ...(blockIds.length ? [{ contextId: { in: blockIds }, contextType: 'block' as const }] : []),
                        ...(aptIds.length ? [{ contextId: { in: aptIds }, contextType: 'apartment' as const }] : []),
                    ];

            const assigns = await prisma.roleAssignment.findMany({
                where: {
                    deletedAt: null,
                    OR: contextFilters
                },
                select: { userId: true }
            });
            filteredByComplexUserIds = filteredByComplexUserIds ?? [...new Set(assigns.map(a => a.userId))];
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
        if (filteredByComplexUserIds !== null) andClauses.push({ id: { in: filteredByComplexUserIds } });
        if (filteredByRoleUserIds !== null) andClauses.push({ id: { in: filteredByRoleUserIds } });

        const users = await prisma.user.findMany({
            where: { AND: andClauses },
            select: { id: true, name: true, email: true, documentPerson: true, telephone: true, cell: true, createdAt: true, preferences: true },
            orderBy: { name: 'asc' },
        });

        if (users.length === 0) return NextResponse.json({ error: 'Nenhum usuário encontrado' }, { status: 404 });

        // Buscar papel de cada usuário
        const allAssigns = await prisma.roleAssignment.findMany({
            where: { userId: { in: users.map(u => u.id) }, deletedAt: null },
            select: { userId: true, roleId: true, contextType: true, contextId: true }
        });
        const allRoleIds = [...new Set(allAssigns.map(a => a.roleId))];
        const roles = await prisma.role.findMany({ where: { id: { in: allRoleIds } }, select: { id: true, name: true } });
        const roleMap: Record<string, string> = {};
        roles.forEach(r => { roleMap[r.id] = r.name; });
        const assignmentsByUserId = new Map<string, typeof allAssigns>();
        for (const assignment of allAssigns) {
            const current = assignmentsByUserId.get(assignment.userId);
            if (current) current.push(assignment);
            else assignmentsByUserId.set(assignment.userId, [assignment]);
        }

        // Buscar nome do condomínio se filtro ativo
        let complexName = '';
        if (complexId) {
            const cx = await prisma.complex.findUnique({ where: { id: complexId }, select: { socialName: true } });
            complexName = cx?.socialName || '';
        }

        // Montar planilha
        const exportData = users.map(user => {
            const assigns = assignmentsByUserId.get(user.id) || [];
            const papeis = assigns.map(a => roleMap[a.roleId] || a.roleId).join(', ');
            const temporaryPassword = getTemporaryPasswordFromPreferences(user.preferences);
            return {
                'Nome': xlsxCell(user.name),
                'Email': xlsxCell(user.email),
                'Senha': xlsxCell(temporaryPassword),
                'Documento': xlsxCell(user.documentPerson || ''),
                'Telefone': xlsxCell(user.telephone || ''),
                'Celular': xlsxCell(user.cell || ''),
                'Papéis': xlsxCell(papeis),
                'Data de Cadastro': xlsxCell(user.createdAt?.toLocaleDateString('pt-BR') || ''),
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        // Auto-largura de colunas
        const colWidths = Object.keys(exportData[0] || {}).map(k => ({
            wch: Math.min(
                MAX_XLSX_COLUMN_WIDTH,
                Math.max(k.length, ...exportData.map(r => String((r as any)[k] || '').length)) + 2
            )
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        const sheetName = complexName
            ? sanitizeSheetName(`Usuários - ${complexName}`)
            : 'Usuários';
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const safeComplexName = complexName ? `${sanitizeFileNamePart(complexName)}_` : '';
        const fileName = `usuarios_${safeComplexName}${new Date().toISOString().split('T')[0]}.xlsx`;

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
