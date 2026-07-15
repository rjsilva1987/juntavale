// src/utils/interests.ts

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
