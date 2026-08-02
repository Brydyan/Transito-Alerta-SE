<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Organizations\Repositories\EloquentOrganizationRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->repo = new EloquentOrganizationRepository;
});

it('finds the organization covering a location through its ancestors', function (): void {
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province']);
    $city = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);
    $org = Organization::create([
        'name' => 'GAD Pichincha',
        'location_id' => $province->id,
    ]);

    // Org sits at the province; an incident in the city must resolve to it.
    expect($this->repo->findForLocation($city->id)?->id)->toBe($org->id);
    // Direct match also works.
    expect($this->repo->findForLocation($province->id)?->id)->toBe($org->id);
});

it('returns null when no organization covers the location', function (): void {
    $loc = Location::create(['name' => 'Islote', 'level' => 'city']);

    expect($this->repo->findForLocation($loc->id))->toBeNull();
    expect($this->repo->findForLocation(999999))->toBeNull();
});

it('returns a name-ordered catalog with optional parent_id', function (): void {
    $loc = Location::create(['name' => 'HQ', 'level' => 'city']);
    $parent = Organization::create(['name' => 'Zeta Org', 'location_id' => $loc->id]);
    Organization::create([
        'name' => 'Alpha Org',
        'location_id' => $loc->id,
        'parent_id' => $parent->id,
    ]);

    $catalog = $this->repo->catalog();
    expect($catalog->pluck('name')->all())->toBe(['Alpha Org', 'Zeta Org']);
    expect($catalog->first())->not->toHaveKey('parent_id');

    $withParent = $this->repo->catalog(withParent: true);
    expect($withParent->firstWhere('name', 'Alpha Org')['parent_id'])->toBe($parent->id);
});

it('findNotifiedFor returns orgs whose location covers the incident location AND category matches or is NULL', function (): void {
    $category = IncidentCategory::create([
        'name' => 'Alumbrado Público',
        'parent_id' => null,
    ]);
    $otherCategory = IncidentCategory::create([
        'name' => 'Baches',
        'parent_id' => null,
    ]);

    $province = Location::create(['name' => 'Pichincha', 'level' => 'province']);
    $city = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $transversal = Organization::create([
        'name' => 'GAD Provincial',
        'location_id' => $province->id,
        'incident_category_id' => null,
    ]);
    $categoriaMatch = Organization::create([
        'name' => 'Empresa Eléctrica Quito',
        'location_id' => $city->id,
        'incident_category_id' => $category->id,
    ]);
    $otraCategoria = Organization::create([
        'name' => 'Empresa de Baches',
        'location_id' => $city->id,
        'incident_category_id' => $otherCategory->id,
    ]);

    $notified = $this->repo->findNotifiedFor($city->id, $category->id);

    // Both the transversal (any category) and the category-specific match.
    // The other-category org must NOT be here.
    expect($notified->pluck('id')->sort()->values()->all())
        ->toBe(collect([$transversal->id, $categoriaMatch->id])->sort()->values()->all());
    expect($notified->pluck('id'))->not->toContain($otraCategoria->id);
});

it('findNotifiedFor returns an empty collection when no location matches', function (): void {
    $category = IncidentCategory::create([
        'name' => 'Cualquiera',
        'parent_id' => null,
    ]);
    $loc = Location::create(['name' => 'Islote', 'level' => 'city']);

    expect($this->repo->findNotifiedFor($loc->id, $category->id))->toBeEmpty();
});

it('findNotifiedFor returns an empty collection when the location does not exist', function (): void {
    $category = IncidentCategory::create([
        'name' => 'Cualquiera',
        'parent_id' => null,
    ]);

    expect($this->repo->findNotifiedFor(999999, $category->id))->toBeEmpty();
});

