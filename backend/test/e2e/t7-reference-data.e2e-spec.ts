import { randomUUID } from 'crypto';
import { MigrationHarness } from '../support/migration-harness';

/**
 * T7.9.A — incident category tree seed (0038). R19.1–R19.7: the 5-root /
 * 17-leaf tree (22 categories total — see design.md D14 for why this is 22,
 * not the 23 this change originally estimated) is seeded, exactly 2 levels
 * deep, idempotent on re-apply, root names are globally unique, leaf names
 * are unique per-parent only, and the T7.7 leaf-category trigger accepts a
 * seeded leaf while rejecting a seeded root.
 *
 * Uses `MigrationHarness` (bare Postgres, no Nest app) rather than
 * `TestEnvironment`: every scenario here is a direct SQL-level check against
 * `incident_categories`/`incidents`, and `TestEnvironment.reset()`
 * deliberately TRUNCATEs `incident_categories` on every call (T7 test
 * convention — mutable per-test state), which would wipe this migration's
 * seed before any assertion ran.
 */
describe('E2E T7.9.A reference data — incident category tree (0038)', () => {
  let h: MigrationHarness;

  const ROOT_NAMES = [
    'Infraestructura Vial',
    'Servicios Básicos',
    'Seguridad Ciudadana',
    'Medio Ambiente',
    'Obras e Infraestructura',
  ];

  const LEAF_NAMES = [
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

  beforeAll(async () => {
    h = await MigrationHarness.start();
    await h.applyRange({ to: '0038' });
  }, 120_000);

  afterAll(async () => {
    await h.stop();
  }, 60_000);

  async function categoryCounts(): Promise<{ total: number; roots: number; leaves: number }> {
    const [{ count: total }] = await h.rows<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM incident_categories`,
    );
    const [{ count: roots }] = await h.rows<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM incident_categories WHERE parent_id IS NULL`,
    );
    const [{ count: leaves }] = await h.rows<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM incident_categories WHERE parent_id IS NOT NULL`,
    );
    return { total: Number(total), roots: Number(roots), leaves: Number(leaves) };
  }

  // ---- R19.1 — the tree is seeded ----------------------------------------

  it('R19.1: seeds 22 categories — 5 roots with the exact legacy names, 17 leaves', async () => {
    const { total, roots, leaves } = await categoryCounts();
    expect(total).toBe(22);
    expect(roots).toBe(5);
    expect(leaves).toBe(17);

    const rootRows = await h.rows<{ name: string }>(
      `SELECT name FROM incident_categories WHERE parent_id IS NULL ORDER BY name`,
    );
    expect(rootRows.map((r) => r.name).sort()).toEqual([...ROOT_NAMES].sort());

    const leafRows = await h.rows<{ name: string }>(
      `SELECT name FROM incident_categories WHERE parent_id IS NOT NULL ORDER BY name`,
    );
    expect(leafRows.map((r) => r.name).sort()).toEqual([...LEAF_NAMES].sort());
  });

  // ---- R19.2 — exactly 2 levels -------------------------------------------

  it('R19.2: no leaf has children of its own — the tree is exactly 2 levels deep', async () => {
    const rows = await h.rows<{ id: string }>(
      `SELECT c.id
         FROM incident_categories c
        WHERE c.parent_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM incident_categories child WHERE child.parent_id = c.id)`,
    );
    expect(rows).toEqual([]);
  });

  // ---- R19.3 — re-apply is idempotent --------------------------------------

  it('R19.3: re-applying 0038 does not duplicate the tree', async () => {
    await h.applyVersion('0038');
    await h.applyVersion('0038');

    const { total, roots, leaves } = await categoryCounts();
    expect(total).toBe(22);
    expect(roots).toBe(5);
    expect(leaves).toBe(17);
  });

  // ---- R19.4 — root names are globally unique ------------------------------

  it('R19.4: inserting a second root with an existing root name is rejected', async () => {
    await expect(
      h.rows(
        `INSERT INTO incident_categories (id, name, parent_id) VALUES ($1, 'Medio Ambiente', NULL)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // ---- R19.5 — same leaf name under different parents is valid ------------

  it('R19.5: the same leaf name under two different parents is accepted for both', async () => {
    const roots = await h.rows<{ id: string }>(
      `SELECT id FROM incident_categories WHERE parent_id IS NULL ORDER BY name LIMIT 2`,
    );
    expect(roots.length).toBe(2);
    const sharedName = `Hallazgo compartido ${randomUUID().slice(0, 8)}`;

    await expect(
      h.rows(`INSERT INTO incident_categories (id, name, parent_id) VALUES ($1, $2, $3)`, [
        randomUUID(),
        sharedName,
        roots[0].id,
      ]),
    ).resolves.toBeDefined();

    await expect(
      h.rows(`INSERT INTO incident_categories (id, name, parent_id) VALUES ($1, $2, $3)`, [
        randomUUID(),
        sharedName,
        roots[1].id,
      ]),
    ).resolves.toBeDefined();
  });

  // ---- R19.6 / R19.7 — leaf trigger (0036) applied to the seeded tree -----

  describe('leaf-category trigger against the seeded tree (requires 0001–0038)', () => {
    let citizenId: string;

    beforeAll(async () => {
      const [{ id }] = await h.rows<{ id: string }>(
        `SELECT id FROM users WHERE device_uuid = 'anonymous'`,
      );
      citizenId = id;
    });

    async function insertIncident(categoryId: string | null): Promise<unknown> {
      return h.rows(
        `INSERT INTO incidents (id, title, location, citizen_id, category_id)
         VALUES ($1, 'Reporte de prueba', ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), $2, $3)`,
        [randomUUID(), citizenId, categoryId],
      );
    }

    it('R19.6: an incident with a seeded leaf category (Baches y Hundimientos) is accepted', async () => {
      const [{ id: leafId }] = await h.rows<{ id: string }>(
        `SELECT id FROM incident_categories WHERE name = 'Baches y Hundimientos' AND parent_id IS NOT NULL`,
      );
      await expect(insertIncident(leafId)).resolves.toBeDefined();
    });

    it('R19.7: an incident with a seeded root category (Infraestructura Vial) is rejected', async () => {
      const [{ id: rootId }] = await h.rows<{ id: string }>(
        `SELECT id FROM incident_categories WHERE name = 'Infraestructura Vial' AND parent_id IS NULL`,
      );
      await expect(insertIncident(rootId)).rejects.toThrow(/INCIDENT_CATEGORY_NOT_LEAF/);
    });
  });
});
