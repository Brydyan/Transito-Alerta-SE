import { resolve } from 'node:path';
import { MigrationHarness } from '../support/migration-harness';

/**
 * QA SC-405 — migración 0068 `status_history_status_checks`.
 *
 * Síntoma verificado en la DB de desarrollo: dos flujos de producción
 * terminaban en 500 `QueryFailedError` al escribir en `status_history`.
 *
 *   1) Cierre de incidencia — `PATCH /api/incidents/:id/status`
 *      `IncidentWorkflowService.changeStatus()`
 *      (incident-workflow.service.ts:419) inserta `new_status = 'closed'`.
 *   2) Nacimiento de una incidencia — `IncidentsService.create()`
 *      (incidents.service.ts:153) siembra `previous_status = 'created'`
 *      (Fix R-historial de sc-405).
 *
 * Los CHECK de `status_history` que creó 0014_status_history.sql:47-57
 * admiten `('pending','in_progress','resolved')` y nada más: congelaron el
 * dominio antes de que sc-315 añadiera `closed` a la máquina de estados, y
 * antes de que sc-405 necesitara el sentinel `created`.
 *
 *     ERROR: new row for relation "status_history" violates check
 *            constraint "chk_status_history_new_status"
 *
 * 0068 reescribe ambos CHECK derivándolos de la máquina de estados
 * (`TRANSITIONS`, incident-state-machine.ts): los cuatro estados, más el
 * sentinel `created` que sólo puede ser origen.
 *
 * Este spec arranca con el esquema ANTERIOR a 0068 y demuestra primero que
 * los dos flujos fallan, para que la regresión no se pueda "arreglar"
 * borrando el síntoma. Después verifica el dominio ampliado, que la
 * constraint siga rechazando basura (ampliar no es volver permisiva), que
 * el no-op update siga bloqueado, que 0068 sea idempotente, y que el
 * rollback DOWN sea honesto sobre lo que sacrifica.
 */
