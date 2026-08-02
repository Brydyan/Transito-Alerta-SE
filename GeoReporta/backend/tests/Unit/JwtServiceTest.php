<?php

declare(strict_types=1);

use App\Domains\Auth\Shared\Services\JwtService;
use Tests\TestCase;

uses(TestCase::class);

it('issues and validates access tokens', function (): void {
    $service = new JwtService;

    $token = $service->issueAccessToken('42', 'session-1', 'user@example.com');
    $claims = $service->validateAccessToken($token);

    expect($claims)->toMatchArray([
        'sub' => '42',
        'sid' => 'session-1',
        'email' => 'user@example.com',
    ]);
});

it('issues and validates refresh tokens with the refresh secret', function (): void {
    $service = new JwtService;

    $token = $service->issueRefreshToken('42', 'session-2', 'user@example.com');
    $claims = $service->validateRefreshToken($token);

    expect($claims)->toMatchArray([
        'sub' => '42',
        'sid' => 'session-2',
        'email' => 'user@example.com',
    ]);
});

it('rejects malformed tokens', function (): void {
    $service = new JwtService;

    expect($service->validateAccessToken('not-a-token'))->toBeNull();
    expect($service->validateRefreshToken('not-a-token'))->toBeNull();
});
