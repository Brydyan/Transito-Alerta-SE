<?php

declare(strict_types=1);

use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;

it('returns available statuses from IncidentStatus enum as plain array', function (): void {
    $this->withoutMiddleware(JwtAuthenticate::class);

    $response = $this->getJson('/api/estados');

    $response->assertOk();

    // Should be a plain array, not wrapped in {"data": [...]}
    $data = $response->json();
    expect($data)->toBeArray()
        ->and($data)->not->toHaveKey('data');

    // Should contain defined statuses
    expect(count($data))->toBe(4);

    // Verify structure and values
    expect($data[0])->toMatchArray(['id' => 1, 'nombre' => 'Pendiente', 'valor' => 'pending']);
    expect($data[1])->toMatchArray(['id' => 2, 'nombre' => 'En proceso', 'valor' => 'in_progress']);
    expect($data[2])->toMatchArray(['id' => 3, 'nombre' => 'Resuelto', 'valor' => 'resolved']);
    expect($data[3])->toMatchArray(['id' => 4, 'nombre' => 'Cerrada', 'valor' => 'closed']);
});
