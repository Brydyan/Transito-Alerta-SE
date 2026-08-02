<?php

declare(strict_types=1);

it('returns the public app metadata', function (): void {
    $response = $this->getJson('/');

    $response->assertOk()
        ->assertExactJson([
            'app' => 'Sistema Incidencias API',
            'version' => '1.0',
        ]);
});

it('returns the health check payload', function (): void {
    $response = $this->getJson('/api/health');

    $response->assertOk()
        ->assertExactJson([
            'status' => 'ok',
        ]);
});
