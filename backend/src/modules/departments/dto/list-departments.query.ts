import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * GET /api/departments query string (controller layer).
 *
 * `organization_id` is OPTIONAL in the wire contract because the
 * controller is responsible for scoping it to the caller's own org when
 * the caller is `admin_org`. For master, the filter is lifted and
 * this DTO accepts whatever is passed (or none → all orgs).
 *
 * `page` and `per_page` use `@Type(() => Number)` because query strings
 * arrive as strings; without the transformer, `@IsInt()` would reject
 * `?page=2` even when the value is a valid integer.
 */
export class ListDepartmentsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;

  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
