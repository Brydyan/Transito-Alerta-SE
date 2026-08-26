#!/usr/bin/env node
/**
 * database/seeds/volume-incidents.js
 *
 * T7.9.D10 (design.md D9) — sembrador de volumen: 1000 incidentes con
 * ciclo de vida completo. Equivalente moderno del legacy
 * `MassIncidentSeeder.php` que la migración transporta.
 *
 * Filosofía (rechazo explícito del "model events will take care of it"):
 *   - bulk INSERT pasa por alto cada listener de TypeORM. status_history
 *     NO es un trigger de Postgres (T3.4, decisión locked) — es un
 *     listener de la app. Si lo dejamos para "que lo haga la app", nunca
 *     se hace en este seeder.
 *   - Escribimos a mano cada fila derivada: status_history, assignments,
 *     claimed_*, approved_*, rejected_*, resolution_date, notifications,
 *     comments.
 *   - Multi-row INSERT en lotes de 250 (D9). Más pequeño y se siente
 *     lento; más grande y se rompe el límite de parameters de pg.
 *
 * Distribución del status (cumple R22 + reproduce el mix del legacy):
 *   - 25% pending      → 0 history, 0 assignment, 0 notifications
 *   - 25% in_progress  → 1 history (pending->in_progress), 1 assignment,
 *                        1 notification (incident.assigned)
 *   - 25% resolved     → 2 history (pending->in_progress,
 *                        in_progress->resolved), 1 assignment,
 *                        1 resolution_date, 1 notification
 *                        (incident_pending_approval)
 *   - 25% closed       → 2 history (NO la de approved->closed, ver nota
 *                        D9), 1 assignment, 1 resolution_date,
 *                        approved_by+approved_at poblados
 *
 * ⚠️  El paso de aprobación a `closed` NO escribe fila de status_history.
 *     Motivo: chk_status_history_new_status (migración 0014) sólo admite
 *     `pending`/`in_progress`/`resolved` como `new_status` — nunca
 *     recibió `'closed'`, aunque 0020 lo agregó al CHECK de
 *     `incidents.status`. En producción
 *     `IncidentApprovalService.approve` tampoco emite ese evento.
 *     Omitir la fila es fiel al comportamiento real, no un atajo.
 *
 * Idempotencia:
 *   - Chequeo inicial: si la base ya tiene ≥ 1000 incidentes con prefijo
 *     `[VOL]`, se omite toda la corrida (auto-skip).
 *   - Cada INSERT batch usa `ON CONFLICT (id) DO NOTHING` con IDs v5
 *     derivados de `vol/<table>/<i>/<n>` — un re-run después de un fallo
 *     parcial no duplica filas.
 *
 * Determinismo (design.md D8):
 *   - PRNG `mulberry32(0x20260825)` sembrado una vez, drawn en orden fijo.
 *   - Timestamps como offsets desde EPOCH (rand.js / demo-incidents.js).
 *   - IDs: `uuidV5('vol/incident/'+i, NS_SEED)` y derivados
 *     (`vol/history/<i>/<n>`, `vol/assignment/<i>`, etc.).
 *   - Cero `Math.random`, cero `Date.now`, cero `gen_random_uuid()`.
 */
'use strict';

const { Client } = require('./lib/deps');
const { enforce } = require('./lib/guard');
const { SEED, NS_SEED, mulberry32, randInt, pick, uuidV5 } = require('./lib/rand');

const TITLE_PREFIX = '[VOL]';
const EPOCH = new Date('2026-08-25T00:00:00.000Z');
const TOTAL_INCIDENTS = 1000;
const BATCH_SIZE = 250;
const COMMENT_DEPTH_CAP = 2;

