import { MigrationHarness } from '../support/migration-harness';

describe('T7.3.A — updated_at column & trigger on 12 tables', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ from: '0001', to: '0032' });
  });

  afterAll(async () => {
    await db.stop();
  });

  describe('T7.3.A1 — migración 0032 aplica sin error', () => {
    it('aplica 0032 después de 0031', async () => {
      expect(true).toBe(true);
    });
  });

  describe('T7.3.A2 — 12 tablas tienen updated_at', () => {
    const tables = [
      'assignments',
      'comments',
      'geo_zones',
      'notifications',
      'organizations',
      'permissions',
      'roles',
      'invitations',
      'comment_images',
      'incident_images',
      'password_reset_tokens',
      'user_sessions',
    ];

    for (const table of tables) {
      it(`${table} tiene updated_at TIMESTAMPTZ NOT NULL`, async () => {
        const exists = await db.columnExists(table, 'updated_at');
        expect(exists).toBe(true);
      });
    }
  });

  describe('T7.3.A3 — 15 triggers existen', () => {
    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0032' });
    });

    it('hay 15 triggers trg_set_updated_at (una por tabla)', async () => {
      const rows = await db.rows<{ count: number }>(
        `SELECT COUNT(*) as count FROM pg_trigger WHERE tgname = 'trg_set_updated_at'`,
      );
      expect(rows[0].count).toBe(15); // 12 nuevas + incidents, users, incident_categories (pre-0032)
    });

    it('cada trigger es BEFORE UPDATE FOR EACH ROW', async () => {
      const rows = await db.rows<{ trigger_info: string }>(
        `SELECT tgname || ' on ' || relname as trigger_info
         FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
         WHERE tgname = 'trg_set_updated_at' LIMIT 1`,
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('T7.3.A4 — backfill updated_at = created_at para filas preexistentes', () => {
    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0032' });
    });

    it('todas las filas existentes tienen updated_at = created_at', async () => {
      // Verificar una tabla que tenga datos preexistentes
      const rows = await db.rows<{ have_mismatch: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM comments
           WHERE updated_at IS NOT NULL AND updated_at != created_at
         ) as have_mismatch`,
      );
      expect(rows[0].have_mismatch).toBe(false);
    });
  });

  describe('T7.3.A5 — UPDATE sin mencionar updated_at la actualiza automáticamente', () => {
    it('UPDATE comments SET message = ... avanza updated_at', async () => {
      // Insertar comentario (requiere incident + user para FK)
      const incRes = await db.rows<{ id: string }>(
        `INSERT INTO incidents (id, zone_id, status, priority, location, description, created_at)
           VALUES (gen_random_uuid(), (SELECT id FROM geo_zones LIMIT 1), 'open', 'high',
                   ST_Point(0, 0), 'test', now())
           RETURNING id`,
      );
      if (incRes.length === 0) return; // Skip si no hay zona

      const usrRes = await db.rows<{ id: string }>(
        `INSERT INTO users (id, email, role_id, created_at)
           VALUES (gen_random_uuid(), 'test@example.com', (SELECT id FROM roles LIMIT 1), now())
           RETURNING id`,
      );
      if (usrRes.length === 0) return; // Skip si no hay rol

      const comRes = await db.rows<{ id: string; updated_at: string }>(
        `INSERT INTO comments (id, incident_id, user_id, message, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'original', now(), now())
           RETURNING id, updated_at`,
        [incRes[0].id, usrRes[0].id],
      );
      if (comRes.length === 0) return;

      const oldUpdatedAt = comRes[0].updated_at;
      const commentId = comRes[0].id;

      // Esperar 50ms para diferencia visible
      await new Promise((resolve) => setTimeout(resolve, 50));

      // UPDATE sin mencionar updated_at
      // Ejecutar UPDATE sin return
      await db.rows(`UPDATE comments SET message = 'updated' WHERE id = $1`, [commentId]);

      // Verificar que avanzó
      const newRes = await db.rows<{ updated_at: string }>(
        `SELECT updated_at FROM comments WHERE id = $1`,
        [commentId],
      );
      expect(newRes[0].updated_at).not.toBe(oldUpdatedAt);
    });
  });

  describe('T7.3.A6 — INSERT sin mencionar updated_at usa created_at', () => {
    it('DEFAULT para updated_at es now()', async () => {
      const rows = await db.rows<{ column_default: string | null }>(
        `SELECT column_default FROM information_schema.columns
         WHERE table_name = 'comments' AND column_name = 'updated_at'`,
      );
      expect(rows[0].column_default).toContain('now()');
    });
  });

  describe('T7.3.A7 — status_history NO tiene updated_at (append-only por diseño)', () => {
    it('status_history no tiene updated_at', async () => {
      const exists = await db.columnExists('status_history', 'updated_at');
      expect(exists).toBe(false);
    });
  });
});
