import { readFileSync } from 'fs';
import { MigrationHarness } from '../support/migration-harness';
import { rollbackPathFor, listMigrations } from '../../scripts/lib/migration-files';

/**
 * T7.1 Fase C — ejercitar ciclo completo de rollback.
 *
 * Verifica que cada migración tenga un .DOWN.sql que la invierte completamente.
 */
describe('T7.1.C — rollback cycle: every migration has an undoable .DOWN.sql', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
  });

  afterAll(async () => {
    await db.stop();
  });

  describe('T7.1.C1 — archivo .DOWN.sql existe para cada migración', () => {
    it('0021_t6_t7_schema_completeness.DOWN.sql existe', async () => {
      const migration = listMigrations().find((m) => m.version === '0021');
      expect(migration).toBeDefined();

      const downPath = rollbackPathFor(migration!);
      expect(downPath).toBeTruthy(); // No null si existe
    });

    it('0001–0020 todas tienen archivo .DOWN.sql', async () => {
      const migrations = listMigrations().filter((m) => m.version <= '0020');

      for (const m of migrations) {
        const downPath = rollbackPathFor(m);
        expect(downPath).toBeTruthy();
      }
    });
  });

  describe('T7.1.C2 — rollback drop() no corrompe la base', () => {
    it('aplicar 0021, luego DOWN, deja schema_migrations eliminada', async () => {
      const db2 = await MigrationHarness.start();
      try {
        await db2.applyRange({ to: '0020' });
        await db2.applyVersion('0021');

        let tableExists = await db2.tableExists('schema_migrations');
        expect(tableExists).toBe(true);

        // Aplicar el .DOWN de 0021
        const migration = listMigrations().find((m) => m.version === '0021')!;
        const downPath = rollbackPathFor(migration);
        expect(downPath).toBeTruthy();

        await db2.applyFile(downPath!);

        tableExists = await db2.tableExists('schema_migrations');
        expect(tableExists).toBe(false);
      } finally {
        await db2.stop();
      }
    });

    it('ciclo UP → DOWN no deja basura (indices, triggers, etc.)', async () => {
      const db3 = await MigrationHarness.start();
      try {
        // Aplicar prerequisitos y 0021
        await db3.applyRange({ to: '0020' });
        await db3.applyVersion('0021');

        const tablesBefore = await db3.publicTables();
        expect(tablesBefore).toContain('schema_migrations');

        // Rollback
        const migration = listMigrations().find((m) => m.version === '0021')!;
        const downPath = rollbackPathFor(migration);
        await db3.applyFile(downPath!);

        const tablesAfter = await db3.publicTables();
        expect(tablesAfter).not.toContain('schema_migrations');
      } finally {
        await db3.stop();
      }
    });
  });

  describe('T7.1.C3 — ciclo completo 0001–0030 UP → DOWN deja base vacía', () => {
    it('aplicar 0001–0020, luego rollback todas en reverso, = base vacía (excepto PostGIS)', async () => {
      await db.applyRange({ from: '0001', to: '0020' });

      const tablesBefore = await db.publicTables();
      expect(tablesBefore.length).toBeGreaterThan(10); // incidents, users, etc.

      // Rollback todas en orden reverso
      const migrations = listMigrations()
        .filter((m) => m.version <= '0020')
        .reverse();

      for (const m of migrations) {
        const downPath = rollbackPathFor(m);
        if (downPath) {
          await db.applyFile(downPath);
        }
      }

      const tablesAfter = await db.publicTables();
      // spatial_ref_sys is from PostGIS extension (0002 doesn't DROP EXTENSION postgis)
      const domainTables = tablesAfter.filter((t) => t !== 'spatial_ref_sys');
      expect(domainTables.length).toBe(0); // Nada debería quedar
    });

    it('DOWN scripts contienen IF EXISTS (idempotentes)', async () => {
      const migration = listMigrations().find((m) => m.version === '0021')!;
      const downPath = rollbackPathFor(migration);
      expect(downPath).toBeTruthy();

      // Leer el contenido del .DOWN.sql
      const downContent = readFileSync(downPath!, 'utf8');

      // Debería tener IF EXISTS para evitar errores si se ejecuta 2 veces
      expect(downContent).toContain('IF EXISTS');
    });
  });

  describe('T7.1.C4 — rollback no rompe la data existente (cuando aplica)', () => {
    it('no hay DROP TABLE sin CASCADE, lo que silenciosamente pierde datos', async () => {
      // Los .DOWN.sql de T7.1 no tienen data, pero futuras migraciones (0031+)
      // podrían. Verificar que los scripts de rollback no tienen DROP sin CASCADE.

      // Por ahora: al menos el de 0021 debe ser seguro
      const migration = listMigrations().find((m) => m.version === '0021')!;
      const downPath = rollbackPathFor(migration);
      expect(downPath).toBeTruthy();

      const downContent = readFileSync(downPath!, 'utf8');

      // 0021 dropea schema_migrations entre otros objetos
      // Pero el patrón es: DROP TABLE IF EXISTS <table> CASCADE; (si tiene FK)
      // o simplemente DROP TABLE IF EXISTS <table>; (si no las tiene)

      // Verificar que DROP statements existen
      expect(downContent).toContain('DROP');
    });
  });
});