describe('QA SC-405 — 0068 status_history_status_checks', () => {
  const REPO_ROOT = resolve(__dirname, '../../..');
  const DOWN_PATH = resolve(
    REPO_ROOT,
    'database/rollback/0068_status_history_status_checks.DOWN.sql',
  );

  let db: MigrationHarness;
  let incidentId: string;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    // Esquema completo ANTES de la 0068: tal como estaba una DB con el
    // defecto, con los CHECK estrechos de 0014.
    await db.applyRange({ from: '0001', to: '0067' });

    // `incidents` sólo exige title y location (geometry). El actor queda
    // NULL porque `changed_by_user_id` es nullable (FK ON DELETE SET NULL).
    const [incident] = await db.rows<{ id: string }>(
      `INSERT INTO incidents (title, location)
       VALUES ('[0068] incidente de prueba',
               ST_SetSRID(ST_MakePoint(-80.8, -2.2), 4326))
       RETURNING id`,
    );
    incidentId = incident.id;
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  }, 120_000);

  /** Inserta una fila de audit trail como hacen los servicios. */
  async function record(
    previousStatus: string,
    newStatus: string,
    notes?: string,
  ): Promise<void> {
    await db.rows(
      `INSERT INTO status_history
         (incident_id, changed_by_user_id, previous_status, new_status, notes, event_id)
       VALUES ($1, NULL, $2, $3, $4, gen_random_uuid()::text)`,
      [incidentId, previousStatus, newStatus, notes ?? null],
    );
  }

  async function historyCount(): Promise<number> {
    const [{ count }] = await db.rows<{ count: string }>(
      `SELECT COUNT(*) AS count FROM status_history WHERE incident_id = $1`,
      [incidentId],
    );
    return Number(count);
  }

  describe('estado previo a 0068 — los dos flujos que fallan en producción', () => {
    it('create() no puede sembrar su fila de nacimiento (previous_status=created)', async () => {
      await expect(record('created', 'pending')).rejects.toThrow(
        /chk_status_history_previous_status/,
      );
    });

    it('el cierre de una incidencia no puede registrarse (new_status=closed)', async () => {
      await expect(record('in_progress', 'closed', '[closed] motivo')).rejects.toThrow(
        /chk_status_history_new_status/,
      );
    });
  });

  describe('0068A — el dominio ampliado deja pasar los dos flujos', () => {
    beforeAll(async () => {
      await db.applyVersion('0068');
    });

    it('acepta la fila de nacimiento que siembra create()', async () => {
      const before = await historyCount();
      await record('created', 'pending');
      expect(await historyCount()).toBe(before + 1);
    });

    it('acepta el registro del cierre con su motivo en notes', async () => {
      const before = await historyCount();
      await record('in_progress', 'closed', '[closed] vía hotline resuelta');
      const [row] = await db.rows<{ previous_status: string; new_status: string; notes: string }>(
        `SELECT previous_status, new_status, notes
           FROM status_history
          WHERE incident_id = $1 AND new_status = 'closed'`,
        [incidentId],
      );
      expect(row.previous_status).toBe('in_progress');
      expect(row.notes).toBe('[closed] vía hotline resuelta');
      expect(await historyCount()).toBe(before + 1);
    });

    it('acepta previous_status=closed si la máquina gana una reapertura', async () => {
      // `closed` es terminal hoy (TRANSITIONS.closed = []), así que nunca se
      // lee desde ahí. Admitirlo es para que una reapertura futura no
      // encuentre este CHECK como el segundo 500 esperándola.
      const before = await historyCount();
      await record('closed', 'in_progress');
      expect(await historyCount()).toBe(before + 1);
    });
  });

  describe('0068B — ampliar el dominio no vuelve la constraint permisiva', () => {
    it('sigue rechazando un estado que no existe', async () => {
      await expect(record('in_progress', 'archivada')).rejects.toThrow(
        /chk_status_history_new_status/,
      );
    });

    it('sigue rechazando el sentinel created como DESTINO', async () => {
      // `created` marca "nace aquí": es origen, nunca destino. Admitirlo en
      // new_status abriría la puerta a un previous_status sin origen real.
      await expect(record('pending', 'created')).rejects.toThrow(
        /chk_status_history_new_status/,
      );
    });

    it('sigue rechazando un previous_status que no existe', async () => {
      await expect(record('inventada', 'pending')).rejects.toThrow(
        /chk_status_history_previous_status/,
      );
    });

    it('sigue rechazando el no-op update (chk_status_history_transition intacto)', async () => {
      await expect(record('resolved', 'resolved')).rejects.toThrow(
        /chk_status_history_transition/,
      );
    });
  });

  describe('0068C — idempotencia', () => {
    it('re-aplicar 0068 deja el mismo dominio y no pierde filas', async () => {
      const before = await historyCount();
      await db.applyVersion('0068');
      await db.applyVersion('0068');

      expect(await historyCount()).toBe(before);
      // El dominio sigue siendo el ampliado, no el estrecho.
      await expect(record('in_progress', 'closed', '[closed] tras re-aplicar')).resolves.toBeUndefined();
      await expect(record('created', 'pending')).resolves.toBeUndefined();
    });
  });

  describe('0068D — el rollback DOWN es honesto sobre lo que sacrifica', () => {
    it('con filas created/closed presentes, el DOWN falla en vez de destruir audit trail', async () => {
      // El DOWN devuelve el dominio estrecho de 0014. Con filas que ese
      // dominio no admite, el ALTER no aplica y el operador conserva el
      // dominio nuevo: prefiere un error visible a perder el audit trail.
      expect(await historyCount()).toBeGreaterThan(0);
      await expect(db.applyFile(DOWN_PATH)).rejects.toThrow(/chk_status_history/);

      // El script abre su propio BEGIN y el ALTER falla DENTRO, así que la
      // transacción queda abortada en el cliente. Postgres exige un ROLLBACK
      // explícito antes de volver a usar la conexión; sin esto, todo comando
      // posterior responde "current transaction is aborted". El rollback
      // también deshace los DROP CONSTRAINT del intento fallido, dejando el
      // dominio de 0068 intacto para el caso siguiente.
      await db.rows('ROLLBACK');
    });

    it('sin esas filas, el DOWN restaura el dominio de 0014', async () => {
      await db.rows(`DELETE FROM status_history WHERE incident_id = $1`, [incidentId]);
      await db.applyFile(DOWN_PATH);

      await expect(record('in_progress', 'closed')).rejects.toThrow(
        /chk_status_history_new_status/,
      );
      await expect(record('created', 'pending')).rejects.toThrow(
        /chk_status_history_previous_status/,
      );
      // Y lo que sí estaba en 0014 sigue entrando.
      await expect(record('pending', 'in_progress')).resolves.toBeUndefined();
    });
  });
});