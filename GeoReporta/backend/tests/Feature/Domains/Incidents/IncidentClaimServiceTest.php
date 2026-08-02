<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Repositories\EloquentIncidentRepository;
use App\Domains\Incidents\Services\IncidentClaimService;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // 1. Roles
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'Admin'],
        ['id' => 2, 'name' => 'operador_organizacion'],
    ]);

    // 2. Locations
    $location = Location::create(['name' => 'Test City', 'level' => 'city']);

    // 3. Categories — first create a placeholder org for the FK
    $placeholderOrg = Organization::create([
        'name' => 'Placeholder Org',
        'location_id' => $location->id,
        'max_active_claims' => 5,
    ]);
    $this->category = IncidentCategory::create([
        'name' => 'Test Category',
        'organization_id' => $placeholderOrg->id,
    ]);

    // 4. Organizations
    $this->orgA = Organization::create([
        'name' => 'Org A',
        'location_id' => $location->id,
        'max_active_claims' => 5,
    ]);
    $this->orgB = Organization::create([
        'name' => 'Org B',
        'location_id' => $location->id,
        'max_active_claims' => 5,
    ]);
    $this->orgLimited = Organization::create([
        'name' => 'Org Limited',
        'location_id' => $location->id,
        'max_active_claims' => 0,
    ]);

    // 5. Users
    $this->operatorA = User::factory()->create([
        'role_id' => 2,
        'organization_id' => $this->orgA->id,
    ]);
    $this->operatorB = User::factory()->create([
        'role_id' => 2,
        'organization_id' => $this->orgB->id,
    ]);
    $this->operatorLimited = User::factory()->create([
        'role_id' => 2,
        'organization_id' => $this->orgLimited->id,
    ]);
    $reporter = User::factory()->create();

    // 6. Incidents
    $this->incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $reporter->id,
        'location_id' => $location->id,
        'title' => 'Available incident in Org A',
        'status' => 'pending',
        'priority' => 'medium',
        'organization_id' => $this->orgA->id,
    ]);

    // Incident in limited org for max_active_claims test
    $this->incidentLimited = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $reporter->id,
        'location_id' => $location->id,
        'title' => 'Available incident in Org Limited',
        'status' => 'pending',
        'priority' => 'medium',
        'organization_id' => $this->orgLimited->id,
    ]);

    // 7. Service
    $this->service = new IncidentClaimService(new EloquentIncidentRepository);
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-01: Claim exitoso
// ──────────────────────────────────────────────────────────────

it('allows an operator to claim an unassigned incident of their org', function (): void {
    $result = $this->service->claim($this->incident->id, $this->operatorA);

    expect($result->claimed_by)->toBe($this->operatorA->id);
    expect($result->claimed_at)->not->toBeNull();
    expect($result->status->value)->toBe('in_progress');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-01: Claim de incidencia ya asignada → 409
// ──────────────────────────────────────────────────────────────

it('throws 409 when claiming an already assigned incident', function (): void {
    $this->service->claim($this->incident->id, $this->operatorA);

    expect(fn () => $this->service->claim($this->incident->id, $this->operatorA))
        ->toThrow(RuntimeException::class, 'ya está asignada');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-01: Claim de incidencia de otra org → 403
// ──────────────────────────────────────────────────────────────

it('throws 403 when claiming an incident from another organization', function (): void {
    expect(fn () => $this->service->claim($this->incident->id, $this->operatorB))
        ->toThrow(RuntimeException::class, 'No pertenece a tu organización');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-02: Release exitoso
// ──────────────────────────────────────────────────────────────

it('allows an operator to release their own claimed incident', function (): void {
    $this->service->claim($this->incident->id, $this->operatorA);

    $result = $this->service->release($this->incident->id, $this->operatorA);

    expect($result->claimed_by)->toBeNull();
    expect($result->claimed_at)->toBeNull();
    expect($result->status->value)->toBe('pending');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-02: Release de incidencia no propia → 403
// ──────────────────────────────────────────────────────────────

it('throws 403 when releasing an incident claimed by another operator', function (): void {
    $this->service->claim($this->incident->id, $this->operatorA);

    expect(fn () => $this->service->release($this->incident->id, $this->operatorB))
        ->toThrow(RuntimeException::class, 'No sos el dueño de este claim');
});

// ──────────────────────────────────────────────────────────────
// REQ-CLM-03: Límite de claims excedido → 429
// ──────────────────────────────────────────────────────────────

it('throws 429 when operator exceeds max_active_claims limit', function (): void {
    // orgLimited has max_active_claims = 0
    expect(fn () => $this->service->claim($this->incidentLimited->id, $this->operatorLimited))
        ->toThrow(RuntimeException::class, 'límite máximo de claims activos');
});
