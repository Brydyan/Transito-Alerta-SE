<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Redis;
use MatanYadaev\EloquentSpatial\Objects\Point;

uses(RefreshDatabase::class);

function createOperatorDashboardIncident(
    User $reporter,
    Organization $organization,
    Location $location,
    IncidentCategory $category,
    array $overrides = [],
): Incident {
    return Incident::create(array_merge([
        'title' => 'Incidencia operativa',
        'incident_category_id' => $category->id,
        'user_id' => $reporter->id,
        'location_id' => $location->id,
        'organization_id' => $organization->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
        'geom' => new Point(-2.2267, -80.8587, 4326),
    ], $overrides));
}

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->withoutMiddleware(JwtAuthenticate::class);
    Cache::flush();
    config([
        'operator-dashboard.nearby_radius_km' => 10,
        'operator-dashboard.recommendations_limit' => 10,
        'operator-dashboard.cache_ttl_seconds' => 300,
    ]);

    $this->location = Location::create([
        'name' => 'Santa Elena',
        'level' => 'city',
    ]);
    $this->organization = Organization::create([
        'name' => 'Servicios Municipales',
        'location_id' => $this->location->id,
    ]);
    $this->category = IncidentCategory::create([
        'name' => 'Infraestructura',
        'organization_id' => $this->organization->id,
    ]);
    $this->operator = User::factory()->create([
        'role_id' => 4,
        'organization_id' => $this->organization->id,
    ]);
    $this->reporter = User::factory()->create([
        'role_id' => 5,
        'organization_id' => $this->organization->id,
    ]);
});

it('returns assigned incidents, nearby recommendations, distances, and operator summary', function (): void {
    $assigned = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $this->location,
        $this->category,
        [
            'title' => 'Semáforo sin energía',
            'status' => IncidentStatus::InProgress,
            'priority' => 'high',
        ],
    );
    Assignment::create([
        'incident_id' => $assigned->id,
        'user_id' => $this->operator->id,
        'assignment_role' => 'responsable',
    ]);

    $resolved = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $this->location,
        $this->category,
        [
            'title' => 'Tubería reparada',
            'status' => IncidentStatus::Resolved,
            'resolution_date' => now(),
        ],
    );
    DB::table('incidents')->where('id', $resolved->id)->update([
        'created_at' => $resolved->resolution_date->copy()->subHours(26),
    ]);
    Assignment::create([
        'incident_id' => $resolved->id,
        'user_id' => $this->operator->id,
        'assignment_role' => 'apoyo',
    ]);

    $nearby = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $this->location,
        $this->category,
        [
            'title' => 'Luminaria averiada',
            'geom' => new Point(-2.2270, -80.8590, 4326),
        ],
    );
    $farther = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $this->location,
        $this->category,
        [
            'title' => 'Señal caída',
            'geom' => new Point(-2.2500, -80.8800, 4326),
        ],
    );

    Redis::shouldReceive('zscore')
        ->once()
        ->with('operators:active', (string) $this->operator->id)
        ->andReturn(time());
    Redis::shouldReceive('geopos')
        ->once()
        ->with('operators:locations', (string) $this->operator->id)
        ->andReturn([[-80.8587, -2.2267]]);

    $response = $this->actingAs($this->operator)->getJson('/api/operator/dashboard');

    $response->assertOk()
        ->assertJsonPath('has_recent_location', true)
        ->assertJsonPath('assigned_incidents.meta.total', 2)
        ->assertJsonPath('summary_counts.total_assigned', 2)
        ->assertJsonPath('summary_counts.by_status.in_progress', 1)
        ->assertJsonPath('summary_counts.by_status.resolved', 1)
        ->assertJsonPath('summary_counts.average_resolution_time.days', 1)
        ->assertJsonPath('summary_counts.average_resolution_time.hours', 2)
        ->assertJsonPath('nearby_recommendations.0.id', $nearby->id)
        ->assertJsonPath('nearby_recommendations.1.id', $farther->id)
        ->assertJsonPath('nearby_recommendations.0.location.path', 'Santa Elena');

    expect($response->json('assigned_incidents.data.0.distance_km'))->toBeNumeric()
        ->and($response->json('nearby_recommendations.0.distance_km'))->toBeLessThan(
            $response->json('nearby_recommendations.1.distance_km'),
        )
        ->and(collect($response->json('nearby_recommendations'))->pluck('id')->all())
        ->not->toContain($assigned->id);
});

