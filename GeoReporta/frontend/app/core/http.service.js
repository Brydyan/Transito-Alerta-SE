/**
 * HTTP Service — equivalente a HttpClient + HttpInterceptor de Angular.
 *
 * - Inyecta automáticamente el Bearer token en cada request
 * - Maneja errores 401: intenta refresh con cookie HttpOnly, luego redirige a login
 * - Parsea respuestas JSON
 * - Tokens persistidos en sessionStorage: sobreviven a F5 / navegación interna,
 *   mueren al cerrar la pestaña (esa es la semántica que queremos: un F5 no
 *   debería deslogear al usuario, pero cerrar el browser sí).
 */
import { API_URL } from './config.js';

const TOKEN_KEY = 'auth_token';
const SESSION_KEY = 'auth_session_id';

// Cached in module scope to avoid a sessionStorage read on every request.
// sessionStorage is the source of truth — this cache is invalidated on logout.
let access_token = sessionStorage.getItem(TOKEN_KEY);
let session_id = sessionStorage.getItem(SESSION_KEY);
let refreshPromise = null;
let queue = [];

// Exported auth state functions (used by auth.service.js)
export function setAccessToken(token) {
  access_token = token;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export function setSessionId(id) {
  session_id = id;
  if (id) sessionStorage.setItem(SESSION_KEY, id);
  else sessionStorage.removeItem(SESSION_KEY);
}
export function clearAuthState() {
  access_token = null;
  session_id = null;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
export function getSessionId() {
  return session_id;
}
export function getAccessToken() {
  return access_token;
}

class HttpService {
  constructor() {
    this.baseUrl = API_URL;
  }

  async request(method, path, body = null, { responseType = 'json' } = {}) {
    const headers = {};

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (access_token) {
      headers['Authorization'] = `Bearer ${access_token}`;
    }

    const options = { method, headers, credentials: 'include' };
    if (body) {
      options.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, options);

    // 401 → token inválido/expirado, intentar refresh
    if (res.status === 401) {
      // Binary responses can't be re-tried cleanly after refresh
      // (the response body is already consumed by the time we get here),
      // so we only retry JSON / text calls.
      if (responseType === 'blob') {
        const err = new Error('No autorizado');
        err.status = 401;
        throw err;
      }
      return this.handle401({ method, path, body });
    }

    // 204 → sin cuerpo, no intentes parsearlo
    if (res.status === 204) {
      return null;
    }

    // Honour the caller-requested response shape. The default ('json')
    // is what every other call site expects; binary endpoints (export,
    // downloads) opt in via `responseType: 'blob'`. Anything non-2xx
    // is still surfaced as a thrown Error so callers can branch on
    // `err.status` / `err.message`.
    if (responseType === 'blob') {
      if (!res.ok) {
        const err = new Error(`Error en la solicitud (${res.status})`);
        err.status = res.status;
        throw err;
      }
      return res.blob();
    }

    if (responseType === 'text') {
      if (!res.ok) {
        const text = await res.text();
        const err = new Error(text || 'Error en la solicitud');
        err.status = res.status;
        throw err;
      }
      return res.text();
    }

    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.message || 'Error en la solicitud');
      err.status = res.status;
      // `code` opcional para errores estructurados por el backend
      // (ej: `email_not_verified` del flujo de verificación de
      // correo — story sc-117). Permite al frontend dispatchar
      // flujos diferenciados sin parsear el `message` (i18n-fragile).
      if (data.code) err.code = data.code;
      err.errors = data.errors;
      throw err;
    }

    return data;
  }

  async handle401(originalRequest) {
    if (refreshPromise) {
      // Queue request while refresh is in-flight
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject, originalRequest });
      });
    }

    // Start refresh
    refreshPromise = this.doRefresh();

    try {
      await refreshPromise;
      // Retry original request
      const result = await this.request(
        originalRequest.method,
        originalRequest.path,
        originalRequest.body,
      );
      // Process any queued requests
      const pendingQueue = [...queue];
      queue = [];
      pendingQueue.forEach(
        ({ resolve, reject, originalRequest: queuedRequest }) => {
          this.request(
            queuedRequest.method,
            queuedRequest.path,
            queuedRequest.body,
          )
            .then(resolve)
            .catch(reject);
        },
      );
      return result;
    } catch (err) {
      clearAuthState();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      // Reject all queued requests
      queue.forEach(({ reject }) =>
        reject(new Error('Sesión expirada. Inicia sesión nuevamente.')),
      );
      queue = [];
      throw err;
    } finally {
      refreshPromise = null;
    }
  }

  async doRefresh() {
    const res = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Refresh failed');
    }

    const data = await res.json();
    setAccessToken(data.access_token);
    setSessionId(data.session_id);
    return data;
  }

  get(path, options) {
    return this.request('GET', path, null, options);
  }
  post(path, body, options) {
    return this.request('POST', path, body, options);
  }
  put(path, body, options) {
    return this.request('PUT', path, body, options);
  }
  patch(path, body, options) {
    return this.request('PATCH', path, body, options);
  }
  delete(path, options) {
    return this.request('DELETE', path, null, options);
  }
}

export const http = new HttpService();
