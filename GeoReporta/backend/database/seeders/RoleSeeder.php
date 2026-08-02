<?php

namespace Database\Seeders;

use App\Domains\Roles\Enums\UserRole;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoleSeeder extends Seeder
{
    private const ROLES = [
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
        ['id' => 2, 'name' => UserRole::OperadorSistema->value],
        ['id' => 3, 'name' => UserRole::AdminOrganizacion->value],
        ['id' => 4, 'name' => UserRole::OperadorOrganizacion->value],
        ['id' => 5, 'name' => UserRole::Usuario->value],
    ];

    public function run(): void
    {
        // Loop with per-role insertOrIgnore:
        // `Role::$fillable = ['name']` excludes `id`, so Eloquent's mass-assignment
        // path silently dropped explicit ids — wrong for these FK-target rows.
        // Surfaced by SQLite → PostgreSQL test migration (backend-tests-postgres-migration, #197):
        // Postgres SERIAL sequences persist across rolled-back transactions.
        // insertOrIgnore: insert with pinned id if new, preserve existing id if role exists.
        // Never updates/changes an existing role's id (preserves FKs).
        // Guarantees FK visibility in same transaction for RolePermissionSeeder.
        foreach (self::ROLES as $role) {
            DB::table('roles')->insertOrIgnore([
                'id' => $role['id'],
                'name' => $role['name'],
            ]);

            $this->command?->info("Rol {$role['name']} creado/actualizado.");
        }

        $this->resyncIdSequence();
    }

    /**
     * Advances `roles_id_seq` past the highest pinned id.
     *
     * Raw inserts with an explicit `id` never touch PostgreSQL's serial
     * sequence. Without this, the very next `Role::create()` through the
     * app's real path (`RoleController::store()`) calls `nextval()`,
     * which would still return 1 and collide with the row this seeder
     * just pinned there — a real production defect, not just a test
     * artifact, surfaced by backend-tests-postgres-migration (#197).
     */
    private function resyncIdSequence(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            "select setval(pg_get_serial_sequence('roles', 'id'), (select max(id) from roles))"
        );
    }
}
