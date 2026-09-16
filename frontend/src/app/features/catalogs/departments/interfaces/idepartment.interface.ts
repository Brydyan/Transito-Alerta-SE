/**
 * Wire-format model for Departments.
 *
 * Field names are snake_case because the backend sends them that way
 * through the SnakeCaseResponseInterceptor. Do NOT rename to camelCase.
 *
 * The `organization_name` and `user_count` fields are enriched server-
 * side by `DepartmentsRepository.list()` (LEFT JOIN organizations +
 * COUNT(users)) per the design.md D2 decision. They are NOT required
 * on `create()` / `update()` responses — the controller only calls
 * `findById` (returns a plain `IDepartment`-shaped row) on those paths.
 *
 * `IDepartmentListResult.items` carries the enriched shape because the
 * list endpoint is the only place those joins make sense.
 */

/** Full row shape returned by list/findById. */
export interface IDepartment {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  organization_name?: string;
  user_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Body shape for POST /api/departments. */
export interface ICreateDepartmentDto {
  name: string;
  description?: string | null;
  organization_id: string;
}

/**
 * Body shape for PATCH /api/departments/:id. `organization_id` is
 * deliberately absent — the dept's organization is immutable per design
 * D4; the controller would silently strip the field if the body sent
 * it.
 */
export interface IUpdateDepartmentDto {
  name?: string;
  description?: string | null;
}

/** Query string for GET /api/departments. snake_case matches the wire. */
export interface IDepartmentListParams {
  search?: string;
  page?: number;
  per_page?: number;
  organization_id?: string;
}

/** Paginated response shape. */
export interface IDepartmentListResult {
  items: IDepartment[];
  total: number;
}

/**
 * Response shape for DELETE /api/departments/:id. The backend returns
 * 200 with the soft-deleted row's id + timestamp so the frontend can
 * show "Eliminado a las HH:MM" in a confirm toast (D8).
 */
export interface IDeleteDepartmentResponse {
  id: string;
  deleted_at: string;
}
