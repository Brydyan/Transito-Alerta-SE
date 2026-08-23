export interface RoleDto {
  id: string;
  name: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
}

/**
 * Slim shape returned by `GET /api/users/form-data`. Mirrors GeoReporta's
 * `formData()` response, minus Eloquent model attributes — the frontend
 * only needs `{id, name}` for dropdowns.
 */
export class FormDataResponseDto {
  roles!: RoleDto[];
  organizations!: OrganizationDto[];
}
