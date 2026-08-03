// src/hooks/useFilters.ts
import { useCallback, useEffect, useState } from 'react';

import { VALES } from '@/constants/vale';
import { useAuth } from '@/contexts/AuthContext';
import { DiscoverFilters, updateUserProfile } from '@/services/firestoreService';

export const DEFAULT_FILTERS: DiscoverFilters = {
  ageMin: 18,
  ageMax: 60,
  uf: 'all',
  gender: [],
  lookingFor: 'all',
  // S83-B — começa com os três marcados: seleção total = filtro inerte (ver
  // getDiscoverProfiles), mesmo comportamento de "sem restrição" que os
  // outros campos expressam com 'all'.
  vale: [...VALES],
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
  const merged = {
    ...DEFAULT_FILTERS,
    ...(profile?.filters ?? {}),
  };
  // S90 — o filtro de genero virou array (multi-selecao). Docs criados
  // antes disto tem filters.gender como STRING ('all' ou um genero). O
  // spread acima deixa o valor salvo vencer, entao sem normalizar aqui a
  // string sobreviveria e quebraria o .includes()/.length do filtro novo.
  // Regra: 'all' e qualquer nao-array viram []  (= sem filtro = todos);
  // uma string de genero solta vira [genero]. Resolve as contas antigas em
  // tempo de leitura, sem migracao de dados.
  if (!Array.isArray(merged.gender)) {
    merged.gender =
      merged.gender === 'masculino' || merged.gender === 'feminino' || merged.gender === 'outro'
        ? [merged.gender]
        : [];
  }
  const [filters, setFilters] = useState<DiscoverFilters>(merged);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const merged = {
      ...DEFAULT_FILTERS,
      ...(profile?.filters ?? {}),
    };
    if (!Array.isArray(merged.gender)) {
      merged.gender =
        merged.gender === 'masculino' || merged.gender === 'feminino' || merged.gender === 'outro'
          ? [merged.gender]
          : [];
    }
    setFilters(merged);
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
