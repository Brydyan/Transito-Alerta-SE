#!/usr/bin/env node
/**
 * database/seeds/lib/guard.js
 *
 * T7.9.D3 (design.md D11) — guarda de seguridad ejecutada al inicio de
 * cada seeder y de `rebuild-feed.ts`. Diseñada para que el script se
 * niegue a correr a menos que la base destino sea claramente local o el
 * operador haya escrito DOS confirmaciones explícitas (doble compuerta
 * independiente — `--force` se tipea por reflejo, sólo no alcanza).
 *
 * Reglas (en orden):
 *  1. `NODE_ENV === 'production'` ⇒ abortar, salvo que el operador
 *     además haya seteado `SEED_ALLOW_PRODUCTION=1`. `--force` solo
 *     no levanta este bloqueo.
 *  2. Resolver el host desde `DATABASE_URL` (fallback `DB_HOST`):
 *     - localhost, 127.*, ::1, 0.0.0.0, *.local, host.docker.internal
 *       ⇒ permitido.
 *     - cualquier otro (notablemente `*.supabase.co`) ⇒ abortar salvo
 *       `--force`.
 *  3. En abortar: imprimir el host resuelto y salir con código 1.
 *
 * Uso típico desde un seeder:
 *
 *     const { enforce } = require('./lib/guard');
 *     // ... dentro de run()
 *     enforce({ scriptName: 'users.js' });
 *
 * El objeto `flags` se popula del `process.argv` y permite al seeder
 * saber si el operador pasó `--force`. Devolverlo es opcional — la guarda
 * ya corta sola cuando corresponde.
 */
'use strict';

const ALLOW_PRODUCTION_ENV = 'SEED_ALLOW_PRODUCTION';
const FORCE_FLAG = '--force';

const ALLOWED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./, // 127.0.0.1, 127.x.x.x
  /^::1$/i,
  /^0\.0\.0\.0$/,
  /\.local$/i, // foo.local, my-mac.local
  /^host\.docker\.internal$/i, // Docker Desktop / Rancher Desktop
];

/**
 * Parsea un connection string estilo `postgres://user:pass@host:port/db`
 * y devuelve sólo el host. Devuelve null si el string no parsea — el
 * caller aborta con un mensaje útil.
 */
function parseHost(connectionString) {
  if (!connectionString || typeof connectionString !== 'string') return null;
  // Strip query string (search params) y fragment antes de parsear.
  const clean = connectionString.split('?')[0].split('#')[0];
  // Formato URL estándar: postgres://user:pass@host:port/db.
  // Si no trae esquema, intentamos igual.
  let url;
  try {
    url = new URL(clean);
  } catch (_err) {
    return null;
  }
  return url.hostname || null;
}

function resolveHost() {
  const fromUrl = parseHost(process.env.DATABASE_URL);
  if (fromUrl) return fromUrl;
  return process.env.DB_HOST || null;
}

function isAllowedHost(host) {
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(String(host)));
}

/**
 * Aplica la guarda. Lanza un Error con código `GUARD_ABORTED` cuando
 * el script debe detenerse; los callers lo capturan, imprimen y salen
 * con código 1. No aborta el proceso directamente — el caller decide
 * el mensaje final.
 *
 * @param {object} [opts]
 * @param {string} [opts.scriptName] - sólo se usa para mensajes.
 * @param {string[]} [opts.argv]     - argv slice para detectar --force.
 * @returns {{ force: boolean, host: string|null, blocked: boolean }}
 */
function enforce(opts = {}) {
  const scriptName = opts.scriptName || '<seed>';
  const argv = opts.argv || process.argv.slice(2);
  const force = argv.includes(FORCE_FLAG);

  const host = resolveHost();
  const inProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const allowProduction = process.env[ALLOW_PRODUCTION_ENV] === '1';

  // Regla 1: production.
  if (inProduction && !(allowProduction && force)) {
    const why =
      `Refusing to run ${scriptName} against production environment.\n` +
      `  NODE_ENV=production requires BOTH --force AND ${ALLOW_PRODUCTION_ENV}=1 ` +
      `(design.md D11: doble compuerta independiente).`;
    throw guardAbort(why, host);
  }

  // Regla 2: host.
  if (host && !isAllowedHost(host)) {
    if (!force) {
      const why =
        `Refusing to run ${scriptName} against non-local host "${host}".\n` +
        `  Allowed patterns: localhost, 127.*, ::1, 0.0.0.0, *.local, host.docker.internal.\n` +
        `  Pass --force to override.`;
      throw guardAbort(why, host);
    }
    // force y host no-local — producción ya quedó bloqueada arriba;
    // aceptamos sólo si NO estamos en producción (regla 1).
  }

  if (!host) {
    // Sin DATABASE_URL ni DB_HOST — útil en CI. No bloqueamos: el primer
    // `pg.Client.connect()` ya fallará con su propio mensaje si la config
    // no es la correcta.
    return { force, host: null, blocked: false };
  }

  return { force, host, blocked: false };
}

function guardAbort(why, host) {
  const err = new Error(why);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err).code = 'GUARD_ABORTED';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err).resolvedHost = host || null;
  return err;
}

module.exports = {
  enforce,
  // Exposed for unit tests; not used by seeders.
  _parseHost: parseHost,
  _isAllowedHost: isAllowedHost,
  _ALLOW_PRODUCTION_ENV: ALLOW_PRODUCTION_ENV,
  _FORCE_FLAG: FORCE_FLAG,
  _ALLOWED_HOST_PATTERNS: ALLOWED_HOST_PATTERNS,
};