// Distribución de status (fracciones, suman 1.0).
const STATUS_MIX = [
  { status: 'pending',     weight: 0.25 },
  { status: 'in_progress', weight: 0.25 },
  { status: 'resolved',    weight: 0.25 },
  { status: 'closed',      weight: 0.25 },
];

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CANTON_CODES = ['EC-24-01', 'EC-24-02', 'EC-24-03'];
const CANTON_CENTROIDS = {
  'EC-24-01': { lat: -2.2262, lng: -80.8581 },
  'EC-24-02': { lat: -2.2304, lng: -80.9037 },
  'EC-24-03': { lat: -2.2147, lng: -80.9689 },
};
const CATEGORY_NAMES = [
  'Baches y Hundimientos',
  'Semáforos Dañados',
  'Señalización Vial',
  'Alumbrado Público',
  'Agua Potable',
  'Alcantarillado',
  'Recolección de Residuos',
  'Red Eléctrica',
  'Robos y Hurtos',
  'Vandalismo',
  'Accidentes de Tránsito',
  'Contaminación Ambiental',
  'Tala de Árboles',
  'Basureros Clandestinos',
  'Construcciones Ilegales',
  'Obras Abandonadas',
  'Veredas y Aceras Deterioradas',
];

function pickStatus(rng) {
  const r = rng();
  let acc = 0;
  for (const { status, weight } of STATUS_MIX) {
    acc += weight;
    if (r < acc) return status;
  }
  return STATUS_MIX[STATUS_MIX.length - 1].status;
}

function jitterCoord(rng, center) {
  return {
    lat: center.lat + (rng() - 0.5) * 0.04,
    lng: center.lng + (rng() - 0.5) * 0.04,
  };
}

/**
 * Devuelve la org de "CTE - Santa Elena" — única en la base sembrada
 * (0041). Todos los incidentes del volume se asignan a esa organización
 * (las notificaciones se enrutan por org, T6.3).
 */
async function resolveOrganizationId(client) {
  const rows = await client.query(
    `SELECT id FROM organizations WHERE name = 'CTE - Santa Elena' LIMIT 1`,
  );
  return rows.rows.length === 0 ? null : rows.rows[0].id;
}

/**
 * Resuelve category_id por nombre. Cachea el resultado para evitar N+1.
 */
async function buildCategoryCache(client) {
  const rows = await client.query(
    `SELECT id, name FROM incident_categories`,
  );
  const cache = new Map();
  for (const row of rows.rows) cache.set(row.name, row.id);
  return cache;
}

/**
 * Resuelve zone_id (la parroquia que contiene el punto) y
 * organization_id (la org sembrada, común a todos los incidentes) en
 * una sola consulta SQL.
 */
async function resolveZoneForPoint(client, point, orgId) {
  const rows = await client.query(
    `SELECT
        z.id AS zone_id
       FROM geo_zones z
      WHERE ST_Contains(z.polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      ORDER BY CASE z.level
                 WHEN 'parroquia' THEN 1
                 WHEN 'canton'    THEN 2
                 WHEN 'provincia' THEN 3
                 ELSE 4
               END
      LIMIT 1`,
    [point.lng, point.lat],
  );
  if (rows.rows.length === 0) {
    return { zone_id: null, organization_id: orgId, geofence_matched: false };
  }
  return {
    zone_id: rows.rows[0].zone_id,
    organization_id: orgId,
    geofence_matched: true,
  };
}

async function ensureCitizenReporter(client) {
  const anon = await client.query(
    `SELECT id FROM users WHERE device_uuid = 'anonymous' LIMIT 1`,
  );
  if (anon.rows.length > 0) return anon.rows[0].id;
  const reporterRole = await client.query(
    `SELECT id FROM roles WHERE name = 'reporter' LIMIT 1`,
  );
  if (reporterRole.rows.length === 0) {
    throw new Error('volume-incidents.js: role "reporter" no existe — apply 0009+ first.');
  }
  const inserted = await client.query(
    `INSERT INTO users (device_uuid, permissions, is_active, role, role_id)
     VALUES ('vol-citizen-' || gen_random_uuid()::text,
             '["READ incidents","CREATE incidents","READ comments","CREATE comments"]'::jsonb,
             true, 'reporter', $1)
     RETURNING id`,
    [reporterRole.rows[0].id],
  );
  return inserted.rows[0].id;
}

