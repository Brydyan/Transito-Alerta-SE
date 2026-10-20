import { MigrationHarness } from '../support/migration-harness';
import { rollbackPathFor } from '../../scripts/lib/migration-files';

/**
 * 2026-10-20-auth-me-500 — regresión de `0038_permissions_uuid_normalization`.
 *
 * El 500 de `GET /api/auth/me` no venía de un dato nuevo: venía de un dato
 * viejo que sobrevivió a la normalización de 0026.
 *
 * Historia corta:
 *  - `0021 §6` inyectó `"incident-images:CREATE"` / `"incident-images:DELETE"`
 *    en `roles.permissions` con formato `resource:ACTION`.
 *  - `0026` remapeó strings a UUIDs parseando por **espacio**
 *    (`split_part(elem,' ',1/2)`), así que no reconoció ese formato y su
 *    `COALESCE(p.uuid, elem)` los dejó intactos — a propósito, según su header.
 *  - `0026 §2`, `0027`, `0028` denormalizaron `roles` → `users`, y
 *    `RolesService.assignRole` (`roles.service.ts:154`) sigue copiando el array
 *    verbatim: vector de reinfección permanente.
 *  - `PermissionLookupService.getDescriptionsByUuids` pasaba ese array sin sanear
 *    a un `IN (...)` sobre `permissions.id` (uuid) → `22P02 invalid input
 *    syntax for type uuid` → 500 genérico de Nest (52 bytes exactos).
 *
 * `0037` reintrodujo el mismo patrón (`"UPDATE assignments"` como string)
 * DESPUÉS de 0026, así que el corpus de entrada incluye los tres formatos.
 *
 * Este spec aplica 0001→0037 (el corpus roto), comprueba que el defecto está
 * presente, aplica 0038 y verifica que ningún elemento no-UUID sobrevive —
 * que es exactamente la precondición que hace imposible el `22P02`.
 */
