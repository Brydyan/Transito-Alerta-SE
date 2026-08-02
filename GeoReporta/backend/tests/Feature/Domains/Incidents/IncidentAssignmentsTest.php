<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
        ['id' => 4, 'name' => 'operador_organizacion'],
    ]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);
    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $org->id,
    ]);

    $this->user1 = User::factory()->create([
        'role_id' => 4,
        'organization_id' => $org->id,
    ]);
    $this->user2 = User::factory()->create([
        'role_id' => 4,
        'organization_id' => $org->id,
    ]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $category->id,
        'user_id' => $this->user1->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

it('has assignments table with correct schema', function (): void {
    expect(Schema::hasTable('assignments'))->toBeTrue();
    expect(Schema::hasColumns('assignments', [
        'id', 'incident_id', 'user_id', 'assignment_role', 'created_at', 'updated_at',
    ]))->toBeTrue();
});

it('has unique constraint on incident_id and user_id', function (): void {
    DB::table('assignments')->insert([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user1->id,
        'assignment_role' => 'responsable',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(fn () => DB::table('assignments')->insert([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user1->id,
        'assignment_role' => 'apoyo',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});

it('has check constraint on assignment_role', function (): void {
    DB::table('assignments')->insert([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user1->id,
        'assignment_role' => 'responsable',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('assignments')->insert([
        'incident_id' => $this->incident->id,
        'user_id' => $this->user2->id,
        'assignment_role' => 'apoyo',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $user3 = User::factory()->create();
    expect(fn () => DB::table('assignments')->insert([
        'incident_id' => $this->incident->id,
        'user_id' => $user3->id,
        'assignment_role' => 'invalid_role',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});

it('implements assignedUsers relationship on Incident model', function (): void {
    $this->incident->assignedUsers()->attach($this->user1->id, ['assignment_role' => 'responsable']);
    $this->incident->assignedUsers()->attach($this->user2->id, ['assignment_role' => 'apoyo']);

    expect($this->incident->assignedUsers)->toHaveLength(2);

    $assigned1 = $this->incident->assignedUsers()->where('user_id', $this->user1->id)->first();
    expect($assigned1->pivot->assignment_role)->toBe('responsable');

    $assigned2 = $this->incident->assignedUsers()->where('user_id', $this->user2->id)->first();
    expect($assigned2->pivot->assignment_role)->toBe('apoyo');
});
