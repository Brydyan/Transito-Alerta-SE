import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * F6 — query DTO for `GET /api/audit-logs` and
 * `GET /api/audit-logs/export.csv`.
 *
 * Request DTOs are snake_case to match the wire format
 * (`?date_from=…&actor_id=…`, see main.ts:app.setGlobalPrefix('api')
 * + ValidationPipe with `transform: true`). Field names here are the
 * ones the client sends.
 *
 * `page` / `limit` are coerced from query-string strings to numbers
 * via `@Type(() => Number)` so class-validator's `@IsInt` sees the
 * numeric value instead of the raw string from the URL.
 */
export class AuditLogFilterDto {
  /** Lower bound (inclusive) on `audit_events.created_at`. ISO 8601. */
  @IsOptional()
  @IsDateString()
  date_from?: string;

  /** Upper bound (inclusive) on `audit_events.created_at`. ISO 8601. */
  @IsOptional()
  @IsDateString()
  date_to?: string;

  /** Exact actor UUID. `users` row may not exist — LEFT JOIN handles that. */
  @IsOptional()
  @IsUUID()
  actor_id?: string;

  /** Action key, varchar(64) on the column. Free text — catalogued in code, not in SQL. */
  @IsOptional()
  @IsString()
  action?: string;

  /** Resource type, varchar(64) (e.g. `incidents`). */
  @IsOptional()
  @IsString()
  resource_type?: string;

  /** 1-based page index. Default 1; capped by service to a sane lower bound. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  /**
   * Page size. Default 20; hard cap 100 (matches the spec R1-S3
   * scenario). A request for `limit=200` returns 400 — the
   * ValidationPipe rejects via `@Max(100)` BEFORE the service
   * runs. Architect chose fail-fast over silent cap (Option A
   * in sdd-verify FIX-1).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
