import { http } from '../core/http.service.js';

/**
 * Servicio de asignaciones de operadores (responsable/apoyo) a una
 * incidencia.
 *
 * Endpoints (nested resource — see backend/routes/api.php):
 *  - GET    /api/incidents/{incident}/assignments              → lista paginada
 *  - POST   /api/incidents/{incident}/assignments               → crear asignación
 *  - DELETE /api/incidents/{incident}/assignments/{assignment}  → eliminar asignación
 *
 * Cada fila trae el usuario asignado precargado (`user`) — ver
 * AssignmentController::index/store en el backend, que hace eager-load
 * para evitar N+1.
 */
export const assignmentService = {
  /**
   * Devuelve la lista paginada de asignaciones de una incidencia.
   */
  async list(incidentId, { page = 1, perPage = 20 } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    const resp = await http.get(
      `/incidents/${incidentId}/assignments?${params.toString()}`,
    );
    return {
      data: resp.data ?? [],
      meta: resp.meta ?? null,
    };
  },

  /**
   * Asigna un usuario a la incidencia bajo el rol indicado
   * ("responsable" | "apoyo").
   */
  async create(incidentId, userId, role) {
    const resp = await http.post(`/incidents/${incidentId}/assignments`, {
      user_id: userId,
      role,
    });
    return resp.data ?? resp;
  },

  /** Actualiza el rol de una asignación existente. */
  async update(incidentId, assignmentId, role) {
    const resp = await http.put(
      `/incidents/${incidentId}/assignments/${assignmentId}`,
      { role },
    );
    return resp.data ?? resp;
  },

  /** Elimina una asignación existente de la incidencia. */
  async remove(incidentId, assignmentId) {
    await http.delete(`/incidents/${incidentId}/assignments/${assignmentId}`);
  },
};
