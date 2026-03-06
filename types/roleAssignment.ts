import { RoleAssignment } from "@prisma/client";

export interface RoleAssignmentWithRoleAndUser extends RoleAssignment {
    Role: {
        id: string;
        name: string;
    };
    User: {
        id: string;
        name: string;
    };
    contextName?: string; // Nome resolvido do contexto
};