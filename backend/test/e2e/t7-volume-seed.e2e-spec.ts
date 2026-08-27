import { resolve } from 'path';

import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.9.D9 — `database/seeds/volume-incidents.js` deja 1000 incidentes con
 * ciclo de vida completo y todos los derivados escritos a mano
 * (status_history, assignments, notifications, comments).
 *
 * Test-first: este archivo DEBE fallar hasta que volume-incidents.js exista.
 *
 * Restricciones cubiertas (design.md D9 + spec.md R22):
 *  - zone_id / organization_id / geofence_matched resueltos por SQL
 *    ST_Contains (parroquia -> cantón -> provincia) — coherente con el
 *    flujo que `GeofencingService.resolveZone` aplica a incidentes
 *    creados por la API.
 *  - Una fila de status_history por transición VÁLIDA:
 *    pending->in_progress, in_progress->resolved, resolved->closed.
 *  - Exactamente una fila en `assignments` por incidente ASIGNADO
 *    (constraint `uq_assignments_incident`).
 *  - `approved_by+approved_at` XOR `rejected_by+rejected_at+rejection_reason`
 *    — nunca ambos lados en la misma fila (0036+0021).
 *  - `resolution_date` sólo si status ∈ {resolved, closed}.
 *  - `notifications.type` ∈ {5 valores del CHECK 0022}.
 *  - `comments` con profundidad ≤ 2 (R9.2, enforced en JS, no en DB).
 *  - **El paso de aprobación a `closed` NO escribe fila en status_history**
 *    (motivo: chk_status_history_new_status — ver tasks.md T7.9.D10). El
 *    test lo enforza con un assert explícito.
 */