it('requires dashboard view permission', function (): void {
    $dashboardPermission = Permission::query()
        ->where('resource', 'dashboard')
        ->where('action', 'view')
        ->value('permission_id');
    DB::table('role_permission')
        ->where('role_id', 4)
        ->where('permission_id', $dashboardPermission)
        ->delete();

    $this->actingAs($this->operator)
        ->getJson('/api/operator/dashboard')
        ->assertForbidden();
});

it('excludes assigned and nearby incidents from other organizations', function (): void {
    $otherLocation = Location::create([
        'name' => 'La Libertad',
        'level' => 'city',
    ]);
    $otherOrganization = Organization::create([
        'name' => 'Otra Organización',
        'location_id' => $otherLocation->id,
    ]);
    $otherCategory = IncidentCategory::create([
        'name' => 'Servicios',
        'organization_id' => $otherOrganization->id,
    ]);
    $otherReporter = User::factory()->create([
        'role_id' => 5,
        'organization_id' => $otherOrganization->id,
    ]);
    $crossOrganizationAssigned = createOperatorDashboardIncident(
        $otherReporter,
        $otherOrganization,
        $otherLocation,
        $otherCategory,
    );
    Assignment::create([
        'incident_id' => $crossOrganizationAssigned->id,
        'user_id' => $this->operator->id,
        'assignment_role' => 'apoyo',
    ]);
    createOperatorDashboardIncident(
        $otherReporter,
        $otherOrganization,
        $otherLocation,
        $otherCategory,
        ['geom' => new Point(-2.2270, -80.8590, 4326)],
    );

    Redis::shouldReceive('zscore')
        ->once()
        ->andReturn(time());
    Redis::shouldReceive('geopos')
        ->once()
        ->andReturn([[-80.8587, -2.2267]]);

    $response = $this->actingAs($this->operator)->getJson('/api/operator/dashboard');

    $response->assertOk()
        ->assertJsonPath('assigned_incidents.meta.total', 0)
        ->assertJsonPath('summary_counts.total_assigned', 0)
        ->assertJsonCount(0, 'nearby_recommendations')
        ->assertJsonCount(0, 'filter_options.locations');
});

it('returns assigned incidents without distance and no recommendations when GPS is stale', function (): void {
    $assigned = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $this->location,
        $this->category,
    );
    Assignment::create([
        'incident_id' => $assigned->id,
        'user_id' => $this->operator->id,
        'assignment_role' => 'responsable',
    ]);

    Redis::shouldReceive('zscore')
        ->once()
        ->with('operators:active', (string) $this->operator->id)
        ->andReturn(null);

    $response = $this->actingAs($this->operator)->getJson('/api/operator/dashboard');

    $response->assertOk()
        ->assertJsonPath('has_recent_location', false)
        ->assertJsonPath('assigned_incidents.data.0.id', $assigned->id)
        ->assertJsonPath('assigned_incidents.data.0.distance_km', null)
        ->assertJsonCount(0, 'nearby_recommendations');
});

it('filters assigned incidents by location descendants and date range', function (): void {
    $province = Location::create([
        'name' => 'Provincia de Santa Elena',
        'level' => 'province',
    ]);
    $city = Location::create([
        'name' => 'Salinas',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $visible = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $city,
        $this->category,
        ['title' => 'Incidencia reciente'],
    );
    Assignment::create([
        'incident_id' => $visible->id,
        'user_id' => $this->operator->id,
        'assignment_role' => 'responsable',
    ]);

    $old = createOperatorDashboardIncident(
        $this->reporter,
        $this->organization,
        $city,
        $this->category,
        ['title' => 'Incidencia antigua'],
    );
    DB::table('incidents')->where('id', $old->id)->update([
        'created_at' => now()->subMonth(),
    ]);
    Assignment::create([
        'incident_id' => $old->id,
        'user_id' => $this->operator->id,
        'assignment_role' => 'apoyo',
    ]);

    Redis::shouldReceive('zscore')->once()->andReturn(null);

    $query = http_build_query([
        'location_id' => $province->id,
        'inicio' => now()->subDay()->toDateString(),
        'fin' => now()->toDateString(),
    ]);
    $response = $this->actingAs($this->operator)
        ->getJson("/api/operator/dashboard?{$query}");

    $response->assertOk()
        ->assertJsonPath('assigned_incidents.meta.total', 1)
        ->assertJsonPath('assigned_incidents.data.0.id', $visible->id)
        ->assertJsonPath('summary_counts.total_assigned', 1);
});
