import { cleanEntityBody, isValidPermissionableEntity } from "@/lib/prisma";
import {
    createEntity,
    deleteEntity,
    getAvailableComplexesForEntity,
    getEntityListData,
    updateEntityData,
} from "@/lib/userData";
import { isSessionValid, validateUserSession } from "@/lib/users";
import { ContextType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

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
        // validate user session
        const session = req.cookies.get("session")?.value;
        const validSession = session ? await isSessionValid(session) : false;
        if (!validSession)
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

        // get userId from session
        const userId = validSession.userId;

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