<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use MatanYadaev\EloquentSpatial\Objects\LineString;
use MatanYadaev\EloquentSpatial\Objects\MultiPolygon;
use MatanYadaev\EloquentSpatial\Objects\Point;
use MatanYadaev\EloquentSpatial\Objects\Polygon;

/**
 * Feature (HTTP round-trip) tests for `LocationGeomConsistentRule`.
 *
 * `locations.geom` and `incidents.geom` are PostgreSQL-only columns (see
 * `2026_06_15_000002_create_locations_table.php` and
 * `2026_06_15_000005_create_incidents_table.php`) — `composer test` runs
 * exclusively against Postgres (backend-tests-postgres-migration, issue
 * #197), so every scenario here always executes for real, no driver
 * check needed. The rule's own driver-guard (it never queries
 * `locations.geom` on a non-pgsql connection) is covered separately in
 * the sibling unit test
 * `tests/Unit/Domains/Incidents/LocationGeomConsistentRuleTest.php`.
 */
uses(RefreshDatabase::class);

/** A small square polygon: lng ∈ [-80.8, -80.6], lat ∈ [-1.0, -0.8] (Machala-ish). */
function machalaSquare(): MultiPolygon
{
    return new MultiPolygon([
        new Polygon([
            new LineString([
                new Point(-1.0, -80.8),
                new Point(-1.0, -80.6),
                new Point(-0.8, -80.6),
                new Point(-0.8, -80.8),
                new Point(-1.0, -80.8),
            ]),
        ]),
    ]);
}

/**
 * Square geom ~400km north of machalaSquare(), non-overlapping
 * (lng ∈ [-79.0, -78.8], lat ∈ [-0.4, -0.2]). Mirrors
 * `quitoSquareGeom()` in the sibling unit test
 * `LocationGeomConsistentRuleTest`.
 *
 * `LocationGeomConsistentRule` stays SILENT when the SUBMITTED location
 * has no polygon of its own (product decision, PR #97 — parroquia and
 * any other geom-less level get no cross-check, to avoid false 422s).
 * A "mismatched location_id" scenario can only exercise the rejection
 * path if the mismatched location has its OWN (non-matching) polygon —
 * an unrelated location with `geom = null` would silently pass instead,
 * which is not what these scenarios intend to test.
 */
function quitoSquare(): MultiPolygon
{
    return new MultiPolygon([
        new Polygon([
            new LineString([
                new Point(-0.4, -79.0),
                new Point(-0.4, -78.8),
                new Point(-0.2, -78.8),
                new Point(-0.2, -79.0),
                new Point(-0.4, -79.0),
            ]),
        ]),
    ]);
}

function locationGeomBasePayload(array $overrides = []): array
{
    return array_merge([
        'title' => 'Fuga de agua',
        'priority' => 'medium',
        'incident_category_id' => test()->category->id,
        'organization_id' => test()->organization->id,
    ], $overrides);
}

beforeEach(function (): void {
    $this->withoutMiddleware([
        JwtAuthenticate::class,
        Authorize::class,
    ]);

    Storage::fake('s3');

    $adminRole = Role::firstOrCreate(['name' => 'admin_sistema']);
    $adminRoleId = $adminRole->id;

    // Create system admin user
    $this->systemAdmin = User::factory()->create(['role_id' => $adminRoleId]);

    // Create location and organization for tests
    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $this->organization = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
        'max_active_claims' => 5,
    ]);

    // Create incident category
    $this->category = IncidentCategory::create([
        'name' => 'Test Category',
        'organization_id' => $this->organization->id,
    ]);
});

it('pgsql: a point inside the selected location\'s polygon passes', function (): void {
    $location = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquare(),
    ]);
    $this->actingAs($this->systemAdmin);

    $response = $this->postJson('/api/incidents', locationGeomBasePayload([
        'location_id' => $location->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]]), // inside the square
    ]));

    $response->assertCreated();
});

