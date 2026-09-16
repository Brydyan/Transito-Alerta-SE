/**
 * GET /api/departments query string (controller layer).
 *
 * `organization_id` is OPTIONAL in the wire contract because the
 * controller is responsible for scoping it to the caller's own org when
 * the caller is `admin_org`. For master, the filter is lifted and
 * the controller accepts whatever is passed (or none → all orgs).
 *
 * `page` and `per_page` are declared as `string | undefined` and parsed
 * inline because the wire format is snake_case (`per_page`) — `forbidNonWhitelisted: true`
 * (in `main.ts`) would 400 on a class-validator DTO with camelCase
 * property names when the query string arrives in snake_case. The
 * `IncidentCategoriesController` follows the same `@Query('per_page')
 * perPage?: string` pattern (manual parseInt) for the same reason; this
 * file mirrors it.
 */
export interface ListDepartmentsQuery {
  search?: string;
  page?: string;
  per_page?: string;
  organization_id?: string;
}
