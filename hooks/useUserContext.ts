import { useState, useEffect } from 'react';
import axios from 'axios';

const NEXT_PUBLIC_API_URL = '/api';

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
  glComplexIds: string[];  // IDs de condomínios com medidores GL ativos
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
        const res = await axios.get(`${NEXT_PUBLIC_API_URL}/auth/my-context`, {
          withCredentials: true,
        });
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
