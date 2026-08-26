import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.2 Fase A — soft delete en 13 tablas (migración 0031).
 *
 * `MigrationHarness` es *connection-scoped*: `applyRange` ejecuta los ficheros
 * tal cual, sin consultar `schema_migrations`. Re-aplicar un rango sobre la
 * misma conexión revienta (`constraint "fk_organizations_zone" ... already
 * exists`) y deja la transacción abortada, arrastrando en cascada todo lo que
 * venga después. Por eso la cadena de migraciones se aplica UNA sola vez aquí
 * y ningún `describe` anidado vuelve a montar nada.
 *
 * Alcance: esta suite verifica la FORMA del esquema tras 0031 (columnas,
 * índices parciales, estado inicial de los datos). El comportamiento de
 * filtrado — que los repositorios efectivamente excluyan las filas con
 * `deleted_at IS NOT NULL` — es Fase B/C y se cubre con la app real en
 * `test/e2e/`, no aquí.
 */
describe('T7.2.A — soft delete: deleted_at column + partial indexes', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ from: '0001', to: '0031' });
  }, 240_000);

  afterAll(async () => {
    await db?.stop();
  }, 120_000);

  describe('T7.2.A1 — 0031 es re-aplicable', () => {
    it('re-aplicar 0031 no lanza (todo el fichero es IF NOT EXISTS)', async () => {
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

    for (const table of tables) {
      it(`${table} tiene deleted_at`, async () => {
        expect(await db.columnExists(table, 'deleted_at')).toBe(true);
      });
    }
  });

  describe('T7.2.A3 — partial indexes WHERE deleted_at IS NULL en tablas clave', () => {
    const indexes = [
      'idx_invitations_active',
      'idx_password_reset_tokens_active',
      'idx_users_email_active',
      'idx_geo_zones_active',
    ];

    for (const index of indexes) {
      it(`${index} existe`, async () => {
        expect(await db.indexExists(index)).toBe(true);
      });
    }
  });

  describe('T7.2.A4 — 0031 no marca ninguna fila como borrada', () => {
    it('ninguna fila de users queda con deleted_at no nulo', async () => {
      const [row] = await db.rows<{ count: string }>(
        `SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NOT NULL`,
      );

      expect(Number(row.count)).toBe(0);
    });

    it('users conserva sus filas preexistentes (el usuario anónimo de 0008)', async () => {
      const [row] = await db.rows<{ count: string }>(`SELECT COUNT(*) AS count FROM users`);

      expect(Number(row.count)).toBeGreaterThan(0);
    });
  });

  describe('T7.2.A5 — incidents y assignments conservan su soft delete previo (0025)', () => {
    // 0025 ya había añadido deleted_at a estas dos; 0031 no debe romperlas.
    it('incidents.deleted_at sigue existiendo tras 0031', async () => {
      expect(await db.columnExists('incidents', 'deleted_at')).toBe(true);
    });

    it('assignments.deleted_at sigue existiendo tras 0031', async () => {
      expect(await db.columnExists('assignments', 'deleted_at')).toBe(true);
    });
  });

  describe('T7.2.A6 — las FK hacia incidents sobreviven a 0031', () => {
    for (const table of ['comments', 'assignments']) {
      it(`${table}.incident_id sigue existiendo`, async () => {
        expect(await db.columnExists(table, 'incident_id')).toBe(true);
      });
    }

    // Estas dos FK son ON DELETE CASCADE desde su creación (0005 y 0007) y
    // 0031 no las toca. No hay contradicción con el soft delete: el borrado
    // lógico sólo escribe `deleted_at`, nunca emite un DELETE, así que la
    // cascada no se dispara por esa vía. Queda como red de seguridad para un
    // hard delete real — si alguien purga un incidente de verdad, no deja
    // comentarios ni asignaciones huérfanos.
    //
    // (El test anterior afirmaba en un comentario que NO eran CASCADE; era
    // falso, y no se detectaba porque sólo comprobaba que la columna
    // existiera.)
    it('comments y assignments cascadean ante un hard delete de incidents', async () => {
      const rows = await db.rows<{ table_name: string; delete_rule: string }>(
        `SELECT kcu.table_name, rc.delete_rule
           FROM information_schema.referential_constraints rc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = rc.constraint_name
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = rc.constraint_name
          WHERE ccu.table_name = 'incidents'
            AND kcu.table_name IN ('comments', 'assignments')
            AND kcu.column_name = 'incident_id'`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.delete_rule).toBe('CASCADE');
      }
    });
  });
});
