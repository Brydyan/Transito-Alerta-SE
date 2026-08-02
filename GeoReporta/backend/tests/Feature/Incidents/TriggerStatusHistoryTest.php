<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

// CP-02-06-B: Trigger automático que genera registro de historial
// Descripción: Cambiar estado de incidencia vía SQL directo.
// Criterio: Nuevo registro insertado en status_history con todos los campos requeridos.
//
// The trigger only exists on PostgreSQL; `composer test` runs
// exclusively against Postgres (backend-tests-postgres-migration, issue
// #197), so every scenario here always executes for real, no driver
// check needed.

beforeEach(function (): void {
    // insertOrIgnore with pinned id to ensure consistent FK target.
    // Role::firstOrCreate() relies on nextval(), which does NOT reliably land
    // on 1 — PostgreSQL sequences are not rolled back between tests (see
    // RoleSeederTest / backend-tests-postgres-migration, issue #197).
    DB::table('roles')->insertOrIgnore(['id' => 1, 'name' => 'Admin']);

    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $category = IncidentCategory::create(['name' => 'Test Category']);

    $this->reporter = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'user_id' => $this->reporter->id,
        'location_id' => $location->id,
        'title' => 'Incidencia CP-02-06-B',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
});

it('CP-02-06-B: trigger inserta registro en status_history al cambiar estado por SQL directo', function (): void {
    DB::table('incidents')
        ->where('id', $this->incident->id)
        ->update(['status' => Incident::STATUS_IN_PROGRESS]);

    $record = DB::table('status_history')
        ->where('incident_id', $this->incident->id)
        ->latest('created_at')
        ->first();

    expect($record)->not->toBeNull();
    expect($record->incident_id)->toBe($this->incident->id);
    expect($record->previous_status)->toBe(Incident::STATUS_PENDING);
    expect($record->new_status)->toBe(Incident::STATUS_IN_PROGRESS);
    expect($record->user_id)->not->toBeNull();
    expect($record->created_at)->not->toBeNull();
});

it('CP-02-06-B: el trigger cae back a user_id del incidente cuando no hay actor autenticado', function (): void {
    // Sin actingAs() ni set_config → usa COALESCE(NEW.user_id, OLD.user_id)
    DB::table('incidents')
        ->where('id', $this->incident->id)
        ->update(['status' => Incident::STATUS_IN_PROGRESS]);

    $record = DB::table('status_history')
        ->where('incident_id', $this->incident->id)
        ->latest('created_at')
        ->first();

    expect($record->user_id)->toBe($this->reporter->id);
});

it('CP-02-06-B: el trigger no inserta registro si el status no cambia', function (): void {
    DB::table('incidents')
        ->where('id', $this->incident->id)
        ->update(['status' => Incident::STATUS_PENDING]); // mismo status

    $count = DB::table('status_history')
        ->where('incident_id', $this->incident->id)
        ->count();

    expect($count)->toBe(0);
});

it('CP-02-06-B: el trigger registra created_at con timestamp válido reciente', function (): void {
    $before = now()->subSecond();

    DB::table('incidents')
        ->where('id', $this->incident->id)
        ->update(['status' => Incident::STATUS_IN_PROGRESS]);

    $record = DB::table('status_history')
        ->where('incident_id', $this->incident->id)
        ->latest('created_at')
        ->first();

    $timestamp = Carbon::parse($record->created_at);

    expect($timestamp->greaterThanOrEqualTo($before))->toBeTrue();
    expect($timestamp->lessThanOrEqualTo(now()->addSecond()))->toBeTrue();
});
