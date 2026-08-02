<?php

declare(strict_types=1);

/**
 * Regression test (image-persistence-polymorphic, post-WU8 bug fix).
 *
 * `Incident::$fillable`/`casts()` used to keep a dead `'images' => 'array'`
 * entry referencing the legacy `incidents.images` JSON column. Eloquent's
 * attribute/cast resolution takes priority over relation methods when a
 * model property is accessed (`HasAttributes::getAttribute()` checks
 * `array_key_exists($key, $this->casts)` BEFORE it ever checks relations),
 * so `$incident->images` (property, no parens) resolved the stale cast
 * instead of falling through to the `images(): MorphMany` relation method —
 * even though `$incident->images()->count()` (explicit relation call)
 * always worked correctly. Confirmed live against a real dev DB where the
 * legacy column no longer exists: the cast still shadowed the relation.
 */

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'admin_sistema']);

    $this->user = User::factory()->create();
    $category = IncidentCategory::create(['name' => 'Property Test Cat']);
    $location = Location::create(['name' => 'Property Test Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Property Test Org', 'location_id' => $location->id]);

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'title' => 'Property Access Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->incident->images()->create([
        'storage_path' => 'incidents/'.$this->incident->id.'/a.webp',
        'is_thumbnail' => true,
        'sort_order' => 0,
    ]);
    $this->incident->images()->create([
        'storage_path' => 'incidents/'.$this->incident->id.'/b.webp',
        'is_thumbnail' => false,
        'sort_order' => 1,
    ]);
});

it('resolves $incident->images (property access, no parens) to the MorphMany relation Collection, matching $incident->images()->count()', function (): void {
    // Fresh model instance: no relation eager-loaded, forces Eloquent's
    // getAttribute() resolution path (cast-vs-relation) to run for real.
    $incident = Incident::find($this->incident->id);

    expect($incident->relationLoaded('images'))->toBeFalse();

    $viaRelationCall = $incident->images()->count();
    expect($viaRelationCall)->toBe(2);

    // This is the exact property-access collision the bug report describes:
    // before the fix, this returned null (the dead array cast); after the
    // fix it must return the same Collection the relation method returns.
    $viaProperty = $incident->images;

    expect($viaProperty)->toBeInstanceOf(EloquentCollection::class);
    expect($viaProperty)->toHaveCount($viaRelationCall);
    expect($viaProperty->pluck('storage_path')->all())->toBe(
        $incident->images()->get()->pluck('storage_path')->all()
    );
});

it('no longer declares a dead images cast/fillable entry on Incident', function (): void {
    $incident = new Incident;

    expect($incident->getFillable())->not->toContain('images');
    expect(array_key_exists('images', $incident->getCasts()))->toBeFalse();
});
