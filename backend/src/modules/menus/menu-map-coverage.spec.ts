import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseMigrations, SimulatedState } from './sql-migration-harness';
import { MENU_MAP } from './menu-map';

describe('MENU_MAP vs SQL Migrations Coverage', () => {
  let simulatedState: SimulatedState;

  beforeAll(() => {
    // Resolve the migrations directory from the test to the repo's database/migrations/.
    const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
    
    // If that directory cannot be read, the test MUST fail loudly — never degrade to an empty set.
    if (!fs.existsSync(migrationsDir) || !fs.statSync(migrationsDir).isDirectory()) {
      throw new Error(`Migrations directory not found at ${migrationsDir}`);
    }

    simulatedState = parseMigrations(migrationsDir);
  });

  /**
   * Helper function to test coverage, making the map injectable rather than hard-imported.
   */
  function checkCoverage(menuMap: Record<string, { route: string }>, state: SimulatedState): string[] {
    const simulatedRoutes = new Set(state.menuOptions.map(mo => mo.route));
    const missingRoutes: string[] = [];

    for (const [key, entry] of Object.entries(menuMap)) {
      if (!simulatedRoutes.has(entry.route)) {
        missingRoutes.push(`${key} -> ${entry.route}`);
      }
    }

    return missingRoutes;
  }

  it('trivially-empty guard: harness should simulate at least one menu option', () => {
    // Trivially-empty guard (mandatory): assert the simulated route set is not empty,
    // so the coverage assertion cannot pass while the harness silently simulated nothing.
    expect(simulatedState.menuOptions.length).toBeGreaterThan(0);
  });

  it('coverage: every route in MENU_MAP must exist in the simulated migration set', () => {
    // Assert every MENU_MAP route exists in the simulated route set.
    // Compare sets. Extra seeded routes are CORRECT and must NOT fail.
    const missingRoutes = checkCoverage(MENU_MAP, simulatedState);
    
    expect(missingRoutes).toEqual([]);
  });

  it('regression seam: assertion fails when an injected route is missing from migrations', () => {
    // Inject an overridden MENU_MAP containing a route such as /admin/missing-route
    // and prove the coverage assertion FAILS, without editing production migrations or data.
    const fakeMap = {
      ...MENU_MAP,
      FakeItem: {
        route: '/admin/missing-route',
        requires: 'READ nothing',
        order: 999,
      }
    };

    const missingRoutes = checkCoverage(fakeMap, simulatedState);
    expect(missingRoutes).toContain('FakeItem -> /admin/missing-route');
  });

  describe('loud-failure contract', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-migrations-'));

    afterAll(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    /**
     * Write one synthetic migration into a throwaway directory and return a thunk that
     * parses it. Lets us prove what the harness does with a write shape without ever
     * touching the real migrations or their data.
     */
    function parseSynthetic(sql: string): () => SimulatedState {
      const dir = fs.mkdtempSync(path.join(tmpRoot, 'case-'));
      fs.writeFileSync(path.join(dir, '0001_synthetic.sql'), sql, 'utf8');
      return () => parseMigrations(dir);
    }

    const tuple =
      "('33333333-3333-3333-3333-333333333333','Real','/real','icon',NULL,1,true,now(),now())";
    const insertHead =
      'INSERT INTO menu_options ' +
      '(id,name,route,icon,parent_id,display_order,is_active,created_at,updated_at)\nVALUES\n  ';

    it('accepts a modelled insert with the optional ON CONFLICT DO NOTHING', () => {
      expect(parseSynthetic(`${insertHead}${tuple}\nON CONFLICT (id) DO NOTHING;`)()).toEqual({
        menuOptions: [{ id: '33333333-3333-3333-3333-333333333333', route: '/real' }],
      });
    });

    it('throws on an ON CONFLICT DO UPDATE that renames a route', () => {
      // The case that makes this branch exist. A future migration can rename a route in
      // place; if the parser swallowed the clause the simulated set would keep the old
      // route and the coverage assertion would pass while the real menu was wrong.
      const run = parseSynthetic(
        `${insertHead}${tuple}\nON CONFLICT (id) DO UPDATE SET route = '/renamed';`
      );
      expect(run).toThrow(/Unrecognized trailing content/);
    });

    it('throws on any other unmodelled trailing clause', () => {
      expect(parseSynthetic(`${insertHead}${tuple}\nRETURNING *;`)).toThrow(
        /Unrecognized trailing content/
      );
    });

    it('throws on DELETE and TRUNCATE against menu_options', () => {
      expect(parseSynthetic('DELETE FROM menu_options;')).toThrow(/Unrecognized statement/);
      expect(parseSynthetic('TRUNCATE menu_options;')).toThrow(/Unrecognized statement/);
    });

    it('accepts a schema-qualified insert instead of skipping it', () => {
      expect(parseSynthetic(insertHead.replace('menu_options', 'public.menu_options') + tuple + ';')()).toEqual(
        { menuOptions: [{ id: '33333333-3333-3333-3333-333333333333', route: '/real' }] }
      );
    });

    it('skips menu_option_roles, which cannot create or rename a menu_options row', () => {
      expect(
        parseSynthetic("INSERT INTO menu_option_roles (menu_option_id, role_id) VALUES ('a', 'b');")()
      ).toEqual({ menuOptions: [] });
    });
  });
});
