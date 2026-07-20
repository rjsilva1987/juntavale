// src/utils/interests.ts

// S48 — places/events não têm matching entre perfis nesta versão (só
// interests tem, via getSharedInterestSet abaixo). Reaproveitado por
// SwipeScreen e MatchProfileScreen pra passar pro InterestChips sem marcar
// nenhuma tag como "em comum".
export const EMPTY_INTEREST_SET: Set<string> = new Set();

export function normalizeInterest(s: string): string {
  return s.trim().toLowerCase();
}

export function getSharedInterestSet(
  mine?: string[] | null,
  theirs?: string[] | null,
): Set<string> {
  const mineSet = new Set((mine ?? []).map(normalizeInterest));
  const shared = new Set<string>();
  for (const interest of theirs ?? []) {
    const normalized = normalizeInterest(interest);
    if (mineSet.has(normalized)) {
      shared.add(normalized);
    }
  }
  return shared;
}
