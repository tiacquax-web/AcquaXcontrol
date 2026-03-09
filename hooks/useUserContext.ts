import { useState, useEffect } from 'react';
import axiosClient from '@/services/axiosClient';

export interface ApartmentWithContext {
  id: string;
  name: string;
  block: {
    id: string;
    name: string;
    complexId: string;
    complex: {
      id: string;
      socialName: string;
      aliasName?: string;
      company?: { id: string; name: string };
    };
  };
}

export interface BlockWithContext {
  id: string;
  name: string;
  complexId: string;
  complex: {
    id: string;
    socialName: string;
    aliasName?: string;
    company?: { id: string; name: string };
  };
}

export interface ComplexWithContext {
  id: string;
  socialName: string;
  aliasName?: string;
  company?: { id: string; name: string };
}

export interface UserContext {
  isSystem: boolean;
  systemRoles: string[];   // ex: ['Administrador'] ou ['Programador']
  apartments: ApartmentWithContext[];
  blocks: BlockWithContext[];
  complexes: ComplexWithContext[];
  companyIds: string[];
  accessibleComplexIds: string[];
}

export function useUserContext() {
  const [context, setContext] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchContext() {
      setLoading(true);
      setError(null);
      try {
        const res = await axiosClient.get('/auth/my-context');
        setContext(res.data);
      } catch (err: any) {
        const message = err.response?.data?.error || err.message || 'Erro ao buscar contexto';
        setError(message);
        setContext(null);
      } finally {
        setLoading(false);
      }
    }
    fetchContext();
  }, []);

  return { context, loading, error };
}
