<?php

declare(strict_types=1);

use App\Domains\Locations\Models\Location;
use App\Domains\Locations\Repositories\EloquentLocationRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use MatanYadaev\EloquentSpatial\Objects\LineString;
use MatanYadaev\EloquentSpatial\Objects\MultiPolygon;
use MatanYadaev\EloquentSpatial\Objects\Point;
use MatanYadaev\EloquentSpatial\Objects\Polygon;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/** A small square polygon: lng ∈ [-80.8, -80.6], lat ∈ [-1.0, -0.8]. */
function locationRepoSquare(): MultiPolygon
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
 * Regression coverage for `findByPoint()` preferring the most specific
 * (deepest) match over an arbitrary one.
 *
 * A point inside a cantón is necessarily also inside that cantón's parent
 * province (the province polygon fully contains it), so more than one row
 * can legitimately match the same point once both province- and
 * cantón-level geometry are loaded (`LocationGeomSeeder`). Before this fix,
 * `findByPoint()` had no explicit ordering — `first()` could arbitrarily
 * return either row. `LocationGeomConsistentRule` walks *up* from the match
 * via `ancestorsAndSelf()`, so an arbitrary coarser match (province instead
 * of cantón) would never contain a deeper submitted `location_id` in that
 * chain, and a legitimate cantón-level submission would be wrongly
 * rejected. This is exactly what surfaced when real boundary data was
 * first loaded for Santa Elena / La Libertad.
 */
it('pgsql: findByPoint returns the most specific (deepest) match when the point is inside both a province and its cantón', function (): void {
    $province = Location::create([
        'name' => 'El Oro',
        'level' => 'province',
        'geom' => locationRepoSquare(),
    ]);
    $city = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => locationRepoSquare(),
    ]);

    $repository = new EloquentLocationRepository;
    $match = $repository->findByPoint(new Point(-0.9, -80.7, 4326));

    expect($match)->not->toBeNull();
    expect($match->id)->toBe($city->id);
    expect($match->level->value)->toBe('city');
});

it('pgsql: findByPoint still returns the province when no cantón polygon contains the point', function (): void {
    $province = Location::create([
        'name' => 'El Oro',
        'level' => 'province',
        'geom' => locationRepoSquare(),
    ]);
    // Sibling cantón with no geom set (e.g. still unmatched) — must not
    // block the coarser province match from being found.
    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $repository = new EloquentLocationRepository;
    $match = $repository->findByPoint(new Point(-0.9, -80.7, 4326));

    expect($match)->not->toBeNull();
    expect($match->id)->toBe($province->id);
});

// -----------------------------------------------------------------
// TDD RED: ancestors() contract tests
// -----------------------------------------------------------------

/**
 * Verifies that ancestors() returns the full ordered root-to-leaf chain
 * for a given location. The chain MUST be ordered from root to the
 * location itself (root first, self last), which is what the frontend
 * needs for deterministic cascade preselection.
 *
 * Spec: Requirement — Organization Detail Location Hierarchy
 * Spec: Requirement — Incident Detail Location Hierarchy
 */
it('ancestors returns ordered root-to-leaf chain for a deeply nested location', function (): void {
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country', 'parent_id' => null]);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);
    $neighborhood = Location::create(['name' => 'Centro', 'level' => 'neighborhood', 'parent_id' => $city->id]);

    $repository = new EloquentLocationRepository;
    $ancestors = $repository->ancestors($neighborhood->id);

    expect($ancestors)->toHaveCount(4);
    // Root-to-leaf order: country → province → city → neighborhood
    expect($ancestors->pluck('id')->toArray())->toBe([$country->id, $province->id, $city->id, $neighborhood->id]);
    expect($ancestors->pluck('name')->toArray())->toBe(['Ecuador', 'Pichincha', 'Quito', 'Centro']);
});

/**
 * Verifies that ancestors() for a root-level location returns only itself.
 */
it('ancestors returns only self for a root location', function (): void {
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country', 'parent_id' => null]);

    $repository = new EloquentLocationRepository;
    $ancestors = $repository->ancestors($country->id);

    expect($ancestors)->toHaveCount(1);
    expect($ancestors->first()->id)->toBe($country->id);
    expect($ancestors->first()->name)->toBe('Ecuador');
});

/**
 * Verifies that ancestors() returns an empty collection for a non-existent id.
 */
it('ancestors returns empty collection for non-existent location', function (): void {
    $repository = new EloquentLocationRepository;
    $ancestors = $repository->ancestors(99999);

    expect($ancestors)->toHaveCount(0);
});

// -----------------------------------------------------------------
// TDD RED: findByParent() direct-children-only contract tests
// -----------------------------------------------------------------

/**
 * Verifies that findByParent() returns ONLY direct children and does NOT
 * eager-load grandchildren. This is critical for progressive loading —
 * the frontend must fetch grandchildren on demand, not receive them pre-loaded.
 *
 * Spec: Requirement — Parent-Scoped Lazy Loading
 */
it('findByParent returns only direct children with no eager-loaded grandchildren', function (): void {
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country', 'parent_id' => null]);
    $province1 = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $province2 = Location::create(['name' => 'Guayas', 'level' => 'province', 'parent_id' => $country->id]);
    // Grandchildren of country — should NOT appear in country query
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province1->id]);
    $city2 = Location::create(['name' => 'Guayaquil', 'level' => 'city', 'parent_id' => $province2->id]);

    $repository = new EloquentLocationRepository;
    $children = $repository->findByParent($country->id);

    expect($children)->toHaveCount(2);
    $childIds = $children->pluck('id')->toArray();
    expect($childIds)->toContain($province1->id);
    expect($childIds)->toContain($province2->id);
    expect($childIds)->not->toContain($city1->id);
    expect($childIds)->not->toContain($city2->id);
});