describe('0038 — normalización de permissions a UUID', () => {
  let db: MigrationHarness;

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    // Corpus roto: todo hasta 0037 (inclusive — 0037 es parte del problema).
    await db.applyRange({ from: '0001', to: '0037' });
  }, 600_000);

  afterAll(async () => {
    await db?.stop();
  }, 120_000);

  /**
   * Elementos no-UUID que quedan en `roles.permissions`.
   *
   * `jsonb_array_elements_text` expone su única columna como `value`; sin el
   * alias `AS elem` la referencia `e.elem` no resuelve.
   */
  async function nonUuidElements(): Promise<{ name: string; elem: string }[]> {
    return db.rows<{ name: string; elem: string }>(
      `SELECT r.name, e.elem
         FROM roles r, jsonb_array_elements_text(r.permissions) AS e(elem)
        WHERE r.deleted_at IS NULL
          AND e.elem !~* $1
        ORDER BY r.name, e.elem`,
      [UUID_RE.source],
    );
  }

  async function nonUuidUserElements(): Promise<{ id: string; elem: string }[]> {
    return db.rows<{ id: string; elem: string }>(
      `SELECT u.id, e.elem
         FROM users u, jsonb_array_elements_text(u.permissions) AS e(elem)
        WHERE u.deleted_at IS NULL
          AND u.is_active = TRUE
          AND e.elem !~* $1
        ORDER BY u.id, e.elem`,
      [UUID_RE.source],
    );
  }

  /** Los permisos de un rol, como array plano de strings. */
  async function permsOf(roleName: string): Promise<string[]> {
    const rows = await db.rows<{ elem: string }>(
      `SELECT e.elem
         FROM roles r, jsonb_array_elements_text(r.permissions) AS e(elem)
        WHERE r.name = $1 AND r.deleted_at IS NULL`,
      [roleName],
    );
    return rows.map((r) => r.elem);
  }

  /** Snapshot de `roles.permissions` (para las pruebas de idempotencia). */
  async function roleSnapshot(): Promise<unknown[]> {
    return db.rows(
      `SELECT name, permissions FROM roles WHERE deleted_at IS NULL ORDER BY name`,
    );
  }

  /** Snapshot de `users.permissions` + `permission_version`. */
  async function userSnapshot(): Promise<unknown[]> {
    return db.rows(
      `SELECT id, permission_version, permissions
         FROM users WHERE deleted_at IS NULL ORDER BY id`,
    );
  }

  async function permissionIds(): Promise<Record<string, string>> {
    const rows = await db.rows<{ resource: string; action: string; id: string }>(
      `SELECT resource, action, id::text AS id
         FROM permissions WHERE deleted_at IS NULL`,
    );
    return Object.fromEntries(rows.map((r) => [`${r.action} ${r.resource}`, r.id]));
  }

  describe('precondición — el corpus pre-0038 está roto', () => {
    beforeAll(async () => {
      // En una DB recién sembrada NO hay usuarios con `role_id` asignado, así
      // que la denormalización de 0026/0027/0028 no tiene a quién propagar y el
      // poison nunca llega a `users.permissions`. En staging sí llegó, por la
      // vía que `RolesService.assignRole` usa (roles.service.ts:154):
      //
      //     user.permissions = role.permissions ?? [];
      //
      // Reproducimos exactamente eso — copiar el array del role al user — para
      // que el spec ejercite el vector real, no una DB artificial.
      await db.rows(
        `INSERT INTO users (device_uuid, role_id, role, is_active, permissions)
         SELECT 'device-infected',
                r.id,
                r.name,
                true,
                r.permissions
           FROM roles r
          WHERE r.name = 'operator_org'
         ON CONFLICT (device_uuid) DO UPDATE
            SET permissions = EXCLUDED.permissions,
                role_id    = EXCLUDED.role_id`,
      );
    }, 60_000);

    it('0021 §6 dejó strings resource:ACTION en roles.permissions', async () => {
      const colonFormat = (await nonUuidElements()).filter((r) => r.elem.includes(':'));

      expect(colonFormat.length).toBeGreaterThan(0);
      expect(colonFormat.map((r) => r.elem)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^incident-images:(CREATE|DELETE)$/),
        ]),
      );
    });

    it('0037 dejó "UPDATE assignments" como string en admin_org', async () => {
      const inAdminOrg = (await nonUuidElements()).filter(
        (r) => r.name === 'admin_org' && r.elem === 'UPDATE assignments',
      );

      expect(inAdminOrg).toHaveLength(1);
    });

    it('assignRole propagó el poison a users.permissions (el path que devolvía 500)', async () => {
      const broken = await nonUuidUserElements();

      expect(broken.length).toBeGreaterThan(0);
      expect(broken.map((r) => r.elem)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^incident-images:CREATE$/)]),
      );
    });
  });

  describe('0038 UP — limpia los tres formatos', () => {
    beforeAll(async () => {
      await db.applyVersion('0038');
    }, 120_000);

    it('no queda NINGÚN elemento no-UUID en roles.permissions', async () => {
      expect(await nonUuidElements()).toEqual([]);
    });

    it('no queda NINGÚN elemento no-UUID en users.permissions', async () => {
      expect(await nonUuidUserElements()).toEqual([]);
    });

    it('los arrays no se vaciaron por error', async () => {
      const rows = await db.rows<{ name: string; total: number }>(
        `SELECT r.name, jsonb_array_length(r.permissions) AS total
           FROM roles r
          WHERE r.deleted_at IS NULL`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.total).toBeGreaterThan(0);
      }
    });

    it('convierte incident-images:* al UUID correcto del catálogo', async () => {
      const ids = await permissionIds();

      for (const role of ['operator_org', 'admin_org']) {
        const perms = await permsOf(role);
        expect(perms).toEqual(
          expect.arrayContaining([
            ids['CREATE incident-images'],
            ids['DELETE incident-images'],
          ]),
        );
        // Y el string con dos puntos desapareció.
        expect(perms).not.toContain('incident-images:CREATE');
        expect(perms).not.toContain('incident-images:DELETE');
      }
    });

    it('0037 quedó sanificado: assignments:UPDATE es UUID, no string', async () => {
      const ids = await permissionIds();
      const perms = await permsOf('admin_org');

      expect(perms).toContain(ids['UPDATE assignments']);
      expect(perms).not.toContain('UPDATE assignments');
    });

    it('la query que provocaba 22P02 ahora responde sin error', async () => {
      // Exactamente el `IN (...)` que `getDescriptionsByUuids` emite
      // (permission-lookup.service.ts:108) con un array tomado de
      // `users.permissions`. Antes de 0038 esto abortaba con 22P02.
      const perms = (await nonUuidUserElements()).length === 0
        ? await db.rows<{ perm: string }>(
            `SELECT e.perm
               FROM users u, jsonb_array_elements_text(u.permissions) AS e(perm)
              WHERE u.deleted_at IS NULL AND u.is_active = TRUE
              LIMIT 20`,
          )
        : [];

      const ids = perms.map((p) => p.perm);
      await expect(
        db.rows(
          `SELECT id, action, resource FROM permissions
            WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
          [ids],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('0038 idempotencia', () => {
    it('re-aplicar 0038 no cambia roles', async () => {
      const before = await roleSnapshot();
      await db.applyVersion('0038');
      expect(await roleSnapshot()).toEqual(before);
    }, 120_000);

    it('re-aplicar 0038 no cambia users (ni bumpea permission_version)', async () => {
      const before = await userSnapshot();
      await db.applyVersion('0038');
      expect(await userSnapshot()).toEqual(before);
    }, 120_000);
  });

  describe('0038 DOWN', () => {
    it('vuelve a strings "ACTION resource" (el shape pre-0026)', async () => {
      const down = rollbackPathFor(db.migration('0038'));
      expect(down).not.toBeNull();

      await db.applyFile(down!);

      const perms = await permsOf('master');
      expect(perms.length).toBeGreaterThan(0);
      for (const perm of perms) {
        expect(perm).toMatch(/^\S+ \S+$/);
      }
    }, 120_000);

    it('NO resucita los strings resource:ACTION (asimetría deliberada)', async () => {
      const perms = await permsOf('admin_org');

      expect(perms).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^incident-images:/)]),
      );
    }, 120_000);

    it('el DOWN es idempotente', async () => {
      const down = rollbackPathFor(db.migration('0038'));
      const before = await roleSnapshot();

      await db.applyFile(down!);

      expect(await roleSnapshot()).toEqual(before);
    }, 120_000);

    it('el UP vuelve a ser seguro después del DOWN (ida y vuelta)', async () => {
      await db.applyVersion('0038');

      expect(await nonUuidElements()).toEqual([]);
      expect(await nonUuidUserElements()).toEqual([]);
    }, 120_000);
  });
});