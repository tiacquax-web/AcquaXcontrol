import { useEffect, useState } from 'react';
import { fetchCurrentUser, fetchUpdateCurrentUser } from "@/services/myUserService";
import { User } from '@prisma/client';

export function useCurrentUser() {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchUser() {
      setLoading(true);
      setError(null);
      try {
        const user = await fetchCurrentUser();
        setUser(user);
      } catch (err: any) {
        const message = err.response?.data?.err || err.message || "Unknown error";
        setError(message || 'Erro ao buscar usuário');
        setUser(undefined);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  return { user, loading, error };
}

export function useUpdateCurrentUser() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function updateUser(data: any) {
    setLoading(true);
    setError(null);
    try {
      const updatedUser = await fetchUpdateCurrentUser(data);
      return updatedUser;
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || "Unknown error";
      setError(message || 'Erro ao atualizar usuário');
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { updateUser, loading, error };
}