// src/hooks/useFilters.ts
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { DiscoverFilters, updateUserProfile } from '@/services/firestoreService';

export const DEFAULT_FILTERS: DiscoverFilters = {
  ageMin: 18,
  ageMax: 60,
  uf: 'all',
  gender: 'all',
  lookingFor: 'all',
  verifiedOnly: false,
};

interface UseFiltersReturn {
  filters: DiscoverFilters;
  loading: boolean;
  error: Error | null;
  saveFilters: (next: DiscoverFilters) => Promise<void>;
  clearFilters: () => Promise<void>;
}

export function useFilters(): UseFiltersReturn {
  const { user, profile, refreshProfile } = useAuth();
  const [filters, setFilters] = useState<DiscoverFilters>({
    ...DEFAULT_FILTERS,
    ...(profile?.filters ?? {}),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setFilters({ ...DEFAULT_FILTERS, ...(profile?.filters ?? {}) });
  }, [profile?.filters]);

  const saveFilters = useCallback(
    async (next: DiscoverFilters) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        await updateUserProfile(user.uid, { filters: next });
        setFilters(next);
        await refreshProfile();
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Não foi possível salvar os filtros.'));
      } finally {
        setLoading(false);
      }
    },
    [user, refreshProfile],
  );

  const clearFilters = useCallback(() => saveFilters(DEFAULT_FILTERS), [saveFilters]);

  return { filters, loading, error, saveFilters, clearFilters };
}
