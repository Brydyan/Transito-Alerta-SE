<?php

declare(strict_types=1);

use App\Domains\Menus\Models\Menu;
use App\Domains\Users\Models\User;
use Database\Seeders\MenuSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);
    $this->seed(MenuSeeder::class);
});

/**
 * @return array<int, array{name: string, route: string}>
 */
function flattenMenuRoutes(array $nodes): array
{
    $out = [];
    foreach ($nodes as $node) {
        if (! empty($node['route'])) {
            $out[] = ['name' => $node['name'], 'route' => $node['route']];
        }
        if (! empty($node['children'])) {
            $out = array_merge($out, flattenMenuRoutes($node['children']));
        }
    }

    return $out;
}

/**
 * @param  array<int, array<string, mixed>>  $nodes
 * @return array<int, string>
 */
function collectRoutes(array $nodes): array
{
    return array_map(fn (array $n): string => $n['route'], flattenMenuRoutes($nodes));
}

it('admin_sistema sees every active menu via the isAdmin() bypass branch', function (): void {
    $user = User::factory()->create(['role_id' => 1]);

    $response = $this->withoutMiddleware()->actingAs($user)->getJson('/api/menus/my');

    $response->assertOk();
    $data = $response->json('data');
    $routes = collectRoutes($data);

    expect($routes)->toContain('/dashboard')
        ->and($routes)->toContain('/incidencias')
        ->and($routes)->toContain('/usuarios')
        ->and($routes)->toContain('/roles')
        ->and($routes)->toContain('/localizaciones')
        ->and($routes)->toContain('/categorias')
        ->and($routes)->toContain('/organizaciones')
        // admin_sistema sees citizen entries too via bypass
        ->and($routes)->toContain('/feed')
        ->and($routes)->toContain('/feed/crear')
        ->and($routes)->toContain('/configuracion/perfil');
});

it('operador_sistema sees back-office Incidencias but NOT Gestion group', function (): void {
    $user = User::factory()->create(['role_id' => 2]);

    $response = $this->withoutMiddleware()->actingAs($user)->getJson('/api/menus/my');

    $response->assertOk();
    $routes = collectRoutes($response->json('data'));

    expect($routes)->toContain('/dashboard')
        ->and($routes)->toContain('/incidencias')
        ->and($routes)->toContain('/localizaciones')
        ->and($routes)->toContain('/categorias')
        // Back-office Gestión group is gated by users.* and roles.* — operador_sistema lacks those.
        ->and($routes)->not->toContain('/usuarios')
        ->and($routes)->not->toContain('/roles');
});

it('admin_organizacion sees back-office plus citizen entries (spec override)', function (): void {
    $user = User::factory()->create(['role_id' => 3]);

    $response = $this->withoutMiddleware()->actingAs($user)->getJson('/api/menus/my');

    $response->assertOk();
    $routes = collectRoutes($response->json('data'));

    // Back-office items
    expect($routes)->toContain('/dashboard')
        ->and($routes)->toContain('/incidencias')
        ->and($routes)->toContain('/usuarios')
        ->and($routes)->not->toContain('/roles')
        ->and($routes)->toContain('/organizaciones');

    // Citizen items (per design Decision 1: feed.view granted to admin_organizacion)
    expect($routes)->toContain('/feed')
        ->and($routes)->toContain('/feed/crear')
        ->and($routes)->toContain('/configuracion/perfil');
});

it('operador_organizacion receives the operator dashboard route', function (): void {
    $user = User::factory()->create(['role_id' => 4]);

    $response = $this->withoutMiddleware()->actingAs($user)->getJson('/api/menus/my');

    $response->assertOk();
    $routes = collectRoutes($response->json('data'));

    expect($routes)->toContain('/operator/dashboard')
        ->and($routes)->not->toContain('/dashboard');
});

