import { http } from '../core/http.service.js';

/**
 * Servicio del menú dinámico del usuario autenticado.
 *
 * El backend expone GET /api/menus/my (App\Domains\Menus\Http\MenuController),
 * que filtra el árbol de menús según los permisos del rol del usuario y
 * devuelve la forma:
 *
 *   [
 *     { id, parent_id, name, route, icon, children: [
 *         { id, parent_id, name, route, icon, children: [...] },
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 *
 * Los nodos con `route === null` son headers de sección (no son navegables,
 * solo agrupan hijos). El frontend los renderiza como títulos de sección y
 * los ignora como destinos de link.
 *
 * Caché en memoria con TTL: la respuesta se cachea después del primer fetch
 * exitoso dentro de la misma sesión y se considera fresca durante
 * DEFAULT_TTL_MS (5 minutos por defecto). Pasado el TTL, la próxima llamada
 * re-fetchea en lugar de servir la copia vieja — esto garantiza que cuando
 * un admin concede/revoca un permiso, los permisos del usuario afectado se
 * reflejan dentro de una ventana razonable sin necesidad de recargar.
 *
 * Si los permisos del usuario cambian (logout, asignación de rol, etc.),
 * el llamador debe invalidar la caché explícitamente vía
 * `invalidateMyMenu()` antes de la próxima lectura.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;

let _cache = null;
let _cachedAt = 0;
let _inflight = null;

export const menuService = {
  /**
   * Devuelve el árbol de menús del usuario autenticado.
   * Reutiliza caché si está disponible y es reciente (dentro del TTL).
   *
   * @param {{ ttlMs?: number, forceRefresh?: boolean }} [opts]
   *   ttlMs override del TTL por defecto (útil en tests).
   *   forceRefresh salta la caché aunque esté fresca (útil tras un cambio
   *   de permisos).
   */
  async getMyMenu(opts = {}) {
    const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
    const now = Date.now();
    const fresh = _cache !== null && now - _cachedAt <= ttl;

    if (!opts.forceRefresh && fresh) {
      return _cache;
    }
    if (_inflight) {
      return _inflight;
    }

    _inflight = http
      .get('/menus/my')
      .then((resp) => {
        if (Array.isArray(resp?.data)) {
          _cache = resp.data;
        } else if (Array.isArray(resp)) {
          _cache = resp;
        } else {
          _cache = [];
        }
        _cachedAt = Date.now();
        return _cache;
      })
      .finally(() => {
        _inflight = null;
      });

    return _inflight;
  },

  /**
   * Invalida la caché forzando una recarga en la próxima lectura. Llamar
   * después de logout, cambio de rol, o cuando se sepa que los permisos
   * del usuario cambiaron.
   */
  invalidateMyMenu() {
    _cache = null;
    _cachedAt = 0;
    _inflight = null;
  },
};
