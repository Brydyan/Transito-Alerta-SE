import { MigrationHarness } from '../support/migration-harness';

/**
 * QA SC-405 (R-anonymous) — migración 0067 `restore_anonymous_mask`.
 *
 * Síntoma verificado en la DB de desarrollo: la fila máscara
 * `users.device_uuid = 'anonymous'` no existe, pese a que 0001 (que la
 * siembra) y 0048 figuran como aplicadas. Cuando el esquema se bootstrapó
 * por backfill (0030 marca 0001–0029 como aplicadas sin ejecutar su
 * contenido), la siembra de 0001 nunca materializó la fila, y
 * `IncidentsService.resolveMaskUserId()` lanza en runtime:
 *
 *   Anonymous mask row not found (device_uuid='anonymous').
 *   Migrations 0001 and 0048 must be applied.
 *
 * 0067 es un insert-or-repair idempotente: crea la fila si falta y la
 * restaura si existe desviada (soft-delete, desactivada, permisos no
 * vacíos, o rol asignado por error). Este spec reproduce los cuatro
 * estados rotos contra un Postgres real y verifica que la reparación
 * devuelve la forma canónica documentada (R-AUD-5): permisos `[]`
 * (0048 cerró el techo anónimo), activa, sin rol, no borrada.
 */
describe('QA SC-405 — 0067 restore_anonymous_mask', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    // Esquema completo ANTES de la 0067, tal como estaría una DB con el
    // defecto: 0001 sembró la fila, 0048 vació sus permisos.
    await db.applyRange({ from: '0001', to: '0066' });
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  }, 120_000);

  /** Forma canónica de la fila tras 0067 (AUD R-AUD-5 + ANON 0048). */
  async function expectCanonicalMaskRow(): Promise<void> {
    const [row] = await db.rows<{
      device_uuid: string;
      permissions: unknown;
      is_active: boolean;
      role_id: string | null;
      role: string | null;
      deleted_at: string | null;
    }>(
      `SELECT device_uuid, permissions, is_active, role_id, role, deleted_at
         FROM users WHERE device_uuid = 'anonymous'`,
    );
    expect(row).toBeDefined();
    expect(row.device_uuid).toBe('anonymous');
    expect(row.permissions).toEqual([]);
    expect(row.is_active).toBe(true);
    expect(row.role_id).toBeNull();
    expect(row.deleted_at).toBeNull();
  }

  describe('0067A — insert (fila faltante, síntoma del backfill)', () => {
    it('crea la fila con la forma canónica cuando no existe', async () => {
      // Simula la DB donde la siembra de 0001 no materializó la fila.
      await db.rows(`DELETE FROM users WHERE device_uuid = 'anonymous'`);
      await expect(db.rows(`SELECT id FROM users WHERE device_uuid = 'anonymous'`))
        .resolves.toHaveLength(0);

      await db.applyVersion('0067');

      await expectCanonicalMaskRow();
    });

    it('re-aplicar 0067 es idempotente (no duplica, no desvía)', async () => {
      await db.applyVersion('0067');
      const [{ count }] = await db.rows<{ count: string }>(
        `SELECT COUNT(*) AS count FROM users WHERE device_uuid = 'anonymous'`,
      );
      expect(Number(count)).toBe(1);
      await expectCanonicalMaskRow();
    });
  });

  describe('0067B — repair (fila existente pero desviada)', () => {
    it('restaura una fila soft-deleted', async () => {
      await db.rows(
        `UPDATE users
            SET deleted_at = now(),
                is_active  = false,
                updated_at = now()
          WHERE device_uuid = 'anonymous'`,
      );
      await db.applyVersion('0067');
      await expectCanonicalMaskRow();
    });

    it('restaura permisos no vacíos (techo reabierto por error)', async () => {
      await db.rows(
        `UPDATE users
            SET permissions = '["READ incidents", "CREATE incidents"]'::jsonb,
                updated_at  = now()
          WHERE device_uuid = 'anonymous'`,
      );
      await db.applyVersion('0067');
      await expectCanonicalMaskRow();
    });

    it('quita un role_id asignado por error (la máscara no tiene rol)', async () => {
      await db.rows(
        `UPDATE users
            SET role_id = (SELECT id FROM roles WHERE name = 'reporter' LIMIT 1)
          WHERE device_uuid = 'anonymous'`,
      );
      await db.applyVersion('0067');
      await expectCanonicalMaskRow();
    });
  });

  describe('0067C — la fila reparada es usable por el runtime', () => {
    it('resolveMaskUserId encuentra el id (SELECT por device_uuid)', async () => {
      const [row] = await db.rows<{ id: string }>(
        `SELECT id FROM users WHERE device_uuid = 'anonymous' LIMIT 1`,
      );
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });
});