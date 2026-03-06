import { useMemo } from 'react'
import { useUserPermissions } from './use-user-permissions'

type PermissionChecker = (entity: string, action: string) => boolean

export function usePermissionChecker() {
  const { permissions, loading } = useUserPermissions()

  const hasPermission = useMemo<PermissionChecker>(() => {
    if (!permissions) {
      return (_entity: string, _action: string) => false
    }

    const perms = permissions as any

    if (Array.isArray(perms)) {
      return (entity: string, action: string) =>
        perms.some((permission: any) =>
          permission.entity === entity &&
          permission.action === action
        )
    }

    if (perms.permissions && Array.isArray(perms.permissions)) {
      return (entity: string, action: string) =>
        perms.permissions.some((permission: any) =>
          permission.entity === entity &&
          permission.action === action
        )
    }

    return (_entity: string, _action: string) => false
  }, [permissions])

  return { hasPermission, loading }
}
