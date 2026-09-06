/**
 * Wire-format model for Incident Categories.
 *
 * Field names are snake_case because the backend sends them that way
 * through the SnakeCaseResponseInterceptor. Do NOT rename to camelCase.
 */

export interface IIncidentCategory {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ICreateIncidentCategoryDto {
  name: string;
  parent_id?: string | null;
}

export interface IUpdateIncidentCategoryDto {
  name?: string;
  parent_id?: string | null;
}

export interface IIncidentCategoryListParams {
  search?: string;
  parent_id?: string;
  page?: number;
  per_page?: number;
}

export interface IIncidentCategoryListResult {
  items: IIncidentCategory[];
  total: number;
}
