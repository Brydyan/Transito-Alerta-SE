<?php

declare(strict_types=1);

use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Http\Resources\OrganizationResource;
use App\Domains\Organizations\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/**
 * Latent regression: the same root cause as the production incident
 * (`POST /api/incidents` 500), applied to the symmetric
 * `POST /api/organizations` flow.
 *
 * `OrganizationResource::toArray()` (line 50) calls
 * `$locationRepo->ancestors($this->location_id)`. `Organization::$casts`
 * does not declare `location_id`, so when the request payload carries
 * `"location_id": "<id>"` as a JSON string, the mass-assigned model
 * surfaces a string and the strict-typed repo signature rejects it.
 *
 * This endpoint has not surfaced in the production logs only because
 * `POST /organizations` is called far less often than
 * `POST /incidents`. The fix in `Organization::$casts` closes the
 * symmetric hole proactively, matching the precedent set by
 * `Comment::$casts` and (after this change) `Incident::$casts`.
 */
it('serializes location_path when location_id is hydrated as a string (POST /api/organizations)', function (): void {
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country', 'parent_id' => null]);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);

    // Mimic the in-memory state after `Organization::create($request->validated())`
    // where the JSON payload carried `"location_id": "<id>"` as a string.
    $organization = new Organization;
    $organization->setRawAttributes([
        'id' => 1,
        'name' => 'Junta de Agua Jasrapo',
        'location_id' => (string) $province->id,
        'parent_id' => null,
        'incident_category_id' => null,
        'max_active' => 10,
        'created_at' => null,
        'updated_at' => null,
    ]);

    // Pre-conditions — prove the test setup actually reproduces the
    // pre-fix in-memory state (no `integer` cast on `location_id`).
    expect($organization->getAttributes()['location_id'])->toBe((string) $province->id);

    $payload = (new OrganizationResource($organization))->toArray(new Request);

    expect($payload)->toHaveKey('location_path')
        ->and($payload['location_path'])->toHaveCount(2)
        ->and(array_column($payload['location_path'], 'id'))
        ->toBe([$country->id, $province->id]);
});
