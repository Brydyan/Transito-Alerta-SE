<?php

declare(strict_types=1);

use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * Records the SQL a seeder runs, in order, with the transaction depth each
 * statement executed at.
 *
 * @return list<array{sql: string, depth: int}>
 */
function statementsRunBy(object $test, string $seeder): array
{
    $statements = [];

    DB::listen(function ($query) use (&$statements): void {
        $statements[] = ['sql' => $query->sql, 'depth' => DB::transactionLevel()];
    });

    $test->seed($seeder);

    return $statements;
}

/**
 * Position of the first recorded statement containing $needle.
 *
 * @param  list<array{sql: string, depth: int}>  $statements
 */
function positionOf(array $statements, string $needle): ?int
{
    foreach ($statements as $index => $statement) {
        if (str_contains($statement['sql'], $needle)) {
            return $index;
        }
    }

    return null;
}

beforeEach(function (): void {
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
});

it('takes the advisory lock before rewriting role grants', function (): void {
    // Regression: backend and worker share entrypoint.sh and both seed on
    // boot. Unserialized, the slower container hit
    // role_id_permission_id_deleted_at_unique on rows the other just wrote.
    $statements = statementsRunBy($this, RolePermissionSeeder::class);

    $lock = positionOf($statements, 'pg_advisory_xact_lock');
    $delete = positionOf($statements, 'delete from "role_permission"');

    expect($lock)->not->toBeNull('seeder must acquire the advisory lock')
        ->and($delete)->not->toBeNull('seeder must clear existing grants')
        ->and($lock)->toBeLessThan($delete);
});

it('holds the lock in a transaction that spans the whole rewrite', function (): void {
    // pg_advisory_xact_lock is released at commit, so the delete and the
    // re-inserts have to sit inside that same transaction to be atomic.
    $statements = statementsRunBy($this, RolePermissionSeeder::class);

    $lockDepth = $statements[positionOf($statements, 'pg_advisory_xact_lock')]['depth'];
    $deleteDepth = $statements[positionOf($statements, 'delete from "role_permission"')]['depth'];
    $insertDepth = $statements[positionOf($statements, 'insert into "role_permission"')]['depth'];

    // RefreshDatabase already holds a transaction, so the seeder's own one
    // shows up as an extra level rather than as depth 1.
    expect($lockDepth)->toBeGreaterThan(1)
        ->and($deleteDepth)->toBe($lockDepth)
        ->and($insertDepth)->toBe($lockDepth);
});

it('takes the same lock before rewriting the permission catalog', function (): void {
    // PermissionSeeder prunes orphaned role_permission rows, so it races
    // against RolePermissionSeeder and shares the key.
    $statements = statementsRunBy($this, PermissionSeeder::class);

    $lock = positionOf($statements, 'pg_advisory_xact_lock');
    $read = positionOf($statements, 'select * from "permissions"');

    expect($lock)->not->toBeNull('seeder must acquire the advisory lock')
        ->and($read)->not->toBeNull()
        ->and($lock)->toBeLessThan($read);
});

it('leaves the same grants behind when run repeatedly', function (): void {
    $this->seed(RolePermissionSeeder::class);
    $first = DB::table('role_permission')->whereNull('deleted_at')->count();

    $this->seed(RolePermissionSeeder::class);
    $second = DB::table('role_permission')->whereNull('deleted_at')->count();

    expect($first)->toBeGreaterThan(0)
        ->and($second)->toBe($first);
});

it('never leaves duplicate live grants for a role and permission', function (): void {
    $this->seed(RolePermissionSeeder::class);

    $duplicates = DB::table('role_permission')
        ->selectRaw('role_id, permission_id, count(*) as total')
        ->whereNull('deleted_at')
        ->groupBy('role_id', 'permission_id')
        ->havingRaw('count(*) > 1')
        ->get();

    expect($duplicates)->toBeEmpty();
});
