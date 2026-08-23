import { IsUUID } from 'class-validator';

/**
 * T5.6 — `PATCH /api/assignments/:id`. Re-assigns an existing
 * assignment to a different operator. `incident_id` is omitted
 * because the assignment is bound to one incident; the URL `:id`
 * identifies the assignment row.
 */
export class UpdateAssignmentDto {
  @IsUUID()
  operator_id!: string;
}
