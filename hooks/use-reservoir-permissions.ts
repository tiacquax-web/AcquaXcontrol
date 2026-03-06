import { usePermissionChecker } from './use-permission-checker'

/**
 * Hook customizado para verificar permissões específicas dos reservatórios
 */
export function useReservoirPermissions() {
  const { hasPermission } = usePermissionChecker()

  const canViewReservoirs = () => hasPermission('reservoir', 'read')
  const canCreateReservoirs = () => hasPermission('reservoir', 'create')
  const canUpdateReservoirs = () => hasPermission('reservoir', 'update')
  const canDeleteReservoirs = () => hasPermission('reservoir', 'delete')

  const canViewReservoirReadings = () => hasPermission('reservoirReading', 'read')
  const canCreateReservoirReadings = () => hasPermission('reservoirReading', 'create')
  const canUpdateReservoirReadings = () => hasPermission('reservoirReading', 'update')
  const canDeleteReservoirReadings = () => hasPermission('reservoirReading', 'delete')

  // Permissões combinadas para facilitar uso
  const hasAnyReservoirPermission = () => 
    canViewReservoirs() || canCreateReservoirs() || canUpdateReservoirs() || canDeleteReservoirs()

  const hasAnyReservoirReadingPermission = () => 
    canViewReservoirReadings() || canCreateReservoirReadings() || canUpdateReservoirReadings() || canDeleteReservoirReadings()

  const hasFullReservoirAccess = () => 
    canViewReservoirs() && canCreateReservoirs() && canUpdateReservoirs() && canDeleteReservoirs()

  return {
    // Permissões individuais de reservatórios
    canViewReservoirs,
    canCreateReservoirs,
    canUpdateReservoirs,
    canDeleteReservoirs,
    
    // Permissões individuais de leituras
    canViewReservoirReadings,
    canCreateReservoirReadings,
    canUpdateReservoirReadings,
    canDeleteReservoirReadings,
    
    // Permissões combinadas
    hasAnyReservoirPermission,
    hasAnyReservoirReadingPermission,
    hasFullReservoirAccess,
  }
}
