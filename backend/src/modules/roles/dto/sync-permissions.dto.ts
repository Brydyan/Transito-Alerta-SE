import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/**
 * T5.6 — body for `PUT /api/roles/:id/permissions`. PUT semantics:
 * the array REPLACES the role's permission set (D1). Pass an empty
 * array to clear all permissions from a role.
 */
export class SyncPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(64)
  permissions!: string[];
}
