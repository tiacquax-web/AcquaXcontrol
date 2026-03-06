import { useEffect, useState } from 'react';
import { fetchUserPreferences, updateUserPreferences } from '@/services/userPreferencesService';

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<{ meters?: string[] } | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = async () => {
    setLoading(true);
    setError(null);
    try {
      const { preferences: prefs, error: fetchError } = await fetchUserPreferences();
      if (fetchError) {
        setError(fetchError);
        setPreferences(undefined);
      } else {
        setPreferences(prefs);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar preferências');
      setPreferences(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  return { preferences, loading, error, refetch: fetchPreferences };
}

export function useUpdateUserPreferences() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updatePreferences(meters: string[]) {
    setLoading(true);
    setError(null);
    try {
      const { preferences: prefs, error: updateError } = await updateUserPreferences(meters);
      if (updateError) {
        setError(updateError);
        throw new Error(updateError);
      }
      return prefs;
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar preferências');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { updatePreferences, loading, error };
}
