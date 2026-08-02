<?php

declare(strict_types=1);

use App\Domains\Incidents\Enums\AssignmentRole;
use App\Domains\Incidents\Http\Resources\AssignmentResource;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Users\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\MissingValue;

/**
 * Tests for AssignmentResource — the JSON shape the front-end tab in
 * PR #3 will consume.
 *
 * Three behaviours are pinned:
 *   1. The five scalar fields are exposed (`id`, `incident_id`,
 *      `user_id`, `role`, timestamps).
 *   2. The `role` field is exposed under its API name even though the
 *      column is `assignment_role` (column rename at the resource
 *      boundary so the API is decoupled from the schema).
 *   3. The `user` payload is only included when the relation has been
 *      eager-loaded (`whenLoaded`) — never a follow-up query.
 */
it('exposes the canonical assignment shape', function (): void {
    $user = new User(['id' => 7, 'first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.com']);

    $assignment = new Assignment;
    $assignment->setRawAttributes([
        'id' => 42,
        'incident_id' => 11,
        'user_id' => 7,
        'assignment_role' => AssignmentRole::Responsable->value,
        'created_at' => null,
        'updated_at' => null,
    ]);
    $assignment->setRelation('user', $user);

    $payload = (new AssignmentResource($assignment))->toArray(new Request);

    // Spot-check each key — `user` is asserted separately below
    // because JsonResource::whenLoaded returns the relation instance
    // (not its serialized form) which is fine for the contract test.
    expect($payload['id'])->toBe(42)
        ->and($payload['incident_id'])->toBe(11)
        ->and($payload['user_id'])->toBe(7)
        ->and($payload['role'])->toBe('responsable')
        ->and($payload)->toHaveKey('user')
        ->and($payload)->toHaveKey('created_at')
        ->and($payload)->toHaveKey('updated_at');
});

it('omits the user payload when the relation is not loaded', function (): void {
    $assignment = new Assignment;
    $assignment->setRawAttributes([
        'id' => 1,
        'incident_id' => 2,
        'user_id' => 3,
        'assignment_role' => AssignmentRole::Apoyo->value,
    ]);

    // Sanity: the relation must NOT be marked loaded before serialization.
    expect($assignment->relationLoaded('user'))->toBeFalse();

    $payload = (new AssignmentResource($assignment))->toArray(new Request);

    // `whenLoaded()` returns Laravel's `MissingValue` sentinel when
    // the relation is unloaded — JsonResource strips it during
    // HTTP serialization so the wire format omits the key. We assert
    // against the sentinel directly because it is the canonical
    // proof that no follow-up query will be issued: a future
    // refactor that swapped `whenLoaded` for a plain `null` would
    // still produce a happy-looking `toArray()` but force the
    // front-end to handle a missing-key / null distinction.
    expect($payload['user'])->toBeInstanceOf(MissingValue::class)
        ->and($payload['role'])->toBe('apoyo');
});

it('exposes the role key (not the DB column assignment_role)', function (): void {
    $assignment = new Assignment;
    $assignment->setRawAttributes([
        'id' => 1,
        'incident_id' => 2,
        'user_id' => 3,
        'assignment_role' => 'responsable',
    ]);

    $payload = (new AssignmentResource($assignment))->toArray(new Request);

    // The API contract is `role` — the resource must NOT leak the
    // raw DB column name (`assignment_role`) to clients.
    expect($payload)->toHaveKey('role')
        ->and($payload)->not->toHaveKey('assignment_role');
});

it('casts integer-typed ids in the output', function (): void {
    $assignment = new Assignment;
    $assignment->setRawAttributes([
        'id' => 9,
        'incident_id' => 4,
        'user_id' => 12,
        'assignment_role' => 'apoyo',
    ]);

    $payload = (new AssignmentResource($assignment))->toArray(new Request);

    expect($payload['id'])->toBe(9)
        ->and($payload['incident_id'])->toBe(4)
        ->and($payload['user_id'])->toBe(12);
});
