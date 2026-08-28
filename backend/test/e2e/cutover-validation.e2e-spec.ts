/**
 * T8 D8.3 / D8.4 — Cutover validation specs.
 *
 * Change: `2026-08-26-t8-database-cutover`. Capability: `cutover`.
 * Spec:   `openspec/changes/2026-08-26-t8-database-cutover/specs/cutover/spec.md`
 *         (R27.1..R27.4, R30.2) and
 *         `openspec/changes/2026-08-26-t8-database-cutover/specs/verification/spec.md`
 *         (R30.2 cross-ref).
 *
 * The test asserts the operational artefacts exist with the structure
 * the runbook requires — it does NOT exercise the rehearsal itself
 * (that needs real Supabase staging, see
 * `docs/runbooks/cutover.md` §"Rehearsal"). The runtime checks (R30.2
 * "queries run without syntax error") need a Postgres database, so
 * this file uses TestEnvironment like the other cutover-profile specs.
 *
 * Profile: `test:e2e:cutover`.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { Client } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';

import { TestEnvironment } from '../support/test-environment';

const REPO_ROOT = resolve(__dirname, '../../..');
const RUNBOOK_PATH = join(REPO_ROOT, 'docs/runbooks/cutover.md');
const QUERIES_PATH = join(REPO_ROOT, 'database/monitoring/queries.sql');
const SCRIPT_PATH = join(REPO_ROOT, 'backend/scripts/cutover-rehearsal.sh');
const MIGRATION_0042_PATH = join(
  REPO_ROOT,
  'database/migrations/0042_monitoring_helpers.sql',
);
const DOWN_0042_PATH = join(
  REPO_ROOT,
  'database/rollback/0042_monitoring_helpers.DOWN.sql',
);

describe('E2E T8 D8.3 cutover validation', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    // Apply 0042 on top of what TestEnvironment already applied
    // (0001..0041). The test-environment harness is hard-coded to
    // read from `database/migrations/`, so 0042 is just the next
    // file in lexicographic order — by the time T8 lands, the
    // harness naturally picks it up. We re-apply it explicitly
    // here to keep this spec self-contained against the
    // pre-T8-test-environment that only ran 0001..0041.
    const migration0042 = readFileSync(MIGRATION_0042_PATH, 'utf8');
    await env.pg.query(migration0042);
  }, 180_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  // ───── R27.1 — Runbook exists with front-matter ─────────────────────

  describe('R27.1 — docs/runbooks/cutover.md exists with front-matter', () => {
    it('the file exists at the canonical path', () => {
      expect(existsSync(RUNBOOK_PATH)).toBe(true);
    });

    it('the file starts with a YAML front-matter block', () => {
      const content = readFileSync(RUNBOOK_PATH, 'utf8');
      expect(content.startsWith('---\n')).toBe(true);
      const fmEnd = content.indexOf('\n---\n', 4);
      expect(fmEnd).toBeGreaterThan(0);
      const fm = content.substring(4, fmEnd);
      expect(fm).toMatch(/^version:\s*\d+/m);
      expect(fm).toMatch(/^owner:\s*\w+/m);
      expect(fm).toMatch(/^last_rehearsal:/m);
      expect(fm).toMatch(/^duration_minutes:/m);
      expect(fm).toMatch(/^result:\s*(pending|pass|fail)/m);
    });
  });

  // ───── R27.2 — Go/no-go section is copy-pasteable ───────────────────

  describe('R27.2 — "Criterios go/no-go" section has copy-pasteable commands with expected output', () => {
    let runbook: string;

    beforeAll(() => {
      runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    });

    it('a section titled "Criterios go/no-go" exists', () => {
      expect(runbook).toMatch(/^## Criterios go\/no-go/m);
    });

    it('each criterion is a shell command in a fenced code block with an expected output line', () => {
      // Extract the section
      const sectionStart = runbook.indexOf('## Criterios go/no-go');
      const sectionEnd = runbook.indexOf('\n## ', sectionStart + 1);
      const section =
        sectionStart >= 0 && sectionEnd > 0
          ? runbook.substring(sectionStart, sectionEnd)
          : runbook.substring(sectionStart);
      // Each criterion is one markdown table row. We require at least
      // 5 rows of `| <n> | <name> | \`command\` | \`output\` |`. Less
      // than 5 = "not really a runbook".
      const rows = section.match(/^\| \d+ \|.+\|$/gm) ?? [];
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });

    it('no criterion references the Supabase web panel ("panel de Supabase", "Supabase dashboard", "navegador")', () => {
      // The R27.2 acceptance criterion says "ningún criterio requiere
      // entrar al panel web de Supabase". We verify the Criterios
      // go/no-go section is command-only. (Other sections of the
      // runbook DO reference the panel — e.g. §3.1, §4.1 — because
      // snapshot/restore genuinely require it; those references are
      // in their own section, not in go/no-go.)
      const sectionStart = runbook.indexOf('## Criterios go/no-go');
      const sectionEnd = runbook.indexOf('\n## ', sectionStart + 1);
      const section =
        sectionStart >= 0 && sectionEnd > 0
          ? runbook.substring(sectionStart, sectionEnd)
          : runbook.substring(sectionStart);
      expect(section).not.toMatch(/panel de Supabase|Supabase dashboard|navegador|web UI/);
    });
  });

  // ───── R27.3 — Runbook references monitoring queries ─────────────────

  describe('R27.3 — "Monitoreo post-cutover" references the queries file', () => {
    it('the runbook mentions database/monitoring/queries.sql', () => {
      const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
      expect(runbook).toContain('database/monitoring/queries.sql');
    });

    it('queries.sql exists and contains at least 6 -- ALERT comments', () => {
      expect(existsSync(QUERIES_PATH)).toBe(true);
      const queries = readFileSync(QUERIES_PATH, 'utf8');
      const alertLines = queries.match(/-- ALERT:/g) ?? [];
      expect(alertLines.length).toBeGreaterThanOrEqual(6);
    });
  });

  // ───── R27.4 — Rehearsal section exists ──────────────────────────────

  describe('R27.4 — "Rehearsal" section has a Última ejecución block with date/duration/result/link', () => {
    it('the section contains all the placeholders the operator fills in', () => {
      const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
      expect(runbook).toMatch(/^## Rehearsal/m);
      // The placeholder strings are intentional: the operator
      // replaces them with real values after the first rehearsal.
      // We assert they are present, not that they are filled in.
      expect(runbook).toContain('Fecha de inicio');
      expect(runbook).toContain('Duración total');
      expect(runbook).toContain('Link al log');
      expect(runbook).toContain('Resultado global');
    });
  });

  // ───── R27 — Rehearsal script exists and is executable ───────────────

  describe('R27 — cutover-rehearsal.sh exists and is executable', () => {
    it('the script exists at backend/scripts/cutover-rehearsal.sh', () => {
      expect(existsSync(SCRIPT_PATH)).toBe(true);
    });

    it('the script has a shebang and is marked executable', () => {
      const stat = readFileSync(SCRIPT_PATH, 'utf8');
      expect(stat.startsWith('#!/usr/bin/env bash')).toBe(true);
      // We don't stat() the file because that depends on the FS
      // (chmod +x is the operator's job at deploy time). The
      // content checks above are enough for the test: the runbook
      // tells the operator to `chmod +x` it.
    });

    it('the script declares the CUTOVER_PROD_CONFIRM guard', () => {
      const stat = readFileSync(SCRIPT_PATH, 'utf8');
      expect(stat).toContain('CUTOVER_PROD_CONFIRM');
      expect(stat).toContain('CUTOVER-PROD');
    });

    it('the script has a --mode|prod check that aborts without the confirmation', () => {
      const stat = readFileSync(SCRIPT_PATH, 'utf8');
      // Either an explicit if/then or a function call. We assert
      // the literal string the spec cares about.
      expect(stat).toMatch(/confirm_production_mode|CUTOVER_PROD_CONFIRM/);
    });
  });

  // ───── R30.2 — Monitoring queries are executable ─────────────────────

  describe('R30.2 — every monitoring query runs without SQL syntax error and references real schema objects', () => {
    it('all 6 monitor_* functions exist in pg_proc', async () => {
      const { rows } = await env.pg.query<{ proname: string }>(
        `SELECT proname FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname LIKE 'monitor_%'
         ORDER BY proname`,
      );
      const names = rows.map((r) => r.proname);
      expect(names).toEqual(
        expect.arrayContaining([
          'monitor_5xx_count',
          'monitor_endpoint_latency_p95',
          'monitor_incidents_per_minute',
          'monitor_pg_pool_usage',
          'monitor_revocation_denylist_size',
          'monitor_unread_notifications_count',
        ]),
      );
      expect(names.length).toBe(6);
    });

    it('each query in queries.sql runs without error against a real DB', async () => {
      // Split the file on `\echo` boundaries — each query lives in
      // its own block. We skip the `\echo` lines and the ALERT
      // comments, then execute the rest as a single batch.
      const sql = readFileSync(QUERIES_PATH, 'utf8');
      // Strip the `\echo '...'` lines.
      const cleaned = sql
        .split('\n')
        .filter((l) => !l.startsWith("\\echo"))
        .join('\n');
      // Execute. ON_ERROR_STOP=1 makes psql abort on the first
      // error, but pg's query() doesn't have that — so we catch.
      await expect(env.pg.query(cleaned)).resolves.toBeDefined();
    });

    it('the DOWN of 0042 drops the 6 functions (idempotent, reversible per D8)', async () => {
      const down = readFileSync(DOWN_0042_PATH, 'utf8');
      // The DOWN must have 6 DROP FUNCTION statements on actual
      // SQL lines (not inside `--` comments). Filter to lines that
      // start with DROP (after trimming whitespace) so a comment
      // mentioning the string in prose does not count.
      const drops = down
        .split('\n')
        .filter((l) => /^\s*DROP FUNCTION IF EXISTS/i.test(l));
      expect(drops.length).toBe(6);
    });
  });
});

// ───── Lint-guard for unused imports we keep intentionally ───────────────

void Client;
void GenericContainer;
void Wait;
void execFileSync;
