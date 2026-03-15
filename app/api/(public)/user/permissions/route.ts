import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma";
import {
    createEntity,
    getEntityListData,
} from "@/lib/userData";
import { validateUserSession } from "@/lib/users";
import { ContextType, PermissionAction, PermissionableEntity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const PRIVILEGED_ROLE_NAMES = new Set(['programador', 'administrador']);

function normalizeRoleName(name?: string | null): string {
    return String(name || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
}

function getAllPermissions() {
    const actions = Object.values(PermissionAction);
    const entities = Object.values(PermissionableEntity);
    const result: { entity: PermissionableEntity; action: PermissionAction }[] = [];
    for (const entity of entities) {
        for (const action of actions) {
            result.push({ entity, action });
        }
    }
    return result;
}

function getQueryParams(req: NextRequest) {
    // query params - custom
    const roleId = req.nextUrl.searchParams.get("role_id") || undefined;
    const action = req.nextUrl.searchParams.get("action") || undefined;
    const entity = req.nextUrl.searchParams.get("entity") || undefined;

    // query params - default
    const search = req.nextUrl.searchParams.get("search") || "";
    const take = parseInt(req.nextUrl.searchParams.get("take") || "15");
    const skip = parseInt(req.nextUrl.searchParams.get("skip") || "0");
    const orderBy = req.nextUrl.searchParams.get("orderBy") || "createdAt";
    const orderDirection = req.nextUrl.searchParams.get("orderDirection") || "desc";

    return { roleId, action, entity, search, take, skip, orderBy, orderDirection };
}

export async function GET(req: NextRequest): Promise<Response> {
    try {
        // validate user session (cookie or JWT)
        const { userId, error: sessionError, status: sessionStatus } = await validateUserSession(req);
        if (sessionError || !userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: sessionStatus || 401 });
        }

        // get query params
        const { roleId, action, entity, search, take, skip, orderBy, orderDirection } =
            getQueryParams(req);

        // identify context
        const contextType: ContextType | undefined = undefined;
        const contextId = undefined;

        // extra where
        const where = {
            roleId: roleId,
            action: action,
            entity: entity,
        };

        console.log("######### Where:", where);
        console.log("######### Context Type:", contextType);

        // Programador/Administrador com qualquer contexto recebe todas as permissões no UI
        const assignments = await prisma.roleAssignment.findMany({
            where: {
                userId,
                OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
            select: { contextType: true, roleId: true },
        });
        const roleIds = [...new Set(assignments.map((a) => a.roleId).filter(Boolean))];
        const roles = roleIds.length > 0
            ? await prisma.role.findMany({
                where: { id: { in: roleIds } },
                select: { id: true, name: true },
            })
            : [];
        const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
        const isPrivileged = assignments.some((a) =>
            a.contextType === ContextType.system ||
            PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(roleNameById.get(a.roleId)))
        );

        if (isPrivileged) {
            const allPermissions = getAllPermissions();
            return NextResponse.json({ list: allPermissions, totalCount: allPermissions.length });
        }

        // get permissions
        const { entity: permissions, error, status, totalCount } = await getEntityListData( userId, "permission", contextType, contextId, search, where, take, {}, skip, orderBy, orderDirection as 'asc' | 'desc' );
        if (error) return NextResponse.json({ error }, { status });
        if (!permissions) return NextResponse.json({ error: "Internal Server Error - Entity not found" },{ status: 500 });

        console.log("######### Permissions found:", permissions.length);

        return NextResponse.json({ list: permissions, totalCount });
    } catch (error: any) {
        console.error("Error fetching permissions:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        // Validate user session
        const { userId, error: sessionError, status: sessionStatus } =
            await validateUserSession(req);
        if (sessionError)
            return NextResponse.json({ sessionError }, { status: sessionStatus });
        if (!userId)
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

        // Parse request body
        const reqBody = await req.json();
        const body = cleanEntityBody(reqBody); // Clean the body to remove unwanted fields

        // Validate request body
        if (!body)
            return NextResponse.json({ error: "No body was informed." }, { status: 400 });
        if (Object.keys(body).length === 0)
            return NextResponse.json({ error: "No body was informed." }, { status: 400 });

        // Validate required fields for Permission
        if (!body.action || !body.entity || !body.roleId) {
            return NextResponse.json(
                { error: "Missing required fields: action, entity, or roleId." },
                { status: 400 }
            );
        }

        // Attempt to create the entity
        const { entity: permission, error: creationError, status: creationStatus } =
            await createEntity(userId, "permission", body);
        if (creationError)
            return NextResponse.json({ error: creationError }, { status: creationStatus });
        if (!permission)
            return NextResponse.json(
                { error: "Internal Server Error - Entity not created" },
                { status: 500 }
            );

        // Return the created entity data
        return NextResponse.json(permission);
    } catch (error: any) {
        // Log and handle unexpected errors
        console.error("Error creating permission:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}