async function ensureOperator(client) {
  // Cualquier operador con role operador_org sirve como "responsable" de
  // los assignments (no necesita ser específico del incidente en este
  // seeder — la app no asigna uno real a cada uno de los 1000). Si no
  // hay ninguno, fallback al master (también sirve como approver).
  const rows = await client.query(
    `SELECT id FROM users WHERE role = 'operador_org' AND deleted_at IS NULL
     ORDER BY email LIMIT 1`,
  );
  if (rows.rows.length > 0) return rows.rows[0].id;
  const master = await client.query(
    `SELECT id FROM users WHERE role = 'master' AND deleted_at IS NULL
     ORDER BY email LIMIT 1`,
  );
  if (master.rows.length > 0) return master.rows[0].id;
  throw new Error('volume-incidents.js: no hay operador_org ni master — corre users.js primero.');
}

async function ensureApprover(client) {
  // Para `closed` necesitamos un usuario con rol admin_org o master
  // (los únicos con permiso de aprobación en T5.6). Preferimos admin_org.
  const admin = await client.query(
    `SELECT id FROM users WHERE role = 'admin_org' AND deleted_at IS NULL
     ORDER BY email LIMIT 1`,
  );
  if (admin.rows.length > 0) return admin.rows[0].id;
  const master = await client.query(
    `SELECT id FROM users WHERE role = 'master' AND deleted_at IS NULL
     ORDER BY email LIMIT 1`,
  );
  if (master.rows.length > 0) return master.rows[0].id;
  return null;
}

async function countExisting(client) {
  const rows = await client.query(
    `SELECT count(*)::int AS n FROM incidents WHERE title LIKE '[VOL] %'`,
  );
  return rows.rows[0].n;
}

/**
 * Inserción en lotes (BATCH_SIZE filas por INSERT) con multi-row VALUES.
 * Postgres limita a 65 535 parámetros por query; con ~14 columnas por
 * fila => ~4 600 filas por batch teóricamente. BATCH_SIZE=250 deja
 * ~3 500 parámetros, lejos del límite y rápido.
 */
