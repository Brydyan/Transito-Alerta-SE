import { http } from '../core/http.service.js';

/**
 * Servicio de comentarios públicos de una incidencia.
 *
 * Endpoints (shallow nested resource — see backend/routes/api.php):
 *  - GET    /api/incidents/{incident}/comments       → lista paginada
 *  - POST   /api/incidents/{incident}/comments       → crear comentario
 *  - POST   /api/comments/{comment}/images            → subir imágenes
 *  - DELETE /api/comments/{comment}/images/{image}    → eliminar imagen
 *  - DELETE /api/comments/{comment}                   → eliminar comentario
 *
 * Shared by the operator detail view (incidencias.detail) and the
 * citizen detail view (feed-detail) so both stay in sync with the same
 * request/response shape.
 */
export const commentService = {
  /**
   * Devuelve la lista paginada de comentarios de una incidencia.
   */
  async list(incidentId, { page = 1, perPage = 20 } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    const resp = await http.get(
      `/incidents/${incidentId}/comments?${params.toString()}`,
    );
    return {
      data: resp.data ?? [],
      meta: resp.meta ?? null,
    };
  },

  /**
   * Publica un nuevo comentario en la incidencia.
   * @param {number} incidentId
   * @param {{ message: string, parentId?: number|null, imageIds?: number[] }} options
   */
  async create(incidentId, { message, parentId = null, imageIds = [] } = {}) {
    const payload = { message };
    if (parentId !== null) payload.parent_id = parentId;
    if (imageIds.length > 0) payload.image_ids = imageIds;
    const resp = await http.post(`/incidents/${incidentId}/comments`, payload);
    return resp.data ?? resp;
  },

  /**
   * Sube imágenes a un comentario ya creado.
   * @param {number} commentId
   * @param {File[]} files
   * @returns {Promise<Array>} array de CommentImage records
   */
  async uploadImages(commentId, files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('images[]', file);
    }
    const resp = await http.post(`/comments/${commentId}/images`, formData);
    return resp.data ?? [];
  },

  /**
   * Elimina una imagen de un comentario.
   * @param {number} commentId
   * @param {number} imageId
   */
  async deleteImage(commentId, imageId) {
    await http.delete(`/comments/${commentId}/images/${imageId}`);
  },

  /**
   * Elimina un comentario (soft delete en backend).
   */
  async delete(commentId) {
    await http.delete(`/comments/${commentId}`);
  },
};
