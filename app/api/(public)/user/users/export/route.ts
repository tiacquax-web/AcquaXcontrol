import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { getAccessibleUserIdsForAction, getTemporaryPasswordFromPreferences } from '@/lib/userAccess';

const NOT_DELETED = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } as const;
const EXCEL_SHEET_NAME_MAX_LENGTH = 31;
const EXPORT_HEADERS = ['Unidade', 'Bloco', 'email', 'senha', 'papel'] as const;

function buildExportSheetName(complexName?: string) {
    const defaultName = 'Usuários';
    if (!complexName?.trim()) return defaultName;

    const sanitizedComplexName = complexName
        .replace(/[:\\/?*\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const prefix = `${defaultName} - `;
    const availableLength = EXCEL_SHEET_NAME_MAX_LENGTH - prefix.length;
    if (availableLength <= 0) return defaultName.substring(0, EXCEL_SHEET_NAME_MAX_LENGTH);

    const truncatedComplexName = sanitizedComplexName.substring(0, availableLength).trim();
    if (!truncatedComplexName) return defaultName;

    return `${prefix}${truncatedComplexName}`;
}

function mergeUserIdScope(current: Set<string> | null, nextIds: string[]) {
    if (current === null) return new Set(nextIds);
    const nextSet = new Set(nextIds);
    return new Set([...current].filter((id) => nextSet.has(id)));
}

async function getUserIdsByContextFilter(complexId?: string): Promise<string[] | null> {
    if (!complexId) return null;

    const blockIds = (await prisma.block.findMany({
        where: { ...NOT_DELETED, complexId },
        select: { id: true }
    })).map((b) => b.id);

    const aptIds = (await prisma.apartment.findMany({
        where: { ...NOT_DELETED, complexId },
        select: { id: true }
    })).map((a) => a.id);

    const assigns = await prisma.roleAssignment.findMany({
        where: {
            ...NOT_DELETED,
            OR: [
                { contextId: complexId, contextType: 'complex' },
                ...(blockIds.length > 0 ? [{ contextId: { in: blockIds }, contextType: 'block' as const }] : []),
                ...(aptIds.length > 0 ? [{ contextId: { in: aptIds }, contextType: 'apartment' as const }] : []),
            ]
        },
        select: { userId: true }
    });

    return [...new Set(assigns.map((a) => a.userId))];
}

async function getUserIdsByRoleFilter(roleId?: string): Promise<string[] | null> {
    if (!roleId) return null;
    const assigns = await prisma.roleAssignment.findMany({
        where: { ...NOT_DELETED, roleId },
        select: { userId: true }
    });
    return [...new Set(assigns.map((a) => a.userId))];
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError) return NextResponse.json({ error: sessionError }, { status: sessionStatus });
        if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const access = await getAccessibleUserIdsForAction(userId, 'read');
        if (!access.hasPermission) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await req.json();
        const { search = '', userIds = [], complexId = '', roleId = '' } = body;
        let scopedIds: Set<string> | null = access.isSystem ? null : new Set(access.userIds);
        const idsByContext = await getUserIdsByContextFilter(complexId || undefined);
        if (idsByContext) scopedIds = mergeUserIdScope(scopedIds, idsByContext);
        const idsByRole = await getUserIdsByRoleFilter(roleId || undefined);
        if (idsByRole) scopedIds = mergeUserIdScope(scopedIds, idsByRole);
        if (Array.isArray(userIds) && userIds.length > 0) {
            scopedIds = mergeUserIdScope(scopedIds, userIds);
        }

        // Construir cláusula where
        const andClauses: any[] = [NOT_DELETED];
        if (search) {
            andClauses.push({ OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ]});
        }
        if (scopedIds) andClauses.push({ id: { in: [...scopedIds] } });

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

        const apartmentContextIds = [...new Set(allAssigns
            .filter((a) => a.contextType === 'apartment')
            .map((a) => a.contextId))];
        const blockContextIds = [...new Set(allAssigns
            .filter((a) => a.contextType === 'block')
            .map((a) => a.contextId))];

        const apartments = apartmentContextIds.length > 0
            ? await prisma.apartment.findMany({
                where: { ...NOT_DELETED, id: { in: apartmentContextIds } },
                select: {
                    id: true,
                    name: true,
                    block: { select: { id: true, name: true } },
                },
            })
            : [];

        const blocks = blockContextIds.length > 0
            ? await prisma.block.findMany({
                where: { ...NOT_DELETED, id: { in: blockContextIds } },
                select: { id: true, name: true },
            })
            : [];

        const apartmentMap = new Map(apartments.map((a) => [
            a.id,
            { name: a.name, blockName: a.block?.name || '' },
        ]));
        const blockMap = new Map(blocks.map((b) => [b.id, b.name]));

        // Buscar nome do condomínio se filtro ativo
        let complexName = '';
        if (complexId) {
            const cx = await prisma.complex.findUnique({ where: { id: complexId }, select: { socialName: true } });
            complexName = cx?.socialName || '';
        }

        // Montar planilha
        const exportData = users.map(user => {
            const assigns = allAssigns.filter(a => a.userId === user.id);
            const papeis = [...new Set(assigns.map(a => roleMap[a.roleId] || a.roleId))].join(', ');
            const unitNames = new Set<string>();
            const blockNames = new Set<string>();

            assigns.forEach((assignment) => {
                if (assignment.contextType === 'apartment') {
                    const apartmentInfo = apartmentMap.get(assignment.contextId);
                    if (apartmentInfo?.name) unitNames.add(apartmentInfo.name);
                    if (apartmentInfo?.blockName) blockNames.add(apartmentInfo.blockName);
                    return;
                }

                if (assignment.contextType === 'block') {
                    const blockName = blockMap.get(assignment.contextId);
                    if (blockName) blockNames.add(blockName);
                }
            });

            const temporaryPassword = getTemporaryPasswordFromPreferences(user.preferences);
            return {
                Unidade: [...unitNames].join(', '),
                Bloco: [...blockNames].join(', '),
                email: user.email,
                senha: temporaryPassword || '',
                papel: papeis,
            };
        });

        exportData.sort((a, b) =>
            `${a.Bloco}|${a.Unidade}|${a.email}`.localeCompare(`${b.Bloco}|${b.Unidade}|${b.email}`, 'pt-BR')
        );

        const worksheet = XLSX.utils.json_to_sheet(exportData, { header: [...EXPORT_HEADERS] });
        const colWidths = [...EXPORT_HEADERS].map((header) => ({
            wch: Math.max(
                header.length,
                ...exportData.map((row) => String(row[header] || '').length),
                12
            ) + 2
        }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        const sheetName = buildExportSheetName(complexName);
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
