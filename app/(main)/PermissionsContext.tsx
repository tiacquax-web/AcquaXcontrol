'use client'

import React, { createContext, useContext, useMemo } from 'react';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { Permission } from '@prisma/client';
import { useRolePreview } from '@/contexts/RolePreviewContext';

const PermissionsContext = createContext<{permissions: Partial<Permission>[] | undefined, loading: boolean}>({ permissions: undefined, loading: true });

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { permissions, loading } = useUserPermissions();
  const { isPreviewing, effectivePermissions } = useRolePreview();

  const permissionsArray = useMemo(() => {
    if (isPreviewing && effectivePermissions) {
      return effectivePermissions as Partial<Permission>[];
    }
    return permissions ? (Array.isArray(permissions) ? permissions : [permissions]) : undefined;
  }, [permissions, isPreviewing, effectivePermissions]);

  return (
    <PermissionsContext.Provider value={{ permissions: permissionsArray, loading: isPreviewing ? false : loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext() {
  return useContext(PermissionsContext);
}
