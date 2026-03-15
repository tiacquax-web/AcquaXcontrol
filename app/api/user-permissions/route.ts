import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PermissionAction, PermissionableEntity } from "@prisma/client";
import { validateUserSession } from "@/lib/users";

type PermissionLike = { entity: PermissionableEntity; action: PermissionAction };

function getAllPermissions(): PermissionLike[] {
  const actions = Object.values(PermissionAction);
  const entities = Object.values(PermissionableEntity);
  const out: PermissionLike[] = [];
  for (const entity of entities) {
    for (const action of actions) {
      out.push({ entity, action });
    }
  }
  return out;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId, error, status } = await validateUserSession(req);
    if (error || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: status || 401 });
    }

    const assignments = await prisma.roleAssignment.findMany({
      where: {
        userId,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: {
        contextType: true,
        Role: {
          select: { name: true },
        },
      },
      take: 1000,
    });

    const hasSystemLike = assignments.some((a) =>
      a.contextType === "system" ||
      a.Role?.name === "Programador" ||
      a.Role?.name === "Administrador"
    );

    if (hasSystemLike) {
      return NextResponse.json({ permissions: getAllPermissions() });
    }

    const permissions = await prisma.permission.findMany({
      where: {
        role: {
          RoleAssignments: {
            some: {
              userId,
              OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            },
          },
        },
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: {
        entity: true,
        action: true,
      },
      take: 5000,
    });

    const dedup = new Map<string, PermissionLike>();
    permissions.forEach((p) => {
      const key = `${p.entity}:${p.action}`;
      if (!dedup.has(key)) dedup.set(key, { entity: p.entity, action: p.action });
    });

    return NextResponse.json({ permissions: Array.from(dedup.values()) });
  } catch (e) {
    console.error("[user-permissions] error:", e);
    return NextResponse.json({ permissions: [] }, { status: 200 });
  }
}

