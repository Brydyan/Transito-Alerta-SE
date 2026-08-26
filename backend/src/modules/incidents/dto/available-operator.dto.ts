/**
 * One entry in GET /api/incidents/:id/available-operators. Slim on purpose
 * — the frontend only needs enough to render an assignee dropdown.
 */
export class AvailableOperatorDto {
  id!: string;
  name!: string;
  email!: string | null;
  activeClaimCount!: number;
}
