/**
 * Code constant, NOT a database column (T3.2 design D9). A DB column is
 * writable through the very API it protects; the roles are seeded by
 * migration 0015 and not user-creatable, so a code map loses no
 * flexibility.
 */
export const ROLE_RANK: Record<string, number> = {
  master: 1,
  operador_sistema: 2,
  admin_org: 3,
  operador_org: 4,
  reporter: 5,
};

/**
 * Unknown or NULL role -> `Number.MAX_SAFE_INTEGER` (safe: manages
 * nobody, since every real rank is strictly less).
 */
export function rankOf(roleName: string | null): number {
  if (roleName === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return ROLE_RANK[roleName] ?? Number.MAX_SAFE_INTEGER;
}
