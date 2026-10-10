/**
 * One entry in GET /api/incidents/:id/available-operators. F7
 * emergency-dispatch (design D4) — the response now includes every
 * operator (saturated or not) with two new fields:
 *
 *   - `available: boolean`  — `activeClaimCount < maxActive`
 *   - `maxActive: number`   — the per-org cap, so the UI can show
 *                             «3 de 3» instead of a bare «ocupado».
 *
 * The endpoint name (`available-operators`) is now slightly imprecise
 * (a `false` operator is no longer filtered out). Renaming it would
 * break a frontend consumer for a cosmetic reason; the name is
 * documented here so the next reader does not "fix" it without
 * checking the frontend.
 */
export class AvailableOperatorDto {
  id!: string;
  name!: string;
  email!: string | null;
  activeClaimCount!: number;
  /** F7 D4 — `activeClaimCount < maxActive`. */
  available!: boolean;
  /** F7 D4 — the per-org cap. */
  maxActive!: number;
}
