import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PermissionAction, PermissionableEntity } from "@prisma/client";
import { validateUserSession } from "@/lib/users";

type PermissionLike = { entity: PermissionableEntity; action: PermissionAction };
const PRIVILEGED_ROLE_NAMES = new Set(["programador", "administrador"]);

function normalizeRoleName(name?: string | null): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

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
        roleId: true,
      },
      take: 1000,
    });

    const roleIds = [...new Set(assignments.map((a) => a.roleId).filter(Boolean))];
    const roles = roleIds.length > 0
      ? await prisma.role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, name: true },
        })
      : [];
    const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

    const hasSystemLike = assignments.some((a) => {
      if (a.contextType === "system") return true;
      const roleName = roleNameById.get(a.roleId);
      return PRIVILEGED_ROLE_NAMES.has(normalizeRoleName(roleName));
    });

    if (hasSystemLike) {
      return NextResponse.json({ permissions: getAllPermissions() });
    }

    if (roleIds.length === 0) {
      return NextResponse.json({ permissions: [] });
    }

    const permissions = await prisma.permission.findMany({
      where: {
        roleId: { in: roleIds },
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: {
        entity: true,
        action: true,
      },
      take: 2000,
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

