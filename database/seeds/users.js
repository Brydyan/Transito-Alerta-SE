#!/usr/bin/env node
/**
 * database/seeds/users.js
 *
 * T7.9.D4 — sembrador de usuarios de demo/operación (R22.5, R22.6).
 * Diseñado para correr después de 0041 (que crea la organización
 * "CTE - Santa Elena" y los catálogos de roles). NO modifica geografía
 * ni la organización — esos llegan siempre por la migración 0041
 * (R22.1).
 *
 * Distribución sembrada (6 filas):
 *   - 1 master               (organization_id NULL)
 *   - 1 operador_sistema     (organization_id NULL)
 *   - 2 admin_org            (organization_id = CTE - Santa Elena)
 *   - 2 operador_org         (organization_id = CTE - Santa Elena)
 *
 * Idempotencia (R22.6):
 *   - `ON CONFLICT (email) DO NOTHING` a nivel SQL.
 *   - Hash bcrypt recomputado en cada corrida, pero sólo persiste la
 *     primera; un re-run no duplica filas.
 *
 * Seguridad:
 *   - bcrypt extraído desde `backend/node_modules/bcrypt` vía `deps.js`
 *     (mismo binario que `AuthService` usa, garantiza que el hash sea
 *     aceptado por `bcrypt.compare()` en login).
 *   - `lib/guard.js` aborta contra host no local o `NODE_ENV=production`
 *     salvo doble override (`--force` + `SEED_ALLOW_PRODUCTION=1`).
 *
 * Salida: el módulo exporta `run(client, { force, seed })` para uso
 * programático (tests, futuras tareas). Cuando se invoca como binario
 * (`node users.js`), conecta, corre `run` y termina con código 0/1.
 */
'use strict';

const { Client, bcrypt } = require('./lib/deps');
const { enforce } = require('./lib/guard');

// Misma constante que AuthConfig.bcryptCost — design.md D7.
const DEFAULT_BCRYPT_COST = 12;

// Distribución seedada — T7.9.D4 / R22.5.
const SEED_USERS = Object.freeze([
  { role: 'master', email: 'master@tase.local', firstName: 'Master', lastName: 'System' },
  { role: 'operador_sistema', email: 'operador-sistema@tase.local', firstName: 'Operador', lastName: 'Sistema' },
  { role: 'admin_org', email: 'admin-org-1@tase.local', firstName: 'Admin', lastName: 'Org Uno' },
  { role: 'admin_org', email: 'admin-org-2@tase.local', firstName: 'Admin', lastName: 'Org Dos' },
  { role: 'operador_org', email: 'operador-org-1@tase.local', firstName: 'Operador', lastName: 'Org Uno' },
  { role: 'operador_org', email: 'operador-org-2@tase.local', firstName: 'Operador', lastName: 'Org Dos' },
]);

const DEFAULT_SEED_PASSWORD = 'ChangeMe!Demo2026';
const DEFAULT_ORG_NAME = 'CTE - Santa Elena';

function readSeedPassword(opts) {
  if (opts && opts.seed && typeof opts.seed.password === 'string' && opts.seed.password.length > 0) {
    return opts.seed.password;
  }
  if (process.env.SEED_PASSWORD && process.env.SEED_PASSWORD.length > 0) {
    return process.env.SEED_PASSWORD;
  }
  return DEFAULT_SEED_PASSWORD;
}

function readBcryptCost(opts) {
  if (opts && Number.isInteger(opts.bcryptCost) && opts.bcryptCost >= 4 && opts.bcryptCost <= 15) {
    return opts.bcryptCost;
  }
  const envCost = Number.parseInt(process.env.BCRYPT_COST || '', 10);
  if (Number.isInteger(envCost) && envCost >= 4 && envCost <= 15) {
    return envCost;
  }
  return DEFAULT_BCRYPT_COST;
}

/**
 * Resuelve un role_id desde la tabla `roles` por nombre. Lanza si la fila
 * no existe — el seeder asume 0041 aplicada, que ya dejó el catálogo de
 * roles poblado (0009 + 0015 + 0040). Devuelve null sólo si el caller
 * explícitamente lo permite (modo degradado, no usado en producción).
 */
async function resolveRoleId(client, roleName) {
  const rows = await client.query(
    `SELECT id FROM roles WHERE name = $1 AND deleted_at IS NULL`,
    [roleName],
  );
  if (rows.rows.length === 0) {
    throw new Error(
      `users.js: role "${roleName}" no existe en la tabla roles. ` +
        `Aplica 0040_rename_roles.sql antes de correr este seeder.`,
    );
  }
  return rows.rows[0].id;
}

/**
 * Resuelve organization_id por nombre. Devuelve null si la organización
 * no existe (los usuarios sin organización — master / operador_sistema —
 * no deben fallar por esto; sí fallarían los admin_org/operador_org, pero
 * el caller debe haber aplicado 0041 antes).
 */
