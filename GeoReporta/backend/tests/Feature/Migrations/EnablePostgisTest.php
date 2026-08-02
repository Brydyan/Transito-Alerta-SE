<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Infra-proof tests for the SQLite → PostgreSQL+PostGIS test suite
 * migration (backend-tests-postgres-migration, GitHub issue #197).
 *
 * These are NOT product-behavior tests. They exist to prove — before any
 * pgsql-gated product test is unskipped — that:
 *
 *   1. The test suite actually runs against PostgreSQL, not SQLite.
 *   2. `2026_06_15_000001_enable_postgis.php` really executes
 *      `CREATE EXTENSION postgis` (it is a documented no-op on sqlite).
 *   3. `migrate:fresh` does NOT drop `spatial_ref_sys` — Laravel's
 *      Postgres schema builder defaults `dont_drop` to
 *      `['spatial_ref_sys']` (`config/database.php` leaves it unset), but
 *      that default is exactly the kind of thing a future refactor could
 *      silently break. Without this guard, `migrate:fresh` fails with
 *      "cannot drop table spatial_ref_sys because extension postgis
 *      requires it".
 *   4. Laravel's built-in per-worker parallel-testing database naming
 *      (`{database}_test_{TEST_TOKEN}`) actually activates once
 *      `DB_DATABASE` is a real name instead of `:memory:`.
 */
uses(RefreshDatabase::class);

it('runs the test suite against a real PostgreSQL connection, not SQLite', function (): void {
    expect(DB::connection()->getDriverName())->toBe('pgsql');
});

it('actually creates the postgis extension via migrate:fresh (not a no-op)', function (): void {
    $version = DB::selectOne('select postgis_version() as version');

    expect($version)->not->toBeNull();
    expect($version->version)->toBeString();
    expect($version->version)->not->toBe('');

    $extension = DB::selectOne(
        'select extname from pg_extension where extname = ?',
        ['postgis']
    );

    expect($extension)->not->toBeNull();
    expect($extension->extname)->toBe('postgis');
});

it('does not drop spatial_ref_sys when migrate:fresh runs (guards the dont_drop default)', function (): void {
    expect(Schema::hasTable('spatial_ref_sys'))->toBeTrue();

    // postgis' CREATE EXTENSION seeds this table with thousands of known
    // spatial reference systems — a real, non-trivial row count proves the
    // table survived migrate:fresh with its extension-owned data intact,
    // not just that an empty table with that name exists.
    $count = DB::table('spatial_ref_sys')->count();

    expect($count)->toBeGreaterThan(1000);
});

it('gives each parallel worker its own isolated database named {database}_test_{TEST_TOKEN}', function (): void {
    $token = $_SERVER['TEST_TOKEN'] ?? false;

    if ($token === false || $token === '') {
        // Sequential run (e.g. sonar-scan's `artisan test --coverage`,
        // which never sets a ParaTest token) — nothing to assert about
        // worker isolation, but the base test database name must still
        // be the configured one, not a shared/production one.
        expect(DB::getConfig('database'))->toBe('incidencias_test');

        return;
    }

    expect(DB::getConfig('database'))->toBe("incidencias_test_test_{$token}");
});
