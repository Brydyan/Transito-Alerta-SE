<?php

namespace Database\Factories;

use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected $model = User::class;

    protected static ?string $password;

    public function definition(): array
    {
        return [
            // `role_id` is a real FK (`users_role_id_foreign`) — on
            // PostgreSQL an insert fails outright if the referenced role
            // doesn't exist yet. SQLite's default test DB never enforced
            // this cleanly, which is exactly why dozens of pre-existing
            // tests called `User::factory()->create()` with no role
            // seeded first and it "worked".
            'role_id' => $this->resolveDefaultRoleId(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make('password'),
        ];
    }

    /**
     * Finds (or lazily creates) the "admin_sistema" role and returns its id.
     *
     * Looked up by NAME, not a hardcoded id=1: "admin_sistema" can
     * legitimately already exist under a non-1 id by the time this runs
     * (e.g. RoleSeeder, or a test seeding a custom role set first).
     *
     * Created via a raw `DB::table()->insert()` at `MAX(id) + 1`, not
     * `Role::create()`/nextval(): plenty of tests seed roles with an
     * explicit pinned id via `DB::table('roles')->insert(['id' => N,
     * ...])` (required because `Role::$fillable = ['name']` drops `id`
     * on the Eloquent mass-assignment path — see RoleSeederTest). Those
     * raw inserts do NOT advance PostgreSQL's `roles_id_seq`, so a
     * subsequent Eloquent `create()` relying on `nextval()` can collide
     * with an id a test already pinned explicitly. Computing the next id
     * from the table's actual current state sidesteps that hazard
     * entirely, regardless of how earlier rows were inserted.
     */
    private function resolveDefaultRoleId(): int
    {
        try {
            $existingId = DB::table('roles')->where('name', 'admin_sistema')->value('id');

            if ($existingId !== null) {
                return (int) $existingId;
            }

            $nextId = (int) DB::table('roles')->max('id') + 1;

            DB::table('roles')->insert([
                'id' => $nextId,
                'name' => 'admin_sistema',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Keep `roles_id_seq` in sync with this explicit-id insert (see
            // RoleSeeder::resyncIdSequence — same reasoning) so a later real
            // `Role::create()` elsewhere in the same test doesn't collide.
            if (DB::connection()->getDriverName() === 'pgsql') {
                DB::statement(
                    "select setval(pg_get_serial_sequence('roles', 'id'), (select max(id) from roles))"
                );
            }

            return $nextId;
        } catch (\Throwable) {
            return 1;
        }
    }
}
