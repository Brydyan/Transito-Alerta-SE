/**
 * Wire-format model for Organizations.
 *
 * Field names are snake_case because the backend sends them that way
 * through the SnakeCaseResponseInterceptor. Do NOT rename to camelCase.
 */

export interface IOrganization {
  id: string;
  name: string;
  zone_id: string | null;
  parent_id: string | null;
  incident_category_id: string | null;
  max_active_claims: number;
  created_at: string;
  /**
   * NO `updated_at` here on purpose. `OrganizationRow`'s `SELECT_COLUMNS`
   * (`organizations.repository.ts`) is `id, name, zone_id, max_active_claims,
   * created_at, parent_id, incident_category_id` — no `updated_at`, so
   * declaring it produced a field that was always `undefined` at runtime
   * while type-checking clean.
   */
}

export interface ICreateOrganizationDto {
  name: string;
  /**
   * Zona a la que pertenece la organización. El backend
   * (`CreateOrganizationDto`) lo acepta como `@IsOptional() @IsUUID('4')`, y
   * es el campo que dirige el ruteo de incidencias: `IncidentsService.create`
   * deriva la organización de la zona resuelta por geofencing, no del creador.
   */
  zone_id?: string | null;
  /** Organización madre (jerarquía institucional). El backend valida ciclos. */
  parent_id?: string | null;
}

export interface IUpdateOrganizationDto {
  name?: string;
  /**
   * `undefined` = no se envía (deja la zona como está). `null` = desvincular
   * explícitamente. Es la convención de `UpdateOrganizationDto` en el backend.
   */
  zone_id?: string | null;
  parent_id?: string | null;
}

/**
 * `GET /organizations/form-data`. El servicio declara `geoZones` en camelCase,
 * pero `SnakeCaseResponseInterceptor` reescribe **todas** las claves de toda
 * respuesta, así que en el wire llega como `geo_zones` (design D2: el modelo
 * se deriva del wire, nunca de la clase del backend).
 */
export interface IOrganizationFormData {
  roles: Array<{ id: string; name: string }>;
  geo_zones: Array<{ id: string; name: string }>;
}

export interface IOrganizationListParams {
  search?: string;
  page?: number;
  per_page?: number;
}

export interface IOrganizationListResult {
  items: IOrganization[];
  total: number;
}
