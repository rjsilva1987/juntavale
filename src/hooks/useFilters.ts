// src/hooks/useFilters.ts
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { DiscoverFilters, updateUserProfile } from '@/services/firestoreService';

export const DEFAULT_FILTERS: DiscoverFilters = {
  ageMin: 18,
  ageMax: 60,
  maxDistance: 50,
  gender: 'all',
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
  const [filters, setFilters] = useState<DiscoverFilters>(profile?.filters ?? DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setFilters(profile?.filters ?? DEFAULT_FILTERS);
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
