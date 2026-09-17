import { IsArray, IsUUID } from 'class-validator';

/**
 * DTO for PUT /api/menu-options/:id/endpoints — assign endpoints.
 * Idempotent: re-assigning creates no second row (F5.5.6).
 */
export class AssignEndpointsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  endpointIds!: string[];
}
