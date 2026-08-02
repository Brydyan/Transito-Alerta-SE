<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add GIST spatial indexes on `incidents.geom` (Point) and `locations.geom`
 * (MultiPolygon).
 *
 * Why GIST and not BTREE:
 *   PostGIS geometry columns have no default index. Without a GIST index,
 *   ST_Within / ST_Intersects / ST_DWithin fall back to a sequential scan,
 *   which is O(n) on the full table. For the `bbox` filter on /incidents
 *   (SCEN-1.2/1.3/1.5) this is a hot path — the frontend refetches every
 *   pan/zoom and every 15s while the map is open. A GIST index brings that
 *   down to O(log n + k).
 *
 * Why CONCURRENTLY:
 *   On a populated production table, CREATE INDEX takes an ACCESS EXCLUSIVE
 *   lock that blocks writes for the duration of the build. CONCURRENTLY
 *   builds the index without blocking concurrent INSERT/UPDATE/DELETE —
 *   at the cost of ~2× build time and ~2× temporary disk. Worth it for
 *   a live service.
 *
 * Why `$withinTransaction = false`:
 *   PostgreSQL refuses `CREATE INDEX CONCURRENTLY` inside a transaction
 *   block. By default Laravel migrations run inside a single transaction,
 *   so we must opt out. Laravel 11+ exposes this via a public property on
 *   the migration class.
 *
 * Driver guard:
 *   GIST indexes only exist on pgsql+postgis. On SQLite (the default CI
 *   driver) the migration is a silent no-op so feature tests don't break.
 */
return new class extends Migration
{
    /**
     * Disable transactional wrapping — required by CREATE INDEX CONCURRENTLY.
     */
    public $withinTransaction = false;

    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS incidents_geom_gist_idx '
            .'ON incidents USING GIST (geom)'
        );

        DB::statement(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS locations_geom_gist_idx '
            .'ON locations USING GIST (geom)'
        );
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX CONCURRENTLY IF EXISTS incidents_geom_gist_idx');
        DB::statement('DROP INDEX CONCURRENTLY IF EXISTS locations_geom_gist_idx');
    }
};