async function resolveOrganizationId(client, orgName) {
  if (!orgName) return null;
  const rows = await client.query(`SELECT id FROM organizations WHERE name = $1`, [orgName]);
  return rows.rows.length === 0 ? null : rows.rows[0].id;
}

/**
 * Genera un device_uuid estable por email — el seeder rellena también
 * `users.device_uuid` para que el flujo de invitación / login no
 * requiera pasos manuales. Determinista por email para que re-correr el
 * seeder no rompa el UNIQUE(device_uuid).
 */
function deviceUuidFor(email) {
  // v5 contra NS_SEED (mismo namespace que rand.js) — consistente con el
  // resto del pipeline y fácil de reproducir.
  const { uuidV5, NS_SEED } = require('./lib/rand');
  return uuidV5('device/' + email.toLowerCase(), NS_SEED);
}

/**
 * Resuelve permisos desde el rol (T3.9: users.permissions es snapshot
 * denormalizado de role.permissions, copiado en insert).
 */
async function getRolePermissions(client, roleId) {
  const rows = await client.query(`SELECT permissions FROM roles WHERE id = $1`, [roleId]);
  return rows.rows.length > 0 ? rows.rows[0].permissions : [];
}

/**
 * Inserta o no-op un usuario por email. Devuelve { inserted, skipped }.
 */
async function upsertUser(client, params) {
  const permissions = await getRolePermissions(client, params.roleId);
  const sql = `
    INSERT INTO users (
      device_uuid, email, password_hash,
      is_active, deleted_at,
      first_name, last_name,
      role, role_id,
      organization_id,
      permissions, permission_version,
      terms_accepted_at, terms_version,
      email_verified_at
    ) VALUES (
      $1, $2, $3,
      true, NULL,
      $4, $5,
      $6, $7,
      $8,
      $9::jsonb, 1,
      now(), 'v1',
      now()
    )
    ON CONFLICT (email) WHERE email IS NOT NULL DO NOTHING
    RETURNING id
  `;
  const result = await client.query(sql, [
    params.deviceUuid,
    params.email,
    params.passwordHash,
    params.firstName,
    params.lastName,
    params.role,
    params.roleId,
    params.organizationId,
    JSON.stringify(permissions),
  ]);
  return { inserted: result.rowCount === 1, skipped: result.rowCount === 0 };
}

/**
 * Punto de entrada programático. Acepta un `pg.Client` ya conectado
 * (los tests E2E inyectan uno contra MigrationHarness) o crea/abre/cierra
 * uno propio si el caller pasa un objeto `connection`.
 *
 * @param {import('pg').Client} client
 * @param {object} [opts]
 * @param {boolean} [opts.force]
 * @param {object} [opts.seed] - { password: '...' }
 * @param {number} [opts.bcryptCost]
 * @returns {Promise<{ inserted: number, skipped: number, users: object[] }>}
 */
async function run(client, opts = {}) {
  enforce({ scriptName: 'users.js', argv: process.argv.slice(2).concat(opts.force ? ['--force'] : []) });

  const password = readSeedPassword(opts);
  const cost = readBcryptCost(opts);
  const passwordHash = await bcrypt.hash(password, cost);

  // Pre-resolver los role_id y organization_id una sola vez.
  const roleIds = new Map();
  for (const u of SEED_USERS) {
    if (!roleIds.has(u.role)) roleIds.set(u.role, await resolveRoleId(client, u.role));
  }
  const orgId = await resolveOrganizationId(client, DEFAULT_ORG_NAME);

  let inserted = 0;
  let skipped = 0;
  const users = [];
  for (const u of SEED_USERS) {
    const needsOrg = u.role === 'admin_org' || u.role === 'operador_org';
    if (needsOrg && !orgId) {
      throw new Error(
        `users.js: rol "${u.role}" requiere la organización "${DEFAULT_ORG_NAME}" ` +
          `pero no existe. Aplica 0041_geography_organizations_seed.sql antes.`,
      );
    }
    const r = await upsertUser(client, {
      deviceUuid: deviceUuidFor(u.email),
      email: u.email,
      passwordHash,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      roleId: roleIds.get(u.role),
      organizationId: needsOrg ? orgId : null,
    });
    if (r.inserted) inserted += 1;
    else skipped += 1;
    users.push({ email: u.email, role: u.role, ...r });
  }

  return { inserted, skipped, users };
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(
      `users.js: failed to connect — ${err && err.message ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
  try {
    const result = await run(client, { force: process.argv.includes('--force') });
    process.stdout.write(
      `users.js: inserted=${result.inserted} skipped=${result.skipped} total=${result.users.length}\n`,
    );
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`users.js: ${err && err.message ? err.message : String(err)}\n`);
    if (err && err.code === 'GUARD_ABORTED') {
      const host = err.resolvedHost ? ` host="${err.resolvedHost}"` : '';
      process.stderr.write(`users.js: guard aborted${host}\n`);
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = { run, SEED_USERS, DEFAULT_ORG_NAME, DEFAULT_SEED_PASSWORD };

if (require.main === module) {
  main();
}
