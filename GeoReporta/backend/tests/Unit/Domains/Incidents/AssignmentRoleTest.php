<?php

declare(strict_types=1);

use App\Domains\Incidents\Enums\AssignmentRole;

/**
 * AssignmentRole is the single source of truth for the two valid
 * assignment roles (responsable | apoyo). The `values()` helper returns
 * the plain string values so callers (the request validator in PR #2 and
 * DB::table lookups in AssignmentService) can zero-fill aggregates and
 * validation rule definitions without reaching into each case.
 *
 * These tests are the contract for the enum used by the assignments
 * sub-resource introduced in the historial-asignacion-operadores change.
 */
it('exposes exactly the two roles for the assignment module', function (): void {
    expect(AssignmentRole::cases())->toHaveCount(2);

    $names = array_map(fn (AssignmentRole $case) => $case->name, AssignmentRole::cases());

    expect($names)->toContain('Responsable');
    expect($names)->toContain('Apoyo');
});

it('maps each case to its Spanish snake-case value', function (): void {
    expect(AssignmentRole::Responsable->value)->toBe('responsable');
    expect(AssignmentRole::Apoyo->value)->toBe('apoyo');
});

it('returns the canonical list of values in declaration order', function (): void {
    // values() is consumed by `Rule::in(AssignmentRole::values())` in
    // PR #2's StoreAssignmentRequest, so the order MUST match
    // AssignmentRole::cases() for debuggability and predictable
    // diffs when a new role is added.
    expect(AssignmentRole::values())->toBe(['responsable', 'apoyo']);
});

it('rejects any string outside the declared role set', function (): void {
    $declared = AssignmentRole::values();

    // Triangulation: the enum guards every store-side path against
    // malformed inputs. A typo or new role added without updating the
    // seeder/service will surface here as a missing string.
    expect($declared)->not->toContain('admin');
    expect($declared)->not->toContain('');
    expect(in_array('RESPONSABLE', $declared, true))->toBeFalse();
});

it('looks up a case from its raw value', function (): void {
    // AssignmentService receives the raw string from the request and
    // must be able to recover the enum case by value. The try/tryFrom
    // pair covers both happy and unknown-value paths without surfacing
    // a ValueError to the caller.
    expect(AssignmentRole::from('responsable'))->toBe(AssignmentRole::Responsable);
    expect(AssignmentRole::from('apoyo'))->toBe(AssignmentRole::Apoyo);
    expect(AssignmentRole::tryFrom('unknown'))->toBeNull();
});
