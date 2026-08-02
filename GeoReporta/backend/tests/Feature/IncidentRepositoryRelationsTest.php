<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Repositories\EloquentIncidentRepository;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // admin_sistema is bypassed by the repository's applyFilters, so it can
    // stand in here to avoid the tenant-scoping whereRaw.
    $adminRoleId = Role::firstOrCreate(['name' => 'admin_sistema'])->id;

    $this->systemAdmin = User::factory()->create([
        'role_id' => $adminRoleId,
        'organization_id' => null,
    ]);

    $this->location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $this->org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $this->location->id,
    ]);
    $this->category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $this->org->id,
    ]);

    $this->incident = Incident::create([
        'title' => 'Repo test incident',
        'incident_category_id' => $this->category->id,
        'user_id' => $this->systemAdmin->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

/**
 * Return the set of tables eagerly-loaded by Eloquent (Laravel's default
 * eager-load strategy is the IN-where query, e.g.
 *   "select * from "incident_categories" where "id" in (...)").
 *
 * `comments_count` is excluded because it is a `withCount` subquery,
 * not an eager-load of the comments relation.
 */
function eagerLoadedTables(array $log): array
{
    $tables = [];
    foreach ($log as $entry) {
        $sql = strtolower($entry['query']);

        // Skip the comments count subquery.
        if (str_contains($sql, 'as "comments_count"')) {
            continue;
        }
        // Skip the main incidents paginate query.
        if (str_contains($sql, 'from "incidents"') && ! str_contains($sql, 'where "id" in')) {
            continue;
        }
        // Skip aggregate-count queries (paginate's total).
        if (str_contains($sql, 'count(*) as "aggregate"')) {
            continue;
        }

        // Eager-load shape: "select * from "<table>" where "<table>"."<pk>" in (...)".
        if (preg_match('/from\s+"?([a-z_]+)"?\s+where\s+"?\1"?\.?"?(id|uuid)"?\s+in\s*\(/i', $sql, $m)) {
            $tables[] = $m[1];
        }
    }

    return array_values(array_unique($tables));
}

it('SCEN-2.1: eager-loads only the relations[] the caller passes (and not the old hard-coded set)', function (): void {
    $this->actingAs($this->systemAdmin);

    $repo = new EloquentIncidentRepository;

    DB::enableQueryLog();
    DB::flushQueryLog();

    $page = $repo->paginate([
        'relations' => ['category', 'user'],
    ]);
    // Force hydration so the eager-load queries actually fire.
    $page->getCollection()->each(fn (Incident $i) => $i->getRelations());

    $tables = eagerLoadedTables(DB::getQueryLog());

    // Eager-loaded relations present.
    expect($tables)->toContain('incident_categories');
    expect($tables)->toContain('users');

    // Eager-loaded relations NOT passed are absent.
    expect($tables)->not->toContain('locations');
    expect($tables)->not->toContain('organizations');
});

it('SCEN-2.2: when no relations[] is passed, the repository does NOT eager-load', function (): void {
    $this->actingAs($this->systemAdmin);

    $repo = new EloquentIncidentRepository;

    DB::enableQueryLog();
    DB::flushQueryLog();

    $page = $repo->paginate([]);
    $page->getCollection()->each(fn (Incident $i) => $i->getRelations());

    $tables = eagerLoadedTables(DB::getQueryLog());

    // No eager-load queries at all.
    expect($tables)->toBe([]);
});

it('withCount(comments) is always applied regardless of relations[]', function (): void {
    $this->actingAs($this->systemAdmin);

    $repo = new EloquentIncidentRepository;

    DB::enableQueryLog();
    DB::flushQueryLog();

    $repo->paginate([]); // no relations
    $sql = strtolower(implode("\n", array_column(DB::getQueryLog(), 'query')));
    expect($sql)->toContain('comments_count');

    DB::flushQueryLog();
    $repo->paginate(['relations' => ['user']]); // with relations
    $sql = strtolower(implode("\n", array_column(DB::getQueryLog(), 'query')));
    expect($sql)->toContain('comments_count');
});
