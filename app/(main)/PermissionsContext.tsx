'use client'

import React, { createContext, useContext } from 'react';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { Permission } from '@prisma/client';

const PermissionsContext = createContext<{permissions: Partial<Permission>[] | undefined, loading: boolean}>({ permissions: undefined, loading: true });

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { permissions, loading } = useUserPermissions();
  // Ensure permissions is always an array or undefined
  const permissionsArray = permissions ? (Array.isArray(permissions) ? permissions : [permissions]) : undefined;
  return (
    <PermissionsContext.Provider value={{ permissions: permissionsArray, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext() {
  return useContext(PermissionsContext);
}
