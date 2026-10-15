export interface RoleDto {
  id: string;
  name: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  zone_id: string | null;
}

/**
 * 2026-10-10-user-onboarding-telegram-tour (D6) — slim shape returned by
 * `GET /api/users/form-data`. Mirrors GeoReporta's `formData()`
 * response, minus Eloquent model attributes — the frontend only needs
 * `{id, name}` (and the FK to the org for the dynamic filter) for
 * dropdowns.
 */
export class FormDataResponseDto {
  roles!: RoleDto[];
  organizations!: OrganizationDto[];
  /**
   * `DepartmentDto` includes `organization_id` so the frontend can
   * filter the dropdown reactively when the user picks an
   * organization (D6).
   */
  departments!: DepartmentDto[];
}

export interface DepartmentDto {
  id: string;
  name: string;
  organization_id: string;
}
