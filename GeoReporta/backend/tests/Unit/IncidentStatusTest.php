<?php

declare(strict_types=1);

use App\Domains\Incidents\Enums\IncidentStatus;

/**
 * The enum is the single source of truth for incident statuses. The
 * `frontendKey()` and `label()` accessors are consumed by
 * `incidents:generate-frontend-constants` to emit the generated JS map,
 * so the assertions here double as the contract.
 */
it('exposes frontendKey() equal to its backed value', function (IncidentStatus $status): void {
    expect($status->frontendKey())->toBe($status->value);
})->with(
    array_map(
        fn (IncidentStatus $case) => $case,
        IncidentStatus::cases(),
    ),
);

it('returns the canonical Spanish label for every case', function (IncidentStatus $status, string $expected): void {
    expect($status->label())->toBe($expected);
})->with([
    'pending' => [IncidentStatus::Pending, 'Pendiente'],
    'in_progress' => [IncidentStatus::InProgress, 'En proceso'],
    'resolved' => [IncidentStatus::Resolved, 'Resuelto'],
    'closed' => [IncidentStatus::Closed, 'Cerrada'],
]);

it('keeps every case represented exactly once', function (): void {
    $keys = array_map(fn (IncidentStatus $case) => $case->frontendKey(), IncidentStatus::cases());
    expect($keys)->toEqualCanonicalizing(array_unique($keys));
    expect(count($keys))->toBe(count(IncidentStatus::cases()));
});

it('uses every case in the label map roundtrip', function (): void {
    $labels = [];
    foreach (IncidentStatus::cases() as $case) {
        $labels[$case->frontendKey()] = $case->label();
    }
    expect($labels)->toEqualCanonicalizing([
        'pending' => 'Pendiente',
        'in_progress' => 'En proceso',
        'resolved' => 'Resuelto',
        'closed' => 'Cerrada',
    ]);
});

it('includes closed case with correct value and label', function (): void {
    expect(IncidentStatus::Closed->value)->toBe('closed')
        ->and(IncidentStatus::Closed->label())->toBe('Cerrada')
        ->and(IncidentStatus::Closed->frontendKey())->toBe('closed');
});