async function batchInsert(client, table, columns, rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = [];
    let p = 1;
    for (const row of slice) {
      const ph = [];
      for (let c = 0; c < columns.length; c += 1) {
        ph.push(`$${p}`);
        values.push(row[columns[c]]);
        p += 1;
      }
      placeholders.push(`(${ph.join(', ')})`);
    }
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT (id) DO NOTHING`;
    await client.query(sql, values);
  }
}

/**
 * Construye las filas planas para `incidents` con todos los campos
 * derivados resueltos. Hace un round-trip SQL por incidente para el
 * ST_Contains (no se puede vectorizar porque la geometría es distinta
 * por fila); cachea el `category_id` por nombre.
 */
async function buildIncidentRows(client, rng, ctx) {
  const rows = [];
  for (let i = 0; i < TOTAL_INCIDENTS; i += 1) {
    const cantonCode = pick(rng, CANTON_CODES);
    const centroid = CANTON_CENTROIDS[cantonCode];
    const point = jitterCoord(rng, centroid);
    const zone = await resolveZoneForPoint(client, point, ctx.organizationId);
    const status = pickStatus(rng);
    const priority = pick(rng, PRIORITIES);
    const categoryName = pick(rng, CATEGORY_NAMES);
    const categoryId = ctx.categoryCache.get(categoryName) || null;
    const id = uuidV5(`vol/incident/${i}`, NS_SEED);
    const title = `${TITLE_PREFIX} ${categoryName} (${i})`;
    const description = `Vol seed #${i} — ${categoryName} en ${cantonCode} (${status}, ${priority})`;
    const createdAt = new Date(EPOCH.getTime() + i * 60 * 1000); // +1min por fila

    let resolutionDate = null;
    let claimedAt = null;
    let approvedBy = null;
    let approvedAt = null;
    let rejectedBy = null;
    let rejectedAt = null;
    let rejectionReason = null;
    let assignedTo = null;
    const shouldAssign = status !== 'pending';
    if (shouldAssign) {
      assignedTo = ctx.operatorId;
      claimedAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    }
    if (status === 'resolved' || status === 'closed') {
      resolutionDate = new Date(createdAt.getTime() + 60 * 60 * 1000);
    }
    if (status === 'closed' && ctx.approverId) {
      approvedBy = ctx.approverId;
      approvedAt = new Date(resolutionDate.getTime() + 30 * 60 * 1000);
    }

    rows.push({
      id,
      title,
      description,
      lng: point.lng,
      lat: point.lat,
      status,
      priority,
      citizen_id: ctx.citizenId,
      assigned_to: assignedTo,
      zone_id: zone.zone_id,
      organization_id: zone.organization_id,
      geofence_matched: zone.geofence_matched,
      category_id: categoryId,
      created_at: createdAt,
      updated_at: createdAt,
      claimed_by: shouldAssign ? ctx.operatorId : null,
      claimed_at: claimedAt,
      resolution_date: resolutionDate,
      approved_by: approvedBy,
      approved_at: approvedAt,
      rejected_by: rejectedBy,
      rejected_at: rejectedAt,
      rejection_reason: rejectionReason,
    });
  }
  return rows;
}

/**
 * Status history — una fila por transición VÁLIDA. NO escribimos la fila
 * approved->closed (ver header del archivo).
 */
function buildStatusHistoryRows(incidents) {
  const rows = [];
  for (let i = 0; i < incidents.length; i += 1) {
    const inc = incidents[i];
    if (inc.status === 'pending') continue;
    // pending -> in_progress
    rows.push({
      id: uuidV5(`vol/history/${i}/0`, NS_SEED),
      incident_id: inc.id,
      changed_by_user_id: inc.assigned_to,
      previous_status: 'pending',
      new_status: 'in_progress',
      event_id: `vol/${i}/0`,
      notes: null,
      created_at: new Date(inc.created_at.getTime() + 5 * 60 * 1000),
    });
    if (inc.status === 'resolved' || inc.status === 'closed') {
      // in_progress -> resolved
      rows.push({
        id: uuidV5(`vol/history/${i}/1`, NS_SEED),
        incident_id: inc.id,
        changed_by_user_id: inc.assigned_to,
        previous_status: 'in_progress',
        new_status: 'resolved',
        event_id: `vol/${i}/1`,
        notes: null,
        created_at: new Date(inc.created_at.getTime() + 60 * 60 * 1000),
      });
    }
    // ⚠️ NO escribimos resolved/approved -> closed (chk_status_history_new_status).
  }
  return rows;
}

function buildAssignmentRows(incidents) {
  const rows = [];
  for (let i = 0; i < incidents.length; i += 1) {
    const inc = incidents[i];
    if (inc.status === 'pending' || !inc.assigned_to) continue;
    rows.push({
      id: uuidV5(`vol/assignment/${i}`, NS_SEED),
      incident_id: inc.id,
      operator_id: inc.assigned_to,
      role: 'primary',
      created_at: new Date(inc.created_at.getTime() + 5 * 60 * 1000),
      deleted_at: null,
    });
  }
  return rows;
}

