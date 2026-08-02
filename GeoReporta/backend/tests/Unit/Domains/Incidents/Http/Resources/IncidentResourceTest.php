<?php

declare(strict_types=1);

use App\Domains\Incidents\Http\Resources\IncidentResource;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/**
 * Regression test for the production TypeError surfaced on
 * `POST /api/incidents` — see stack trace:
 *
 *   EloquentLocationRepository::ancestors(): Argument #1 ($id) must be of
 *   type int, string given, called in
 *   app/Domains/Incidents/Http/Resources/IncidentResource.php on line 89.
 *
 * Root cause: `StoreIncidentRequest::rules()` validates `location_id` as
 * `'integer'`, but Laravel's `integer` rule does NOT cast — so after
 * `$request->validated()` the value remains the raw JSON string
 * (e.g. `"5"`). `IncidentController::store()` mass-assigns it into the
 * model. `Incident::$casts` did not include `location_id`, so the
 * in-memory attribute stays a string, and `IncidentResource::toArray()`
 * then passes it to `LocationRepository::ancestors(int $id)` — which
 * fails under `declare(strict_types=1)`.
 *
 * Fix: `Incident::$casts` normalises `location_id` to `int`, matching
 * the precedent set by `Comment::$casts` (`incident_id`, `user_id`,
 * `parent_id` all `'integer'`).
 */
it('serializes location_path when location_id is hydrated as a string (POST /api/incidents)', function (): void {
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country', 'parent_id' => null]);
    $city = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $country->id]);

    // Mimic the in-memory state of an Incident just created via
    // `Incident::create($request->validated())` where the JSON payload
    // carried `"location_id": "<id>"` as a string. `setRawAttributes`
    // bypasses the cast pipeline (mirroring what mass-assignment does
    // before any cast is applied at access time), which is exactly
    // what triggers the production bug.
    $incident = new Incident;
    $incident->setRawAttributes([
        'id' => 1,
        'location_id' => (string) $city->id,
        'incident_category_id' => 1,
        'organization_id' => 1,
        'user_id' => 18,
        'title' => 'Bache en Av. Amazonas',
        'description' => null,
        'status' => 'pending',
        'priority' => 'medium',
        'resolution_date' => null,
        'claimed_by' => null,
        'claimed_at' => null,
        'created_at' => null,
        'updated_at' => null,
    ]);

    // Pre-conditions — prove the test setup actually reproduces the
    // pre-fix in-memory state (no `integer` cast on `location_id`).
    expect($incident->getAttributes()['location_id'])->toBe((string) $city->id);

    $payload = (new IncidentResource($incident))->toArray(new Request);

    expect($payload)->toHaveKey('location_path')
        ->and($payload['location_path'])->toHaveCount(2)
        ->and(array_column($payload['location_path'], 'id'))
        ->toBe([$country->id, $city->id]);
});
