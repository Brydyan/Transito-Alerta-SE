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
  updated_at: string;
}

export interface ICreateOrganizationDto {
  name: string;
}

export interface IUpdateOrganizationDto {
  name?: string;
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
