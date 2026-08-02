<?php

declare(strict_types=1);

use App\Domains\Permissions\Models\Permission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
});

it('seeds the incidents.manage permission in the catalog', function (): void {
    $permission = Permission::where('resource', 'incidents')
        ->where('action', 'manage')
        ->first();

    expect($permission)->not->toBeNull()
        ->and($permission->name)->toBe('Gestionar Incidencias (Back-office)')
        ->and($permission->description)->toBe('Crear/gestionar incidencias desde el back-office');
});

it('seeds the feed.view permission in the catalog', function (): void {
    $permission = Permission::where('resource', 'feed')
        ->where('action', 'view')
        ->first();

    expect($permission)->not->toBeNull()
        ->and($permission->name)->toBe('Ver Feed')
        ->and($permission->description)->toBe('Acceso al feed ciudadano de incidencias');
});

it('seeds the profile.view permission in the catalog', function (): void {
    $permission = Permission::where('resource', 'profile')
        ->where('action', 'view')
        ->first();

    expect($permission)->not->toBeNull()
        ->and($permission->name)->toBe('Ver Perfil')
        ->and($permission->description)->toBe('Ver perfil propio');
});

it('keeps the seeder idempotent for the three new permissions', function (): void {
    $firstCount = Permission::count();

    // Re-run the seeder
    $this->seed(PermissionSeeder::class);

    expect(Permission::count())->toBe($firstCount);
});

it('does not create duplicate rows when re-run', function (): void {
    $this->seed(PermissionSeeder::class);

    $incidentsManage = Permission::where('resource', 'incidents')->where('action', 'manage');
    $feedView = Permission::where('resource', 'feed')->where('action', 'view');
    $profileView = Permission::where('resource', 'profile')->where('action', 'view');

    expect($incidentsManage->count())->toBe(1)
        ->and($feedView->count())->toBe(1)
        ->and($profileView->count())->toBe(1);
});
