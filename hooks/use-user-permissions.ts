import { useEffect, useState } from 'react';
import { getCachedPermissions, setCachedPermissions } from '@/lib/permissions-cache';
import { Permission } from '@prisma/client';

const SYSTEM_FALLBACK_ENTITIES = [
  'company', 'complex', 'block', 'apartment',
  'user', 'role', 'roleAssignment', 'permission',
  'typeMeter', 'meter', 'iotDevice',
  'reading', 'meterDeviceLink',
  'dealershipReading', 'apartmentConsumptionReport', 'dealership',
  'reservoir', 'reservoirReading',
  'scheduledTask', 'recurringSchedule', 'scheduleOverride',
  'monitoringDashboard', 'generateFilipeta', 'serviceOrder', 'system',
] as const;

const SYSTEM_FALLBACK_ACTIONS = ['create', 'read', 'update', 'delete', 'do'] as const;

function buildSystemFallbackPermissions(): Partial<Permission>[] {
  const out: Partial<Permission>[] = [];
  for (const entity of SYSTEM_FALLBACK_ENTITIES) {
    for (const action of SYSTEM_FALLBACK_ACTIONS) {
      out.push({ entity: entity as any, action: action as any });
    }
  }
  return out;
}

export function useUserPermissions() {
  const [permissions, setPermissions] = useState<Partial<Permission>[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      setLoading(true);
      // Tenta pegar do cache
      const cached = getCachedPermissions();
      if (cached) {
        setPermissions(Array.isArray(cached) ? cached : [cached]);
        setLoading(false);
      }
      // Sempre tenta atualizar do backend
      try {
        const res = await fetch('/api/user-permissions');
        if (res.ok) {
          const data = await res.json();
          const normalized = Array.isArray(data?.permissions)
            ? data.permissions
            : Array.isArray(data)
              ? data
              : [];
          setPermissions(normalized);
          setCachedPermissions(normalized);
        } else {
          // Fallback para usuários de sistema: evita sumiço do menu quando a API de permissões oscila
          const ctxRes = await fetch('/api/auth/my-context');
          if (ctxRes.ok) {
            const context = await ctxRes.json();
            if (context?.isSystem) {
              const systemPermissions = buildSystemFallbackPermissions();
              setPermissions(systemPermissions);
              setCachedPermissions(systemPermissions);
            }
          }
        }
      } catch {}
      setLoading(false);
    }
    fetchPermissions();
  }, []);

  return { permissions, loading };
}