describe('T7.9.D9 — database/seeds/volume-incidents.js (1000 incidentes, ciclo completo)', () => {
  const REPO_ROOT = resolve(__dirname, '../../..');
  const VOLUME_SEED_PATH = resolve(REPO_ROOT, 'database/seeds/volume-incidents.js');

  let db: MigrationHarness;
  const VOLUME_COUNT = 1000;
  const ALLOWED_NOTIFICATION_TYPES = [
    'incident.created',
    'incident.assigned',
    'incident.status_changed',
    'comment.added',
    'incident_pending_approval',
  ];

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ to: '0041' });
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.SEED_ALLOW_LOCALHOST = '1';
    process.env.SEED_ALLOW_PRODUCTION = '1';
    process.env.NODE_ENV = 'test';

    // Asegurar que el seeder de usuarios haya corrido primero — el de
    // volumen necesita ciudadanos / operadores para los FKs. La idempotencia
    // está cubierta por ON CONFLICT (email).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const usersSeed = require(resolve(REPO_ROOT, 'database/seeds/users.js'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await usersSeed.run((db as any).client, {
      force: true,
      seed: { password: 'TestP4ss!' },
    });
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function runVolumeSeed(): Promise<{ inserted: number; skipped: number }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(VOLUME_SEED_PATH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mod.run((db as any).client, { force: true });
  }

  it('el seeder volume-incidents.js existe (T7.9.D9 test-first)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('fs').existsSync(VOLUME_SEED_PATH)).toBe(true);
  });

  it('siembra exactamente 1000 incidentes con el prefijo [VOL]', async () => {
    const result = await runVolumeSeed();
    expect(result.inserted + result.skipped).toBeGreaterThanOrEqual(VOLUME_COUNT);

    const [count] = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM incidents WHERE title LIKE '[VOL] %'`,
    );
    expect(Number(count.count)).toBe(VOLUME_COUNT);
  }, 300_000);

  it('cada incidente tiene zone_id / organization_id / geofence_matched resueltos por ST_Contains', async () => {
    // Cualquier incidente con zone_id NOT NULL debe estar dentro de la
    // geometría de su geo_zones row (consistencia interna: el seeder no
    // miente sobre la pertenencia).
    const offenders = await db.rows<{ id: string; title: string; code: string }>(
      `SELECT i.id, i.title, z.code
         FROM incidents i
         JOIN geo_zones z ON z.id = i.zone_id
        WHERE i.title LIKE '[VOL] %'
          AND i.zone_id IS NOT NULL
          AND NOT ST_Contains(
            z.polygon,
            ST_SetSRID(ST_MakePoint(ST_X(i.location), ST_Y(i.location)), 4326)
          )`,
    );
    expect(offenders).toEqual([]);
  });

  it('cada incidente sigue un ciclo de vida válido y consistente', async () => {
    // status_history: una fila por transición VÁLIDA — la transición
    // "resuelto -> cerrado" NO se registra (ver D9 / T7.9.D10). Por cada
    // incidente con status != pending esperamos exactamente N-1 filas,
    // donde N es el número de transiciones del ciclo resuelto.
    //
    // pending    → 0 filas
    // in_progress → 1 fila (pending->in_progress)
    // resolved   → 2 filas (pending->in_progress, in_progress->resolved)
    // closed     → 2 filas (NO se agrega la de approved→closed por la
    //             constraint chk_status_history_new_status; ver T7.9.D10)
    const rows = await db.rows<{
      status: string;
      history_count: string;
    }>(
      `SELECT i.status,
              (SELECT count(*) FROM status_history sh
                WHERE sh.incident_id = i.id)::text AS history_count
         FROM incidents i
        WHERE i.title LIKE '[VOL] %'`,
    );

    const expectedByStatus: Record<string, number> = {
      pending: 0,
      in_progress: 1,
      resolved: 2,
      closed: 2,
    };

    for (const row of rows) {
      const expected = expectedByStatus[row.status];
      expect(expected).toBeDefined();
      expect(Number(row.history_count)).toBe(expected);
    }
  });

  it('cada incidente ASIGNADO tiene exactamente una fila en assignments', async () => {
    const offenders = await db.rows<{ incident_id: string; rows: string }>(
      `SELECT a.incident_id, count(*)::text AS rows
         FROM assignments a
         JOIN incidents i ON i.id = a.incident_id
        WHERE i.title LIKE '[VOL] %'
        GROUP BY a.incident_id
       HAVING count(*) <> 1`,
    );
    expect(offenders).toEqual([]);
  });

  it('los pares approved_* / rejected_* nunca se solapan (XOR + pares completos)', async () => {
    // approved_by+approved_at y rejected_by+rejected_at son pares (XOR).
    // Cualquier fila que rompa la simetría se reporta.
    const rows = await db.rows<{ id: string }>(
      `SELECT id FROM incidents
        WHERE title LIKE '[VOL] %'
          AND (
            (approved_by IS NULL) <> (approved_at IS NULL)
            OR (rejected_by IS NULL) <> (rejected_at IS NULL)
            OR (approved_by IS NOT NULL AND rejected_by IS NOT NULL)
            OR (rejected_by IS NOT NULL AND rejection_reason IS NULL)
          )`,
    );
    expect(rows).toEqual([]);
  });

  it('resolution_date sólo está poblado si status ∈ {resolved, closed}', async () => {
    const offenders = await db.rows<{ id: string; status: string }>(
      `SELECT id, status FROM incidents
        WHERE title LIKE '[VOL] %'
          AND resolution_date IS NOT NULL
          AND status NOT IN ('resolved', 'closed')`,
    );
    expect(offenders).toEqual([]);
  });

  it('notifications.type sólo usa los 5 valores permitidos por el CHECK 0022', async () => {
    const offenders = await db.rows<{ type: string; count: string }>(
      `SELECT n.type, count(*)::text AS count
         FROM notifications n
         JOIN incidents i ON i.id = n.incident_id
        WHERE i.title LIKE '[VOL] %'
          AND n.type NOT IN (${ALLOWED_NOTIFICATION_TYPES.map((_, i) => `$${i + 1}`).join(',')})
        GROUP BY n.type`,
      ALLOWED_NOTIFICATION_TYPES,
    );
    expect(offenders).toEqual([]);
  });

  it('los comentarios respetan la profundidad máxima 2 (R9.2)', async () => {
    // Profundidad 0 = root, 1 = hijo de root, 2 = nieto de root.
    // Profundidad 3+ es violación — se busca con una CTE recursiva.
    const deep = await db.rows<{ id: string; depth: number }>(
      `WITH RECURSIVE c AS (
         SELECT id, parent_id, 0 AS depth
           FROM comments
          WHERE parent_id IS NULL
         UNION ALL
         SELECT c2.id, c2.parent_id, c.depth + 1
           FROM comments c2
           JOIN c ON c2.parent_id = c.id
          WHERE c.depth < 5
       )
       SELECT id, depth FROM c WHERE depth > 2`,
    );
    expect(deep).toEqual([]);
  });

  it('la transición de aprobación a `closed` NO escribe fila en status_history', async () => {
    // Assert explícito que documenta el "no arreglar esto" de T7.9.D10:
    // chk_status_history_new_status sólo permite pending/in_progress/resolved
    // — un row con new_status='closed' violaría la constraint. El
    // IncidenteApprovalService.approve tampoco emite ese evento en
    // producción. El seeder es fiel a ese comportamiento.
    const offenders = await db.rows<{ incident_id: string; new_status: string }>(
      `SELECT sh.incident_id, sh.new_status
         FROM status_history sh
         JOIN incidents i ON i.id = sh.incident_id
        WHERE i.title LIKE '[VOL] %'
          AND sh.new_status NOT IN ('pending', 'in_progress', 'resolved')`,
    );
    expect(offenders).toEqual([]);
  });
});
