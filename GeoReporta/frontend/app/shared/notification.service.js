import { http } from '../core/http.service.js';

/**
 * Servicio de notificaciones del usuario autenticado.
 *
 * Endpoints:
 *  - GET    /api/notifications                       → lista paginada
 *  - GET    /api/notifications?type=incident_pending_approval → pending approvals
 *  - GET    /api/notifications/unread-count          → solo conteo de no leídas
 *  - PATCH  /api/notifications/{id}/read             → marcar una como leída
 *  - PATCH  /api/notifications/read-all              → marcar todas como leídas
 *  - POST   /api/notifications/{id}/approve          → aprobar resolución pendiente
 *  - POST   /api/notifications/{id}/reject           → rechazar resolución pendiente (con reason)
 *  - GET    /api/notifications/{id}                  → detalle de una notificación
 *
 * No cachea el unread count — siempre pide fresco al backend.
 * La latencia típica (~5ms en LAN) es irrelevante para un badge y
 * elimina la complejidad de invalidar caché manualmente.
 */

export const notificationService = {
  /**
   * Devuelve la lista paginada de notificaciones del usuario autenticado.
   */
  async list({ page = 1, perPage = 20, unreadOnly = false } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (unreadOnly) params.set('unread_only', '1');

    const resp = await http.get('/notifications?' + params.toString());
    return {
      data: resp.data ?? [],
      meta: resp.meta ?? null,
      unreadCount: resp.unread_count ?? 0,
    };
  },

  /**
   * Devuelve solo el conteo de no leídas (badge del header).
   * Siempre pide fresco al backend — no usa caché.
   */
  async unreadCount() {
    const resp = await http.get('/notifications/unread-count');
    return resp.unread_count ?? 0;
  },

  /**
   * Marca una notificación como leída (solo si sos el dueño).
   */
  async markRead(id) {
    const resp = await http.patch(`/notifications/${id}/read`);
    return resp.data ?? resp ?? null;
  },

  /**
   * Marca todas las notificaciones del usuario como leídas.
   */
  async markAllRead() {
    return await http.patch('/notifications/read-all');
  },

  /**
   * Approve a pending incident resolution.
   * @param {number|string} id - Notification id
   * @returns {Promise<object>} Updated notification resource
   */
  async approve(id) {
    const resp = await http.post(`/notifications/${id}/approve`);
    return resp.data ?? resp ?? null;
  },

  /**
   * Reject a pending incident resolution with a mandatory reason.
   * @param {number|string} id - Notification id
   * @param {string} reason - Reason text (10..500 chars)
   * @returns {Promise<object>} Updated notification resource
   */
  async reject(id, reason) {
    if (
      typeof reason !== 'string' ||
      reason.length < 10 ||
      reason.length > 500
    ) {
      throw new Error('Reason must be a string between 10 and 500 characters.');
    }
    const resp = await http.post(`/notifications/${id}/reject`, { reason });
    return resp.data ?? resp ?? null;
  },

  /**
   * List pending-approval notifications for the current admin scope.
   * @param {object} [params]
   * @param {number} [params.page=1]
   * @param {number} [params.perPage=20]
   * @param {number|null} [params.organizationId=null]
   * @param {boolean} [params.unreadOnly=true]
   * @returns {Promise<object>} { data: Notification[], meta: object }
   */
  async getPendingApprovals({
    page = 1,
    perPage = 20,
    organizationId = null,
    unreadOnly = true,
  } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    params.set('type', 'incident_pending_approval');
    if (organizationId !== null) {
      params.set('organization_id', String(organizationId));
    }
    if (unreadOnly) {
      params.set('unread_only', '1');
    }
    const resp = await http.get(`/notifications?${params.toString()}`);
    return {
      data: resp.data ?? [],
      meta: resp.meta ?? null,
    };
  },

  /**
   * Get a single notification by id.
   * @param {number|string} id
   * @returns {Promise<object>}
   */
  async getById(id) {
    const resp = await http.get(`/notifications/${id}`);
    return resp.data ?? resp ?? null;
  },
};