it('an org configured for a root category covers its subcategory (Baches under Infraestructura Vial)', function (): void {
    $root = IncidentCategory::create([
        'name' => 'Infraestructura Vial',
        'parent_id' => null,
    ]);
    $sub = IncidentCategory::create([
        'name' => 'Baches y Hundimientos',
        'parent_id' => $root->id,
    ]);
    $otherRoot = IncidentCategory::create([
        'name' => 'Seguridad Ciudadana',
        'parent_id' => null,
    ]);

    $province = Location::create(['name' => 'Pichincha', 'level' => 'province']);
    $city = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $gad = Organization::create([
        'name' => 'GAD Municipal del Cantón Quito',
        'location_id' => $city->id,
        'incident_category_id' => $root->id, // configured for the ROOT
    ]);
    $unrelated = Organization::create([
        'name' => 'Seguridad GAD',
        'location_id' => $city->id,
        'incident_category_id' => $otherRoot->id,
    ]);

    // The incident is filed under the SUBcategory; the org configured for
    // the root must still match (same ancestry rule as locations).
    $notified = $this->repo->findNotifiedFor($city->id, $sub->id);

    expect($notified->pluck('id'))->toContain($gad->id);
    expect($notified->pluck('id'))->not->toContain($unrelated->id);

    // findForLocation (auto-assign) must resolve the same org for the pair.
    expect($this->repo->findForLocation($city->id, $sub->id)?->id)->toBe($gad->id);
});

it('findForLocation respects the category filter when provided', function (): void {
    $root = IncidentCategory::create([
        'name' => 'Infraestructura Vial',
        'parent_id' => null,
    ]);
    $otherRoot = IncidentCategory::create([
        'name' => 'Medio Ambiente',
        'parent_id' => null,
    ]);

    $province = Location::create(['name' => 'Pichincha', 'level' => 'province']);
    $city = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $gadVial = Organization::create([
        'name' => 'GAD Vial',
        'location_id' => $city->id,
        'incident_category_id' => $root->id,
    ]);
    Organization::create([
        'name' => 'GAD Ambiente',
        'location_id' => $city->id,
        'incident_category_id' => $otherRoot->id,
    ]);

    // Without a category the first org in id order wins (backward compat).
    expect($this->repo->findForLocation($city->id)?->id)->toBe($gadVial->id);
    // With a category that the first org does NOT cover, it must be skipped.
    expect($this->repo->findForLocation($city->id, $otherRoot->id)?->id)->not->toBe($gadVial->id);
});

it('findForLocation is deterministic and matches the first notified org (lowest id wins)', function (): void {
    $category = IncidentCategory::create([
        'name' => 'Infraestructura Vial',
        'parent_id' => null,
    ]);
    $otherCategory = IncidentCategory::create([
        'name' => 'Medio Ambiente',
        'parent_id' => null,
    ]);

    $province = Location::create(['name' => 'Pichincha', 'level' => 'province']);
    $city = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $firstOrg = Organization::create([
        'name' => 'GAD Vial Norte',
        'location_id' => $city->id,
        'incident_category_id' => $category->id,
    ]);
    $secondOrg = Organization::create([
        'name' => 'GAD Vial Sur',
        'location_id' => $city->id,
        'incident_category_id' => $category->id,
    ]);
    Organization::create([
        'name' => 'GAD Ambiente',
        'location_id' => $city->id,
        'incident_category_id' => $otherCategory->id,
    ]);

    // Both same-category orgs cover the (location, category) pair; the
    // LOWEST id must win every time, no matter the row read order.
    $found = $this->repo->findForLocation($city->id, $category->id);
    expect($found?->id)->toBe($firstOrg->id);
    expect($secondOrg->id)->toBeGreaterThan($firstOrg->id);

    // Shared selection rule: findForLocation IS the first org that
    // findNotifiedFor would notify — keeps the preview (is_claimable) and
    // the auto-assignment on submit consistent.
    $notified = $this->repo->findNotifiedFor($city->id, $category->id);
    expect($notified->first()?->id)->toBe($firstOrg->id);
    expect($found?->id)->toBe($notified->first()?->id);
});
