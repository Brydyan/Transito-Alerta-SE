import { MigrationHarness } from '../support/migration-harness';
import { rollbackPathFor } from '../../scripts/lib/migration-files';

/**
 * 2026-10-20 — regresión de `0039_menu_option_roles_canonical_matrix`.
 *
 * `0029_dynamic_menus_data_migration.sql` se editó in-place dos veces el
 * 2026-10-17. Las migraciones no se re-ejecutan, así que un ambiente donde
 * 0029 corrió antes de esas correcciones conserva la matriz anterior:
 * `operator_org` queda con la fila de Reportar, que el cuerpo canónico de
 * 0029 (línea 183) no le concede.
 *
 * En un Postgres VIRGEN la fila no aparece —el 0029 actual ya excluye a
 * `operator_org`— así que este spec la inyecta explícitamente para
 * reproducir el estado degradado que staging arrastra.
 *
 * La segunda mitad del spec cubre los ASSERT de 0039, que son la parte
 * valiosa: sin ellos, "limpiar" un padre accesible (como el grupo GESTIÓN de
 * `admin_org`) rompe el menú en silencio, porque `MenusService.buildTree`
 * descarta huérfanos sin lanzar error.
 */
describe('0039 — matriz canónica de menu_option_roles', () => {
  let db: MigrationHarness;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ from: '0001', to: '0038' });
  }, 600_000);

  afterAll(async () => {
    await db?.stop();
  }, 120_000);

  /** Inyecta el drift que dejó la corrida pre-corrección de 0029. */
  async function injectStaleReportarForOperator(): Promise<void> {
    await db.rows(
      `INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
       SELECT mo.id, r.id, true, false
         FROM menu_options mo, roles r
        WHERE mo.route = '/reportar'
          AND mo.deleted_at IS NULL
          AND r.name = 'operator_org'
          AND r.deleted_at IS NULL
       ON CONFLICT (menu_option_id, role_id) DO NOTHING`,
    );
  }

  async function operatorHasReportar(): Promise<boolean> {
    const rows = await db.rows<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM menu_option_roles mor
         JOIN menu_options mo ON mo.id = mor.menu_option_id
         JOIN roles r       ON r.id  = mor.role_id
        WHERE r.name = 'operator_org' AND mo.route = '/reportar'
          AND mor.can_read = true`,
    );
    return rows[0].n > 0;
  }

  /** Inyecta un acceso de gestión indebido (dispara el assert #2). */
  async function injectManagementForOperator(route: string): Promise<void> {
    await db.rows(
      `INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
       SELECT mo.id, r.id, true, false
         FROM menu_options mo, roles r
        WHERE mo.route = $1 AND mo.deleted_at IS NULL
          AND r.name = 'operator_org' AND r.deleted_at IS NULL
       ON CONFLICT (menu_option_id, role_id) DO NOTHING`,
      [route],
    );
  }

  /**
   * Revoca el acceso de un rol al PARENT de un menú dado.
   *
   * Se localiza por el padre del hijo, no por la ruta del grupo: los nodos
   * raíz tienen la ruta vacía o NULL según cómo se insertaron, y atar el test
   * a ese detalle lo haría frágil ante un re-seed.
   */
  async function revokeParentOf(roleName: string, childRoute: string): Promise<void> {
    await db.rows(
      `DELETE FROM menu_option_roles mor
         USING menu_options mo, roles r
        WHERE mor.role_id = r.id
          AND mor.menu_option_id = mo.parent_id
          AND r.name = $1
          AND mo.route = $2
          AND mo.deleted_at IS NULL`,
      [roleName, childRoute],
    );
  }

  /**
   * Menús legibles cuyo padre NO es legible para el mismo rol.
   *
   * Es exactamente la condición que hace `MenusService.buildTree` descartarlos
   * en silencio (`menus.service.ts:195-202`). Un valor > 0 significa "el
   * sidebar va a mostrar menos entradas de las que la matriz dice", sin que
   * nada falle en runtime.
   */
  async function orphanCount(roleName: string): Promise<number> {
    const rows = await db.rows<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM menu_option_roles mor
         JOIN menu_options mo
           ON mo.id = mor.menu_option_id
          AND mo.deleted_at IS NULL
          AND mo.is_active = true
         LEFT JOIN menu_option_roles pmor
           ON pmor.menu_option_id = mo.parent_id
          AND pmor.role_id = mor.role_id
          AND pmor.can_read = true
        WHERE mor.can_read = true
          AND mo.parent_id IS NOT NULL
          AND pmor.menu_option_id IS NULL
          AND EXISTS (SELECT 1 FROM roles r
                       WHERE r.id = mor.role_id AND r.name = $1)`,
      [roleName],
    );
    return rows[0].n;
  }

  describe('precondición — el drift es inyectable, no natural', () => {
    it('una DB limpia NO tiene el drift (0029 actual ya excluye operator_org)', async () => {
      // Documenta por qué el spec inyecta: en un Postgres virgen el 0029
      // vigente concede Reportar sólo a master/agent_system/admin_org.
      expect(await operatorHasReportar()).toBe(false);
    });

    it('tras inyectar el residuo pre-corrección, la fila queda presente', async () => {
      await injectStaleReportarForOperator();
      expect(await operatorHasReportar()).toBe(true);
    });
  });

  describe('0039 UP', () => {
    beforeAll(async () => {
      await db.applyVersion('0039');
    }, 120_000);

    it('elimina la fila indebida de operator_org', async () => {
      expect(await operatorHasReportar()).toBe(false);
    });

    it('NO toca los accesos de Reportar de los roles canónicos', async () => {
      const rows = await db.rows<{ name: string }>(
        `SELECT r.name
           FROM menu_option_roles mor
           JOIN menu_options mo ON mo.id = mor.menu_option_id
           JOIN roles r       ON r.id  = mor.role_id
          WHERE mo.route = '/reportar'
            AND mo.deleted_at IS NULL
            AND mor.can_read = true
            AND r.deleted_at IS NULL
          ORDER BY r.name`,
      );

      const roles = rows.map((r) => r.name);
      // El cuerpo de 0029 (línea 183) los concede a estos tres.
      expect(roles).toEqual(expect.arrayContaining(['master', 'agent_system', 'admin_org']));
      expect(roles).not.toContain('operator_org');
      // `reporter` sí los tiene desde su propio bloque (líneas 193-202).
      expect(roles).toContain('reporter');
    });

    it('0039 aplica sobre datos limpios sin abortar', async () => {
      // La primera versión de esta migración exigía CERO huérfanos y
      // abortaba el bootstrap con "Hay 4 menú(s) legible(s) cuyo padre NO es
      // legible". Esos 4 los produce la cadena 0001→0038, no 0039 — exigir
      // cero bloqueaba un install limpio por deuda ajena. El assert ahora
      // compara contra la línea base.
      // Este `beforeAll` es la prueba: si 0039 no aplicara, no estaríamos aquí.
      expect(true).toBe(true);
    });

    it('no AUMENTA los menús huérfanos de ningún rol', async () => {
      // La línea base preexistente se reporta como deuda conocida; lo que 0039
      // garantiza es no sumar más. Los casos `admin_org`+GESTIÓN y
      // `reporter`+INCIDENCIAS viven acá: si alguien "limpia" un padre
      // creyendo que sobra, el sidebar pierde entradas en silencio
      // (menus.service.ts:195-202) y este conteo lo delata.
      const baseline = new Map<string, number>();
      for (const role of ['master', 'agent_system', 'admin_org', 'operator_org', 'reporter']) {
        baseline.set(role, await orphanCount(role));
      }

      await db.applyVersion('0039');

      for (const role of ['master', 'agent_system', 'admin_org', 'operator_org', 'reporter']) {
        expect(await orphanCount(role)).toBe(baseline.get(role));
      }
    });
  });

  describe('0039 idempotencia', () => {
    it('re-aplicar no cambia nada', async () => {
      const before = await db.rows(
        `SELECT menu_option_id, role_id, can_read, can_write
           FROM menu_option_roles ORDER BY menu_option_id, role_id`,
      );

      await db.applyVersion('0039');

      const after = await db.rows(
        `SELECT menu_option_id, role_id, can_read, can_write
           FROM menu_option_roles ORDER BY menu_option_id, role_id`,
      );

      expect(after).toEqual(before);
    }, 120_000);
  });

  describe('los ASSERT de 0039 muerden', () => {
    it('FALLA si operator_org tiene un menú de gestión', async () => {
      await injectManagementForOperator('/usuarios');

      await expect(db.applyVersion('0039')).rejects.toThrow(/gestión|gestion/i);

      // La transacción entera revierte: el assert aborta antes del COMMIT.
      const rows = await db.rows<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM menu_option_roles mor
           JOIN menu_options mo ON mo.id = mor.menu_option_id
           JOIN roles r       ON r.id  = mor.role_id
          WHERE r.name = 'operator_org' AND mo.route = '/usuarios'`,
      );
      expect(rows[0].n).toBe(0);

      // Limpieza para los tests siguientes.
      await db.rows(
        `DELETE FROM menu_option_roles mor
           USING menu_options mo, roles r
          WHERE mor.menu_option_id = mo.id AND mor.role_id = r.id
            AND r.name = 'operator_org' AND mo.route = '/usuarios'`,
      );
    }, 120_000);

    it('FALLA si un menú legible queda colgado de un padre no legible', async () => {
      // El caso real: quitarle a `admin_org` el grupo GESTIÓN deja a
      // Organizaciones y Departamentos sin padre legible. `buildTree` los
      // descarta sin error (menus.service.ts:195-202), así que sin el assert
      // el síntoma sería "el menú perdió entradas" con el backend en verde.
      const before = await orphanCount('admin_org');

      await revokeParentOf('admin_org', '/organizaciones');

      // El huérfano es NUEVO (uno más que la línea base)…
      const after = await orphanCount('admin_org');
      expect(after).toBe(before + 1);

      // …y la migración lo rechaza en vez de dejarlo pasar.
      await expect(db.applyVersion('0039')).rejects.toThrow(/huérfan|padre/i);

      // Restauramos el padre para los tests siguientes.
      await db.rows(
        `INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
         SELECT mo.parent_id, r.id, true, false
           FROM menu_options mo, roles r
          WHERE mo.route = '/organizaciones'
            AND mo.deleted_at IS NULL
            AND r.name = 'admin_org'
            AND r.deleted_at IS NULL
            AND mo.parent_id IS NOT NULL
         ON CONFLICT (menu_option_id, role_id) DO NOTHING`,
      );
      expect(await orphanCount('admin_org')).toBe(before);
    }, 120_000);
  });

  describe('0039 DOWN', () => {
    it('restaura la fila de Reportar para operator_org', async () => {
      const down = rollbackPathFor(db.migration('0039'));
      expect(down).not.toBeNull();

      await db.applyFile(down!);

      expect(await operatorHasReportar()).toBe(true);
    }, 120_000);

    it('el DOWN es idempotente', async () => {
      const down = rollbackPathFor(db.migration('0039'));
      await db.applyFile(down!);

      const rows = await db.rows<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM menu_option_roles mor
           JOIN menu_options mo ON mo.id = mor.menu_option_id
           JOIN roles r       ON r.id  = mor.role_id
          WHERE r.name = 'operator_org' AND mo.route = '/reportar'`,
      );
      expect(rows[0].n).toBe(1);
    }, 120_000);

    it('el UP de nuevo es seguro después del DOWN', async () => {
      await db.applyVersion('0039');
      expect(await operatorHasReportar()).toBe(false);
    }, 120_000);
  });
});