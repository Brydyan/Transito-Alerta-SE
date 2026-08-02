import { http } from '../core/http.service.js';

/**
 * Servicio de permisos crudos del usuario autenticado.
 *
 * El backend expone GET /api/permissions/my (RoleController::myPermissions),
 * que devuelve la lista plana de slugs "resource.action" que el usuario
 * actual tiene otorgados, p.ej. ["users.view", "users.create"].
 *
 * Existe porque menuService.getMyMenu() solo dice "qué páginas de listado
 * puede ver este usuario" (lo que aparece en el sidebar) — eso NO alcanza
 * para autorizar rutas hijas sin entrada de menú propia (p.ej.
 * /usuarios/crear, que requiere users.create, un permiso distinto de
 * users.view que gobierna /usuarios). Ver permission.guard.js.
 *
 * Mismo patrón de caché con TTL que menu.service.js — ver ese archivo para
 * el razonamiento completo.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;

let _cache = null;
let _cachedAt = 0;
let _inflight = null;

// PubSub state for live re-hydration of subscribed components
let _generation = 0;
const _listeners = new Set();

/**
 * Internal: emits invalidation event to all subscribers.
 * Called by invalidateMyPermissions().
 */
function _emitInvalidate() {
  _generation += 1;
  for (const cb of _listeners) {
    cb();
  }
}

export const permissionService = {
  /**
   * Devuelve el Set de permisos ("resource.action") del usuario
   * autenticado. Reutiliza caché si está disponible y es reciente.
   *
   * @param {{ ttlMs?: number, forceRefresh?: boolean }} [opts]
   */
  async getMyPermissions(opts = {}) {
    const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
    const now = Date.now();
    const fresh = _cache !== null && now - _cachedAt <= ttl;

    if (!opts.forceRefresh && fresh) {
      return _cache;
    }
    if (_inflight) {
      return _inflight;
    }

    const myGen = _generation;
    _inflight = http
      .get('/permissions/my')
      .then((resp) => {
        // Discard stale response if generation changed during flight
        if (myGen !== _generation) {
          return _cache;
        }
        const list = Array.isArray(resp?.data)
          ? resp.data
          : Array.isArray(resp)
            ? resp
            : [];
        _cache = new Set(list);
        _cachedAt = Date.now();
        return _cache;
      })
      .finally(() => {
        _inflight = null;
      });

    return _inflight;
  },

  /**
   * Invalida la caché — llamar tras logout o cambio de rol/permisos.
   * Emite invalidación a subscribers via PubSub.
   */
  invalidateMyPermissions() {
    _cache = null;
    _cachedAt = 0;
    _inflight = null;
    _emitInvalidate();
  },

  /**
   * Suscribe un callback que se ejecuta cuando la caché de permisos se invalida.
   * Útil para que componentes (ej. table-actions) re-hidrraten cuando los
   * permisos cambian en vivo.
   *
   * @param {() => void} cb — callback de invalidación
   * @returns {() => void} función de desuscripción
   */
  onInvalidate(cb) {
    _listeners.add(cb);
    return () => _listeners.delete(cb);
  },
};
