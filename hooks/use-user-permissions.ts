import { useEffect, useState } from 'react';
import { getCachedPermissions, setCachedPermissions } from '@/lib/permissions-cache';
import { Permission } from '@prisma/client';

export function useUserPermissions() {
  const [permissions, setPermissions] = useState<Partial<Permission> | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      setLoading(true);
      // Tenta pegar do cache
      const cached = getCachedPermissions();
      if (cached) {
        setPermissions(cached);
        setLoading(false);
      }
      // Sempre tenta atualizar do backend
      try {
        const res = await fetch('/api/user-permissions');
        if (res.ok) {
          const data = await res.json();
          setPermissions(data.permissions ?? data);
          setCachedPermissions(data.permissions ?? data);
        }
      } catch {}
      setLoading(false);
    }
    fetchPermissions();
  }, []);

  return { permissions, loading };
}