function buildNotificationRows(incidents, ctx) {
  const rows = [];
  for (let i = 0; i < incidents.length; i += 1) {
    const inc = incidents[i];
    const baseAt = inc.created_at.getTime();
    if (inc.status === 'pending') {
      // created
      rows.push({
        id: uuidV5(`vol/notif/${i}/0`, NS_SEED),
        user_id: ctx.operatorId,
        incident_id: inc.id,
        type: 'incident.created',
        message: `Vol: incidente #${i} creado`,
        data: {},
        read: false,
        processed_at: null,
        created_at: new Date(baseAt + 30 * 1000),
      });
    } else {
      // assigned
      rows.push({
        id: uuidV5(`vol/notif/${i}/0`, NS_SEED),
        user_id: ctx.operatorId,
        incident_id: inc.id,
        type: 'incident.assigned',
        message: `Vol: incidente #${i} asignado`,
        data: {},
        read: false,
        processed_at: null,
        created_at: new Date(baseAt + 5 * 60 * 1000 + 30 * 1000),
      });
      if (inc.status === 'resolved' || inc.status === 'closed') {
        // pending_approval (T5.6: cuando llega a resolved, notifica a admin_org)
        rows.push({
          id: uuidV5(`vol/notif/${i}/1`, NS_SEED),
          user_id: ctx.approverId || ctx.operatorId,
          incident_id: inc.id,
          type: 'incident_pending_approval',
          message: `Vol: incidente #${i} requiere aprobación`,
          data: {},
          read: false,
          processed_at: null,
          created_at: new Date(baseAt + 60 * 60 * 1000 + 30 * 1000),
        });
      }
    }
  }
  return rows;
}

/**
 * Comments — todos root, algunos con 1 reply, unos pocos con 1 reply al
 * reply (depth ≤ 2). 30% de incidentes: 0 comentarios. 50%: 1 root.
 * 15%: 1 root + 1 reply (depth 1). 5%: 1 root + 1 reply + 1 sub-reply
 * (depth 2). Total ≈ 0.7 + 0.15 + 0.05 comentarios por incidente.
 */
function buildCommentRows(incidents, rng, ctx) {
  const rows = [];
  for (let i = 0; i < incidents.length; i += 1) {
    const inc = incidents[i];
    const r = rng();
    if (r < 0.3) continue; // sin comentarios
    const rootId = uuidV5(`vol/comment/${i}/root`, NS_SEED);
    const rootAt = new Date(inc.created_at.getTime() + 2 * 60 * 1000);
    rows.push({
      id: rootId,
      content: `Comentario raíz (vol) sobre #${i}`,
      incident_id: inc.id,
      user_id: ctx.operatorId,
      parent_id: null,
      created_at: rootAt,
    });
    if (r < 0.85) continue; // sólo root
    const replyId = uuidV5(`vol/comment/${i}/reply`, NS_SEED);
    const replyAt = new Date(rootAt.getTime() + 60 * 1000);
    rows.push({
      id: replyId,
      content: `Respuesta al comentario raíz (vol) sobre #${i}`,
      incident_id: inc.id,
      user_id: ctx.citizenId,
      parent_id: rootId,
      created_at: replyAt,
    });
    if (r < 0.95) continue; // sólo root + reply
    const subId = uuidV5(`vol/comment/${i}/sub`, NS_SEED);
    const subAt = new Date(replyAt.getTime() + 60 * 1000);
    rows.push({
      id: subId,
      content: `Sub-respuesta (vol) sobre #${i}`,
      incident_id: inc.id,
      user_id: ctx.operatorId,
      parent_id: replyId,
      created_at: subAt,
    });
    if (r >= 0.99) {
      // Un cuarto nivel violaría la cap. Lo saltamos — la cap es
      // semántica, no se inflige ni para "rellenar densidad".
    }
  }
  return rows;
}

