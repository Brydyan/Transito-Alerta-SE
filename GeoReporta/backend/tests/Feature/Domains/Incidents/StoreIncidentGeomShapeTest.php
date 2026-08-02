<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use MatanYadaev\EloquentSpatial\Objects\Point;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->withoutMiddleware([
        JwtAuthenticate::class,
        Authorize::class,
    ]);

    app()->setLocale('es');

    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
    ]);

    $this->systemAdmin = User::factory()->create([
        'role_id' => Role::where('name', 'admin_sistema')->first()->id,
        'organization_id' => null,
    ]);

    $orgLocation = Location::create(['name' => 'Ubicación base', 'level' => 'city']);
    $this->organization = Organization::create([
        'name' => 'Organización de prueba',
        'location_id' => $orgLocation->id,
    ]);
    $this->category = IncidentCategory::create([
        'name' => 'Categoría de prueba',
        'organization_id' => $this->organization->id,
    ]);
    $this->location = Location::create(['name' => 'Machala', 'level' => 'city']);

    $this->actingAs($this->systemAdmin);
});

function storeIncidentGeomPayload(mixed $geom): array
{
    return [
        'title' => 'Fuga de agua',
        'description' => 'Descripción de prueba',
        'priority' => 'medium',
        'incident_category_id' => test()->category->id,
        'location_id' => test()->location->id,
        'organization_id' => test()->organization->id,
        'geom' => $geom,
    ];
}

it('creates an incident when geom is a decoded array', function (): void {
    $response = $this->postJson('/api/incidents', storeIncidentGeomPayload([
        'type' => 'Point',
        'coordinates' => [-80.7, -0.9],
    ]));

    $response->assertCreated();
});

it('creates an incident when geom is a JSON string', function (): void {
    $response = $this->postJson('/api/incidents', storeIncidentGeomPayload(json_encode([
        'type' => 'Point',
        'coordinates' => [-80.7, -0.9],
    ], JSON_THROW_ON_ERROR)));

    $response->assertCreated();
});

it('creates an incident when geom is an Eloquent Spatial Point', function (): void {
    $response = $this->post('/api/incidents', storeIncidentGeomPayload(
        new Point(-0.9, -80.7, 4326),
    ));

    $response->assertCreated();
});

it('creates an incident when geom is null', function (): void {
    $response = $this->postJson('/api/incidents', storeIncidentGeomPayload(null));

    $response->assertCreated();
});

it('returns a translated validation message for an invalid geom shape', function (): void {
    $response = $this->postJson('/api/incidents', storeIncidentGeomPayload([
        'coordinates' => [-80.7, -0.9],
    ]));

    $response->assertUnprocessable();
    $response->assertJsonValidationErrors(['geom']);

    expect($response->json('message'))
        ->not->toBe('validation.json')
        ->toContain('ubicación geográfica');
});
