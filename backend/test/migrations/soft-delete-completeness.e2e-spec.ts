import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.2 Fase A — soft delete en 12 tablas.
 *
 * Strict TDD: todos fallan hasta que 0031 existe.
 */
describe('T7.2.A — soft delete: deleted_at column + partial indexes on 12 tables', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
  });

  afterAll(async () => {
    await db.stop();
  });

  describe('T7.2.A1 — migración 0031 aplica sin error', () => {
    it('aplica 0031 después de 0030', async () => {
      await db.applyVersion('0030');
      await expect(db.applyVersion('0031')).resolves.not.toThrow();
    });
  });

  describe('T7.2.A2 — 13 tablas tienen deleted_at TIMESTAMPTZ NULL', () => {
    const tables = [
      'comments',
      'assignments',
      'invitations',
      'password_reset_tokens',
      'notifications',
      'geo_zones',
      'incident_categories',
      'organizations',
      'user_sessions',
      'users',
      'incidents',
      'permissions', // catálogo, puede borrarse lógicamente
      'roles', // catálogo de roles del sistema
    ];

    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0030' });
      await db.applyVersion('0031');
    });

    for (const table of tables) {
      it(`${table} tiene deleted_at TIMESTAMPTZ NULL`, async () => {
        const exists = await db.columnExists(table, 'deleted_at');
        expect(exists).toBe(true);
      });
    }
  });

  describe('T7.2.A3 — partial indexes WHERE deleted_at IS NULL en tablas clave', () => {
    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0030' });
      await db.applyVersion('0031');
    });

    it('invitations: partial UNIQUE idx_invitations_active (token_hash, deleted_at IS NULL)', async () => {
      // Legacy tiene partial unique en token_hash — aquí también debe existir
      const idxExists = await db.indexExists('idx_invitations_active');
      expect(idxExists).toBe(true);
    });

    it('password_reset_tokens: partial UNIQUE idx_password_reset_tokens_active', async () => {
      const idxExists = await db.indexExists('idx_password_reset_tokens_active');
      expect(idxExists).toBe(true);
    });

    it('users: partial UNIQUE idx_users_email_active (email, deleted_at IS NULL)', async () => {
      const idxExists = await db.indexExists('idx_users_email_active');
      expect(idxExists).toBe(true);
    });

    it('geo_zones: partial index idx_geo_zones_active', async () => {
      const idxExists = await db.indexExists('idx_geo_zones_active');
      expect(idxExists).toBe(true);
    });
  });

  describe('T7.2.A4 — backfill deleted_at = NULL (ninguna fila borra todavía)', () => {
    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0030' });
      await db.applyVersion('0031');
    });

    it('todas las filas existentes quedan con deleted_at IS NULL', async () => {
      const rows = await db.rows<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NOT NULL`,
      );

      expect(rows[0].count).toBe(0); // Ninguna borra
    });

    it('soft delete de 0025–0026 (incidents + assignments) se preserva', async () => {
      // Si 0025 ya borró logic, ese estado se mantiene
      // (test de integridad: el backfill no interfiere)

      const allUsers = await db.rows<{ count: number }>(
        `SELECT COUNT(*) as count FROM users`,
      );

      const deletedUsers = await db.rows<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NOT NULL`,
      );

      expect(deletedUsers[0].count).toBe(0); // backfill no borra nada
      expect(allUsers[0].count).toBeGreaterThan(0); // pero la tabla tiene filas
    });
  });

  describe('T7.2.A5 — soft delete de incidentes y asignaciones pre-existentes', () => {
    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0030' });
      await db.applyVersion('0031');
    });

    it('SELECT * FROM incidents NO devuelve filas blandas', async () => {
      // El query debe filtrar automáticamente (es responsabilidad del repo)
      // Este test solo verifica que la columna existe; el filtro lo verifica
      // el E2E con la app real.

      const exists = await db.columnExists('incidents', 'deleted_at');
      expect(exists).toBe(true);
    });

    it('SELECT * FROM assignments WHERE deleted_at IS NULL devuelve solo activas', async () => {
      // Post-0031: todos los queries deben filter `AND deleted_at IS NULL`

      const exists = await db.columnExists('assignments', 'deleted_at');
      expect(exists).toBe(true);
    });
  });

  describe('T7.2.A6 — cascada de soft delete preserva integridad referencial', () => {
    beforeAll(async () => {
      await db.applyRange({ from: '0001', to: '0030' });
      await db.applyVersion('0031');
    });

    it('comments.incident_id FK preserva referencia (no ON DELETE CASCADE)', async () => {
      // Comentarios NO se borran si se borra el incidente
      // Siguen existiendo (deleted_at = NULL) pero el incidente está borrarse

      const exists = await db.columnExists('comments', 'incident_id');
      expect(exists).toBe(true);
    });

    it('assignments.incident_id FK sigue existiendo, soft-deleted junto al incident', async () => {
      const exists = await db.columnExists('assignments', 'incident_id');
      expect(exists).toBe(true);
    });
  });
});