async function run(client, opts = {}) {
  enforce({
    scriptName: 'volume-incidents.js',
    argv: process.argv.slice(2).concat(opts.force ? ['--force'] : []),
  });

  // Auto-skip si la base ya tiene este volumen.
  const existing = await countExisting(client);
  if (existing >= TOTAL_INCIDENTS) {
    return { inserted: 0, skipped: existing, total: TOTAL_INCIDENTS, skippedAll: true };
  }

  const rng = mulberry32(SEED);
  const organizationId = await resolveOrganizationId(client);
  if (!organizationId) {
    throw new Error('volume-incidents.js: organization "CTE - Santa Elena" no existe — apply 0041 first.');
  }
  const categoryCache = await buildCategoryCache(client);
  const citizenId = await ensureCitizenReporter(client);
  const operatorId = await ensureOperator(client);
  const approverId = await ensureApprover(client);

  const ctx = { organizationId, categoryCache, citizenId, operatorId, approverId };

  // 1) incidents.
  // location es una columna `geometry(Point, 4326)` — no se puede
  // parametrizar como string; hay que construirla en SQL a partir de
  // lng/lat. batchInsertIncidents() hace exactamente eso (multi-row
  // INSERT vía jsonb_array_elements).
  const incidentRows = await buildIncidentRows(client, rng, ctx);
  await batchInsertIncidents(client, incidentRows);

  // 2) status_history
  const historyRows = buildStatusHistoryRows(incidentRows);
  if (historyRows.length > 0) {
    await batchInsert(client, 'status_history',
      ['id', 'incident_id', 'changed_by_user_id', 'previous_status', 'new_status', 'event_id', 'notes', 'created_at'],
      historyRows);
  }

  // 3) assignments
  const assignmentRows = buildAssignmentRows(incidentRows);
  if (assignmentRows.length > 0) {
    await batchInsert(client, 'assignments',
      ['id', 'incident_id', 'operator_id', 'role', 'created_at', 'deleted_at'],
      assignmentRows);
  }

  // 4) notifications
  const notificationRows = buildNotificationRows(incidentRows, ctx);
  if (notificationRows.length > 0) {
    await batchInsert(client, 'notifications',
      ['id', 'user_id', 'incident_id', 'type', 'message', 'data', 'read', 'processed_at', 'created_at'],
      notificationRows);
  }

  // 5) comments
  const commentRows = buildCommentRows(incidentRows, rng, ctx);
  if (commentRows.length > 0) {
    await batchInsert(client, 'comments',
      ['id', 'content', 'incident_id', 'user_id', 'parent_id', 'created_at'],
      commentRows);
  }

  return {
    inserted: incidentRows.length,
    skipped: 0,
    total: TOTAL_INCIDENTS,
    breakdown: {
      history: historyRows.length,
      assignments: assignmentRows.length,
      notifications: notificationRows.length,
      comments: commentRows.length,
    },
  };
}

/**
 * INSERT real para incidents — location es ST_MakePoint(lng, lat) en
 * 4326 y se construye DENTRO de SQL (no se puede pasar un string como
 * parámetro para una columna geometry).
 *
 * Estrategia: arrays paralelos + `UNNEST` con `WITH ORDINALITY`. Cada
 * columna se pasa como `text[]` (pg-node serializa arrays JS a text[])
 * y se castea en SQL. Más simple y rápido que JSONB (evita doble
 * encode/decode y el round-trip por `jsonb_array_elements`).
 */
