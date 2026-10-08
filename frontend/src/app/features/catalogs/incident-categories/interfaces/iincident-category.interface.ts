import type { IncidentPriority } from '../../../../core/models/incident.model';

/**
 * Wire-format model for Incident Categories.
 *
 * Field names are snake_case because the backend sends them that way
 * through the SnakeCaseResponseInterceptor. Do NOT rename to camelCase.
 */

export interface IIncidentCategory {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  /**
   * 2026-09-22-sc-subcategory-priority-assignment. NULL on root
   * categories; required on sub-categories (enforced server-side).
   */
  priority?: IncidentPriority | null;
  created_at: string;
  updated_at: string;
}

export interface ICreateIncidentCategoryDto {
  name: string;
  description?: string | null;
  parent_id?: string | null;
  priority?: IncidentPriority;
}

export interface IUpdateIncidentCategoryDto {
  name?: string;
  description?: string | null;
  parent_id?: string | null;
  priority?: IncidentPriority | null;
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

/**
 * Tree-shaped node returned by `GET /incident-categories/tree`.
 * Used by citizen-report and feed-filters for the category picker.
 */
export interface IncidentCategoryTreeNode {
  id: string;
  name: string;
  children?: IncidentCategoryTreeNode[];
}

/**
 * Internal node shape used by the admin `/app/categorias` list
 * (T7.4). Extends the wire DTO with the client-computed `children`
 * (built from `buildCategoryTree`) and `depth` (used by the template
 * for chevron indent). Not returned by the backend — the wire shape
 * is `IIncidentCategory[]` and the tree is assembled client-side.
 */
export interface IncidentCategoryNode extends IIncidentCategory {
  children: IncidentCategoryNode[];
  depth: number;
}