it('pgsql: a point inside the polygon but a mismatched location_id is rejected with 422', function (): void {
    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquare(),
    ]);
    // Must have its OWN (non-matching) polygon: the rule stays silent
    // for a submitted location with geom = null (see quitoSquare()).
    $quito = Location::create(['name' => 'Quito', 'level' => 'city', 'geom' => quitoSquare()]);
    $this->actingAs($this->systemAdmin);

    $response = $this->postJson('/api/incidents', locationGeomBasePayload([
        'location_id' => $quito->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]]), // inside Machala's square, not Quito
    ]));

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['location_id']);
});

it('pgsql: submitting the matched location\'s ancestor (broader level) still passes', function (): void {
    $province = Location::create(['name' => 'El Oro', 'level' => 'province']);
    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => machalaSquare(),
    ]);
    $this->actingAs($this->systemAdmin);

    // Submitting the ancestor (province) of the matched location is still
    // consistent — the user just chose a broader level than the polygon.
    $response = $this->postJson('/api/incidents', locationGeomBasePayload([
        'location_id' => $province->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]]),
    ]));

    $response->assertCreated();
});

// ──────────────────────────────────────────────────────────────
// multipart/form-data — the real frontend path whenever images are
// attached. `geom` arrives as a JSON string field (see
// `fix(incidencias): serialize geom as JSON before FormData submit`), not
// a JSON body — this must be proven to work the same way as postJson().
// ──────────────────────────────────────────────────────────────

it('pgsql: multipart submission (with an image) still passes for a consistent point', function (): void {
    $location = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquare(),
    ]);
    $this->actingAs($this->systemAdmin);

    $response = $this->post('/api/incidents', locationGeomBasePayload([
        'location_id' => $location->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]]),
        'images' => [UploadedFile::fake()->image('evidencia.jpg')],
    ]));

    $response->assertCreated();
});

it('pgsql: multipart submission (with an image) is rejected for a mismatched location_id', function (): void {
    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquare(),
    ]);
    // Must have its OWN (non-matching) polygon: the rule stays silent
    // for a submitted location with geom = null (see quitoSquare()).
    $quito = Location::create(['name' => 'Quito', 'level' => 'city', 'geom' => quitoSquare()]);
    $this->actingAs($this->systemAdmin);

    $response = $this->post('/api/incidents', locationGeomBasePayload([
        'location_id' => $quito->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]]),
        'images' => [UploadedFile::fake()->image('evidencia.jpg')],
    ]));

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['location_id']);
});

// ──────────────────────────────────────────────────────────────
// Update path — `sometimes` on `location_id`. Never exercised by the
// pre-existing UpdateIncidentRequestTest.php, and this rule's behavior on
// partial updates (location_id present without geom) is only proven by
// static reading unless a test actually runs it.
// ──────────────────────────────────────────────────────────────

it('location_id present without geom on update passes (sqlite-safe — nothing to cross-check)', function (): void {
    $location = Location::create(['name' => 'Machala', 'level' => 'city']);
    $otherLocation = Location::create(['name' => 'Quito', 'level' => 'city']);
    $incident = Incident::create([
        'title' => 'Existing incident',
        'incident_category_id' => $this->category->id,
        'organization_id' => $this->organization->id,
        'user_id' => $this->systemAdmin->id,
        'location_id' => $location->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
    $this->actingAs($this->systemAdmin);

    // Partial update: change location_id only, no geom in this payload at
    // all — the rule must skip (nothing to cross-check), not reject.
    $response = $this->putJson("/api/incidents/{$incident->id}", [
        'location_id' => $otherLocation->id,
    ]);

    $response->assertOk();
});

it('pgsql: update with a mismatched location_id + geom is rejected with 422', function (): void {
    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquare(),
    ]);
    // Must have its OWN (non-matching) polygon: the rule stays silent
    // for a submitted location with geom = null (see quitoSquare()).
    $quito = Location::create(['name' => 'Quito', 'level' => 'city', 'geom' => quitoSquare()]);
    $incident = Incident::create([
        'title' => 'Existing incident',
        'incident_category_id' => $this->category->id,
        'organization_id' => $this->organization->id,
        'user_id' => $this->systemAdmin->id,
        'location_id' => $quito->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
    $this->actingAs($this->systemAdmin);

    $response = $this->putJson("/api/incidents/{$incident->id}", [
        'location_id' => $quito->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]]), // inside Machala, not Quito
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['location_id']);
});
