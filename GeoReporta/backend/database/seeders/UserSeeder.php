<?php

namespace Database\Seeders;

use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    /**
     * Password shared by every citizen account created below.
     * Kept in a constant so the seeder output and the docs stay in sync.
     */
    private const CITIZEN_PASSWORD = 'Usuario123!';

    /**
     * Password shared by every organization operator (including the extra
     * operators seeded per organization for assignment variety).
     */
    private const OPERATOR_PASSWORD = 'Operador123!';

    /**
     * Citizen accounts used as incident reporters and commenters.
     * Emails follow `first.last@correo.com` (slugified, accent-free).
     *
     * @var list<array{0: string, 1: string}>
     */
    private const CITIZENS = [
        ['María Fernanda', 'Cevallos'],
        ['Juan Carlos', 'Villacís'],
        ['Andrea', 'Zambrano'],
        ['Luis Alberto', 'Paredes'],
        ['Gabriela', 'Moreira'],
        ['Diego', 'Salazar'],
        ['Karla', 'Vinueza'],
        ['Jorge', 'Andrade'],
        ['Paola', 'Cedeño'],
        ['Marco', 'Tapia'],
        ['Verónica', 'Loor'],
        ['Christian', 'Guerrero'],
        ['Silvia', 'Chiriboga'],
        ['Fernando', 'Espinoza'],
        ['Daniela', 'Yépez'],
        ['Ricardo', 'Bustamante'],
        ['Michelle', 'Alvarado'],
        ['Esteban', 'Naranjo'],
        ['Johanna', 'Quinteros'],
        ['Patricio', 'Mendoza'],
        ['Cristina', 'Jaramillo'],
        ['Wilson', 'Cabrera'],
        ['Elena', 'Ruiz'],
        ['Byron', 'Pazmiño'],
    ];

    /**
     * Extra operators created per organization, on top of the canonical
     * `operador.{slug}@organizacion.com`. Having more than one operator per
     * organization is what makes the seeded assignments (responsable + apoyo)
     * look like real workload distribution instead of one person owning
     * every incident.
     *
     * @var list<array{prefix: string, first_name: string}>
     */
    private const EXTRA_OPERATORS = [
        ['prefix' => 'operador2', 'first_name' => 'Operador Dos'],
        ['prefix' => 'operador3', 'first_name' => 'Operador Tres'],
    ];

    public function run(): void
    {
        $roleMap = Role::pluck('id', 'name')->toArray();

        $adminSistemaRoleId = $roleMap[UserRole::AdminSistema->value] ?? 1;
        $operadorSistemaRoleId = $roleMap[UserRole::OperadorSistema->value] ?? 2;
        $adminOrgRoleId = $roleMap[UserRole::AdminOrganizacion->value] ?? 3;
        $operadorOrgRoleId = $roleMap[UserRole::OperadorOrganizacion->value] ?? 4;
        $usuarioRoleId = $roleMap[UserRole::Usuario->value] ?? 5;

        // ─── 1. Usuarios Globales de Sistema ─────────────────────────────
        $globalUsers = [
            [
                'email' => 'admin@sistema.com',
                'password' => 'Admin123!',
                'role_id' => $adminSistemaRoleId,
                'first_name' => 'Admin Global',
                'last_name' => 'Sistema',
                'organization_id' => null,
            ],
            [
                'email' => 'operador@sistema.com',
                'password' => 'Operador123!',
                'role_id' => $operadorSistemaRoleId,
                'first_name' => 'Operador Global',
                'last_name' => 'Sistema',
                'organization_id' => null,
            ],
            [
                'email' => 'usuario@test.com',
                'password' => 'Usuario123!',
                'role_id' => $usuarioRoleId,
                'first_name' => 'Ciudadano',
                'last_name' => 'Ejemplo',
                'organization_id' => null,
            ],
        ];

        foreach ($globalUsers as $u) {
            User::query()->updateOrCreate(
                ['email' => $u['email']],
                [
                    'role_id' => $u['role_id'],
                    'organization_id' => $u['organization_id'],
                    'password' => Hash::make($u['password']),
                    'first_name' => $u['first_name'],
                    'last_name' => $u['last_name'],
                    'email_verified_at' => now(),
                ],
            );
            $this->command?->info("Usuario global [{$u['email']}] creado/actualizado.");
        }

        // ─── 2. Un Admin y un Operador por cada Organización ──────────────
        $organizations = Organization::all();

        foreach ($organizations as $org) {
            $slug = Str::slug($org->name);

            // Admin de Organización (role_id: admin_organizacion)
            $adminEmail = "admin.{$slug}@organizacion.com";
            User::query()->updateOrCreate(
                ['email' => $adminEmail],
                [
                    'role_id' => $adminOrgRoleId,
                    'organization_id' => $org->id,
                    'password' => Hash::make('Admin123!'),
                    'first_name' => 'Admin',
                    'last_name' => $org->name,
                    'email_verified_at' => now(),
                ],
            );
            $this->command?->info("  Admin Org [{$adminEmail}] -> {$org->name}");

            // Operador de Organización (role_id: operador_organizacion)
            $operadorEmail = "operador.{$slug}@organizacion.com";
            User::query()->updateOrCreate(
                ['email' => $operadorEmail],
                [
                    'role_id' => $operadorOrgRoleId,
                    'organization_id' => $org->id,
                    'password' => Hash::make('Operador123!'),
                    'first_name' => 'Operador',
                    'last_name' => $org->name,
                    'email_verified_at' => now(),
                ],
            );
            $this->command?->info("  Operador Org [{$operadorEmail}] -> {$org->name}");

            // Extra operators so incidents can carry a responsable plus one or
            // more apoyo assignments (see MassIncidentSeeder).
            foreach (self::EXTRA_OPERATORS as $extra) {
                $extraEmail = "{$extra['prefix']}.{$slug}@organizacion.com";
                User::query()->updateOrCreate(
                    ['email' => $extraEmail],
                    [
                        'role_id' => $operadorOrgRoleId,
                        'organization_id' => $org->id,
                        'password' => Hash::make(self::OPERATOR_PASSWORD),
                        'first_name' => $extra['first_name'],
                        'last_name' => $org->name,
                        'email_verified_at' => now(),
                    ],
                );
            }
        }

        // ─── 3. Ciudadanos (reporteros de incidencias) ────────────────────
        foreach (self::CITIZENS as [$firstName, $lastName]) {
            $email = Str::slug($firstName, '.').'.'.Str::slug($lastName).'@correo.com';

            User::query()->updateOrCreate(
                ['email' => $email],
                [
                    'role_id' => $usuarioRoleId,
                    'organization_id' => null,
                    'password' => Hash::make(self::CITIZEN_PASSWORD),
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email_verified_at' => now(),
                ],
            );
        }

        $this->command?->info(count(self::CITIZENS).' ciudadanos creados/actualizados (password: '.self::CITIZEN_PASSWORD.').');
    }
}