it('usuario sees only the four citizen entries — no back-office, no /incidencias', function (): void {
    $user = User::factory()->create(['role_id' => 5]);

    $response = $this->withoutMiddleware()->actingAs($user)->getJson('/api/menus/my');

    $response->assertOk();
    $data = $response->json('data');
    $routes = collectRoutes($data);

    expect($routes)->toContain('/feed')
        ->and($routes)->toContain('/feed/crear')
        ->and($routes)->toContain('/configuracion/perfil')
        ->and($routes)->toContain('/mapa');

    // No back-office at all
    expect($routes)->not->toContain('/dashboard')
        ->and($routes)->not->toContain('/incidencias')
        ->and($routes)->not->toContain('/incidencias/crear')
        ->and($routes)->not->toContain('/incidencias/pendientes')
        ->and($routes)->not->toContain('/usuarios')
        ->and($routes)->not->toContain('/roles')
        ->and($routes)->not->toContain('/localizaciones')
        ->and($routes)->not->toContain('/categorias')
        ->and($routes)->not->toContain('/organizaciones')
        ->and($routes)->not->toContain('/notificaciones');

    // The 4 entries are exactly the citizen ones, with no parent header
    expect(count($data))->toBe(4);
    $names = array_map(fn (array $n): string => $n['name'], $data);
    expect($names)->toEqualCanonicalizing(['Inicio', 'Reportar', 'Perfil', 'Mapa']);
});

it('creates the three new citizen menu rows (16, 17, 18) with the expected gates', function (): void {
    $inicio = Menu::where('menu_id', 16)->first();
    $reportar = Menu::where('menu_id', 17)->first();
    $perfil = Menu::where('menu_id', 18)->first();

    expect($inicio)->not->toBeNull()
        ->and($inicio->name)->toBe('Inicio')
        ->and($inicio->route)->toBe('/feed')
        ->and($inicio->icon)->toBe('house')
        ->and($inicio->parent_id)->toBeNull();

    expect($reportar)->not->toBeNull()
        ->and($reportar->name)->toBe('Reportar')
        ->and($reportar->route)->toBe('/feed/crear')
        ->and($reportar->icon)->toBe('circle-plus')
        ->and($reportar->parent_id)->toBeNull();

    expect($perfil)->not->toBeNull()
        ->and($perfil->name)->toBe('Perfil')
        ->and($perfil->route)->toBe('/configuracion/perfil')
        ->and($perfil->icon)->toBe('user')
        ->and($perfil->parent_id)->toBeNull();
});

it('menu id 1 (Dashboard) stores icon = gauge-high', function (): void {
    $dashboard = Menu::where('menu_id', 1)->first();
    expect($dashboard)->not->toBeNull()
        ->and($dashboard->name)->toBe('Dashboard')
        ->and($dashboard->icon)->toBe('gauge-high');
});

it('menu id 1 (Dashboard) icon survives MenuSeeder re-run (idempotency)', function (): void {
    // Re-run the seeder
    $this->seed(MenuSeeder::class);

    $dashboard = Menu::where('menu_id', 1)->first();
    expect($dashboard)->not->toBeNull()
        ->and($dashboard->icon)->toBe('gauge-high');
});

it('menu id 7 (Gestión parent header) stores icon = shield-halved (FA6 Free compliance)', function (): void {
    // R-Cleanup: shield-check is FontAwesome Pro only — it does not exist
    // in @fortawesome/fontawesome-free@6.5.2 (the CDN loaded by frontend/index.html)
    // and renders as a broken/missing glyph in the sidebar. shield-halved is
    // the FA6 Free equivalent and is the canonical replacement.
    $gestion = Menu::where('menu_id', 7)->first();
    expect($gestion)->not->toBeNull()
        ->and($gestion->name)->toBe('Gestión')
        ->and($gestion->icon)->toBe('shield-halved');
});

it('MenuSeeder is idempotent — re-running produces no duplicate citizen rows', function (): void {
    $firstCount = Menu::whereIn('menu_id', [16, 17, 18])->count();
    expect($firstCount)->toBe(3);

    $this->seed(MenuSeeder::class);

    $secondCount = Menu::whereIn('menu_id', [16, 17, 18])->count();
    expect($secondCount)->toBe(3);
});
