import { http } from '../core/http.service.js';

/**
 * Servicio para búsqueda de usuarios (responsables).
 *
 * Usa debounce para evitar múltiples requests mientras el usuario está escribiendo.
 */

let debounceTimer = null;

export const responsablesService = {
  /**
   * Busca usuarios por nombre o email con debounce.
   *
   * @param {string} search - Término de búsqueda
   * @param {Function} callback - Función que recibe resultados (data, error)
   * @param {number} delay - Delay en ms para debounce (default: 300ms)
   */
  search(search, callback, delay = 300) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!search || search.trim().length === 0) {
      callback([], null);
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          search: search.trim(),
          per_page: 20,
        });
        const resp = await http.get(`/users?${params.toString()}`);
        const users = resp.data ?? [];
        callback(users, null);
      } catch (err) {
        callback(null, err);
      }
    }, delay);
  },

  /**
   * Cancela búsqueda pendiente.
   */
  cancelSearch() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  },

  /**
   * Formatea nombre del usuario para display.
   */
  formatUserName(user) {
    if (!user) return '';
    const first = user.first_name || '';
    const last = user.last_name || '';
    return `${first} ${last}`.trim() || user.email || '';
  },

  /**
   * Formatea rol del usuario.
   */
  formatRole(user) {
    if (!user?.role) return 'Sin rol';
    if (typeof user.role === 'string') return user.role;
    if (typeof user.role === 'object' && user.role?.name) return user.role.name;
    return 'Sin rol';
  },
};