async function batchInsertIncidents(client, rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const cols = {
      id: slice.map((r) => r.id),
      title: slice.map((r) => r.title),
      description: slice.map((r) => r.description),
      lng: slice.map((r) => String(r.lng)),
      lat: slice.map((r) => String(r.lat)),
      status: slice.map((r) => r.status),
      priority: slice.map((r) => r.priority),
      citizen_id: slice.map((r) => r.citizen_id),
      assigned_to: slice.map((r) => r.assigned_to),
      zone_id: slice.map((r) => r.zone_id),
      organization_id: slice.map((r) => r.organization_id),
      geofence_matched: slice.map((r) => String(r.geofence_matched)),
      category_id: slice.map((r) => r.category_id),
      created_at: slice.map((r) => r.created_at.toISOString()),
      claimed_by: slice.map((r) => r.claimed_by),
      claimed_at: slice.map((r) => (r.claimed_at ? r.claimed_at.toISOString() : null)),
      resolution_date: slice.map((r) => (r.resolution_date ? r.resolution_date.toISOString() : null)),
      approved_by: slice.map((r) => r.approved_by),
      approved_at: slice.map((r) => (r.approved_at ? r.approved_at.toISOString() : null)),
      rejected_by: slice.map((r) => r.rejected_by),
      rejected_at: slice.map((r) => (r.rejected_at ? r.rejected_at.toISOString() : null)),
      rejection_reason: slice.map((r) => r.rejection_reason),
    };
    const sql = `
      INSERT INTO incidents (
        id, title, description, location,
        status, priority,
        citizen_id, assigned_to, zone_id, organization_id, geofence_matched,
        category_id, created_at, updated_at,
        claimed_by, claimed_at, resolution_date,
        approved_by, approved_at, rejected_by, rejected_at, rejection_reason
      )
      SELECT
        (u.id)::uuid,
        u.title,
        u.description,
        ST_SetSRID(ST_MakePoint(u.lng::float8, u.lat::float8), 4326),
        u.status,
        u.priority,
        (u.citizen_id)::uuid,
        NULLIF(u.assigned_to, '')::uuid,
        NULLIF(u.zone_id, '')::uuid,
        NULLIF(u.organization_id, '')::uuid,
        u.geofence_matched::boolean,
        NULLIF(u.category_id, '')::uuid,
        u.created_at::timestamptz,
        u.created_at::timestamptz,
        NULLIF(u.claimed_by, '')::uuid,
        NULLIF(u.claimed_at, '')::timestamptz,
        NULLIF(u.resolution_date, '')::timestamptz,
        NULLIF(u.approved_by, '')::uuid,
        NULLIF(u.approved_at, '')::timestamptz,
        NULLIF(u.rejected_by, '')::uuid,
        NULLIF(u.rejected_at, '')::timestamptz,
        NULLIF(u.rejection_reason, '')
      FROM unnest(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
        $11::text[], $12::text[], $13::text[], $14::text[], $15::text[],
        $16::text[], $17::text[], $18::text[], $19::text[], $20::text[],
        $21::text[], $22::text[]
      ) WITH ORDINALITY AS u(
        id, title, description, lng, lat,
        status, priority, citizen_id, assigned_to, zone_id,
        organization_id, geofence_matched, category_id, created_at, claimed_by,
        claimed_at, resolution_date, approved_by, approved_at, rejected_by,
        rejected_at, rejection_reason
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await client.query(sql, [
      cols.id, cols.title, cols.description, cols.lng, cols.lat,
      cols.status, cols.priority, cols.citizen_id, cols.assigned_to, cols.zone_id,
      cols.organization_id, cols.geofence_matched, cols.category_id, cols.created_at, cols.claimed_by,
      cols.claimed_at, cols.resolution_date, cols.approved_by, cols.approved_at, cols.rejected_by,
      cols.rejected_at, cols.rejection_reason,
    ]);
  }
}

async function main() {
  const client = new Client();
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(
      `volume-incidents.js: failed to connect — ${err && err.message ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
  try {
    const result = await run(client, { force: process.argv.includes('--force') });
    process.stdout.write(
      `volume-incidents.js: inserted=${result.inserted} skipped=${result.skipped} total=${result.total}` +
        (result.breakdown
          ? ` (history=${result.breakdown.history}, assignments=${result.breakdown.assignments}, notifications=${result.breakdown.notifications}, comments=${result.breakdown.comments})`
          : '') +
        (result.skippedAll ? ' [skipped — already seeded]' : '') +
        '\n',
    );
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`volume-incidents.js: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = {
  run,
  TOTAL_INCIDENTS,
  BATCH_SIZE,
  COMMENT_DEPTH_CAP,
  STATUS_MIX,
};

if (require.main === module) {
  main();
}
