<?php

declare(strict_types=1);

namespace Database\Seeders\Concerns;

use Illuminate\Support\Facades\DB;

/**
 * Serializes the seeders that rewrite the permission tables.
 *
 * `entrypoint.sh` re-syncs PermissionSeeder and RolePermissionSeeder on every
 * container start, and the backend, worker and scheduler containers all share
 * that entrypoint. When they boot together the seeders race: each one deletes
 * the grants for roles 1-5 and re-inserts them, so the slower container hits
 * `role_id_permission_id_deleted_at_unique` on rows the faster one committed
 * a moment earlier.
 *
 * A transaction-scoped advisory lock makes the delete/insert pair atomic
 * across connections. Postgres releases it when the wrapping transaction ends,
 * so a container that dies mid-seed cannot wedge the next boot.
 */
trait SerializesSeeding
{
    /**
     * Arbitrary but stable key. Both seeders share it because both write to
     * `role_permission`.
     */
    public const LOCK_KEY = 728_451_003;

    /**
     * @param  callable():void  $callback
     */
    protected function seedExclusively(callable $callback): void
    {
        DB::transaction(function () use ($callback): void {
            // Advisory locks are pgsql-only. Other drivers (sqlite) only run
            // from a single connection, where this race cannot happen.
            if (DB::connection()->getDriverName() === 'pgsql') {
                DB::statement('SELECT pg_advisory_xact_lock(?)', [self::LOCK_KEY]);
            }

            $callback();
        });
    }
}
