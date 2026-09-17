import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * Menu option entity — mirrors the backend MenuOptionEntity wire shape
 * (snake_case via SnakeCaseResponseInterceptor).
 */
export interface MenuOption {
  id: string;
  name: string;
  route: string;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  parent_id: string | null;
  created_at: string;
}

/**
 * Role matrix entry for a single role within a scope block.
 */
export interface RoleMatrixEntry {
  roleId: string;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
}

/**
 * Role matrix grouped by scope (platform, organization, public).
 * Three blocks per Q1/Q5.
 */
export interface RoleMatrix {
  platform: RoleMatrixEntry[];
  organization: RoleMatrixEntry[];
  public: RoleMatrixEntry[];
}

/**
 * Paginated result envelope from the backend.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Payload for POST /menu-options */
export interface CreateMenuOptionPayload {
  name: string;
  route: string;
  icon?: string;
  parentId?: string | null;
  displayOrder: number;
  isActive?: boolean;
}

/** Payload for PATCH /menu-options/:id (partial update) */
export interface UpdateMenuOptionPayload {
  name?: string;
  route?: string;
  icon?: string | null;
  parentId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

/** Payload for PUT /menu-options/:id/roles/:roleId */
export interface SetRoleAccessPayload {
  canRead: boolean;
  canWrite: boolean;
}

/** Payload for PUT /menu-options/:id/endpoints */
export interface AssignEndpointsPayload {
  endpointIds: string[];
}

/** Endpoint catalog query params */
export interface EndpointCatalogQuery {
  page?: number;
  limit?: number;
  route?: string;
  method?: string;
  description?: string;
}

/**
 * MenuOptionService — CRUD, role matrix, and endpoint assignment for
 * the dynamic menu administration screen (F5.6.1).
 *
 * Backend: NestJS controller at /api/menu-options (F5.5.4).
 * Wire shape: snake_case via global SnakeCaseResponseInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class MenuOptionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/menu-options`;

  // ── CRUD ───────────────────────────────────────────────────────────────

  /** GET /menu-options — all active (non-deleted) options. */
  findAll(): Observable<MenuOption[]> {
    return this.http.get<MenuOption[]>(this.baseUrl, { withCredentials: true });
  }

  /** GET /menu-options/:id — single option detail. */
  findOne(id: string): Observable<MenuOption> {
    return this.http.get<MenuOption>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  /** POST /menu-options — create a new option. */
  create(payload: CreateMenuOptionPayload): Observable<MenuOption> {
    return this.http.post<MenuOption>(this.baseUrl, payload, { withCredentials: true });
  }

  /** PATCH /menu-options/:id — partial update. */
  update(id: string, payload: UpdateMenuOptionPayload): Observable<MenuOption> {
    return this.http.patch<MenuOption>(`${this.baseUrl}/${id}`, payload, { withCredentials: true });
  }

  /** DELETE /menu-options/:id — soft delete. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  // ── Role matrix (F5.5.5) ─────────────────────────────────────────────

  /** GET /menu-options/:id/roles — role matrix grouped by scope. */
  getRoleMatrix(optionId: string): Observable<RoleMatrix> {
    return this.http.get<RoleMatrix>(`${this.baseUrl}/${optionId}/roles`, { withCredentials: true });
  }

  /** PUT /menu-options/:id/roles/:roleId — set read/write access for a role. */
  setRoleAccess(
    optionId: string,
    roleId: string,
    payload: SetRoleAccessPayload,
  ): Observable<{ menuOptionId: string; roleId: string; canRead: boolean; canWrite: boolean }> {
    return this.http.put<{ menuOptionId: string; roleId: string; canRead: boolean; canWrite: boolean }>(
      `${this.baseUrl}/${optionId}/roles/${roleId}`,
      payload,
      { withCredentials: true },
    );
  }

  // ── Endpoint assignment (F5.5.6) ──────────────────────────────────────

  /** PUT /menu-options/:id/endpoints — idempotent endpoint assignment. */
  assignEndpoints(
    optionId: string,
    payload: AssignEndpointsPayload,
  ): Observable<{ menuOptionId: string; endpointId: string }[]> {
    return this.http.put<{ menuOptionId: string; endpointId: string }[]>(
      `${this.baseUrl}/${optionId}/endpoints`,
      payload,
      { withCredentials: true },
    );
  }

  /** GET /menu-options/endpoints — paginated, filterable endpoint catalog. */
  getEndpointCatalog(query: EndpointCatalogQuery = {}): Observable<PaginatedResult<{ id: string; method: string; path: string; description: string }>> {
    let params = new HttpParams();
    if (query.page != null) params = params.set('page', String(query.page));
    if (query.limit != null) params = params.set('limit', String(query.limit));
    if (query.route) params = params.set('route', query.route);
    if (query.method) params = params.set('method', query.method);
    if (query.description) params = params.set('description', query.description);

    return this.http.get<PaginatedResult<{ id: string; method: string; path: string; description: string }>>(
      `${this.baseUrl}/endpoints`,
      { params, withCredentials: true },
    );
  }
}
