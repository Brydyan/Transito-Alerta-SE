<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Http\Requests\StoreAssignmentRequest;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Validation tests for StoreAssignmentRequest.
 *
 * Two layers are exercised:
 *
 *   - `rules()` — the validator contract published to clients. Built
 *     independently of HTTP for fast feedback and so we can pin each
 *     rule's behavior (presence, type, in-list, exists).
 *
 *   - `authorize()` — only authenticated users may create. The actual
 *     permission gate (`assignments.create`) is enforced at the
 *     controller layer; the FormRequest defensively returns true for
 *     any authenticated user so the controller's authorizeResource
 *     wiring takes precedence.
 *
 * Triangulation: each rule is tested with a happy-path input AND a
 * failing input — never relies on the absence of validation to assert
 * success.
 */
uses(TestCase::class, RefreshDatabase::class);

beforeEach(function (): void {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
    ]);

    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $category = IncidentCategory::create(['name' => 'Cat']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $reporter = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $reporter->id,
        'location_id' => $location->id,
        'title' => 'Test',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->targetUser = User::factory()->create();
});

// ---------------------------------------------------------------------------
// rules() contract
// ---------------------------------------------------------------------------

it('passes validation with a known user_id and the responsable role', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'user_id' => $this->targetUser->id,
        'role' => 'responsable',
    ], $request->rules());

    expect($validator->fails())->toBeFalse();
});

it('passes validation with the apoyo role', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'user_id' => $this->targetUser->id,
        'role' => 'apoyo',
    ], $request->rules());

    expect($validator->fails())->toBeFalse();
});

it('fails validation when user_id is missing', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'role' => 'responsable',
    ], $request->rules());

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('user_id'))->toBeTrue();
});

it('fails validation when user_id is not an integer', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'user_id' => 'not-an-int',
        'role' => 'apoyo',
    ], $request->rules());

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('user_id'))->toBeTrue();
});

it('fails validation when user_id does not exist in users table', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'user_id' => 999999,
        'role' => 'apoyo',
    ], $request->rules());

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('user_id'))->toBeTrue();
});

it('fails validation when role is missing', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'user_id' => $this->targetUser->id,
    ], $request->rules());

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('role'))->toBeTrue();
});

it('fails validation when role is not in {responsable, apoyo}', function (): void {
    $request = new StoreAssignmentRequest;

    $validator = Validator::make([
        'user_id' => $this->targetUser->id,
        'role' => 'supervisor',
    ], $request->rules());

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('role'))->toBeTrue();
});

// ---------------------------------------------------------------------------
// authorize() contract
// ---------------------------------------------------------------------------

it('authorize returns true for an authenticated user', function (): void {
    $user = User::factory()->create();

    // actingAs() wires up the Auth facade (`auth()->check()`) which is
    // what StoreAssignmentRequest::authorize() relies on. setUserResolver
    // alone is not enough — it only affects $request->user().
    $this->actingAs($user);

    $request = new StoreAssignmentRequest;

    expect($request->authorize())->toBeTrue();
});

it('authorize returns false when no user is authenticated', function (): void {
    // Log out from the test session so auth()->check() returns false.
    auth()->logout();

    $request = new StoreAssignmentRequest;

    expect($request->authorize())->toBeFalse();
});

// Smoke check — the FormRequest is a real FormRequest, not a plain DTO.
it('extends Illuminate FormRequest (real FormRequest)', function (): void {
    expect(is_subclass_of(StoreAssignmentRequest::class, FormRequest::class))->toBeTrue();
});
