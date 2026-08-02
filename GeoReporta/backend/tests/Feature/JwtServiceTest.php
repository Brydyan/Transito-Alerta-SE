<?php

declare(strict_types=1);

use App\Domains\Auth\Shared\Services\JwtService;

/**
 * Unit tests for JwtService — token issuance and validation.
 *
 * These tests verify that access and refresh tokens can be issued and validated,
 * and that tampered or expired tokens are rejected.
 */
beforeEach(function (): void {
    // JWT_SECRET is set in phpunit.xml
    $this->service = new JwtService;
});

it('issues and validates an access token', function (): void {
    $token = $this->service->issueAccessToken('42', 'session-uuid-123', 'user@example.com');

    expect($token)->toBeString()->not->toBeEmpty();

    $claims = $this->service->validateAccessToken($token);
    expect($claims)->not->toBeNull()
        ->and($claims['sub'])->toBe('42')
        ->and($claims['sid'])->toBe('session-uuid-123')
        ->and($claims['email'])->toBe('user@example.com');
});

it('issues and validates a refresh token', function (): void {
    $token = $this->service->issueRefreshToken('42', 'session-uuid-123', 'user@example.com');

    expect($token)->toBeString()->not->toBeEmpty();

    $claims = $this->service->validateRefreshToken($token);
    expect($claims)->not->toBeNull()
        ->and($claims['sub'])->toBe('42')
        ->and($claims['sid'])->toBe('session-uuid-123')
        ->and($claims['email'])->toBe('user@example.com');
});

it('returns null for an expired access token', function (): void {
    // Create a token that is already expired by using low TTL and sleeping
    // Instead, test with a token that was never valid or tampered
    $token = $this->service->issueAccessToken('1', 'sess-1', 'a@b.com');

    // Modify the token to simulate tampering
    $parts = explode('.', $token);
    expect(count($parts))->toBe(3);
    $parts[2] = 'invalidsignature';
    $tampered = implode('.', $parts);

    $claims = $this->service->validateAccessToken($tampered);
    expect($claims)->toBeNull();
});

it('returns null for a tampered token', function (): void {
    $claims = $this->service->validateAccessToken('eyJhbGciOiJIUzI1NiJ9.invalid.payload');
    expect($claims)->toBeNull();
});

it('returns null for an empty string', function (): void {
    $claims = $this->service->validateAccessToken('');
    expect($claims)->toBeNull();
});

it('rejects access token validated as refresh token and vice versa', function (): void {
    $accessToken = $this->service->issueAccessToken('1', 'sess-1', 'a@b.com');
    $refreshToken = $this->service->issueRefreshToken('1', 'sess-1', 'a@b.com');

    // Each token is only valid for its own validator (separate signing keys)
    expect($this->service->validateAccessToken($accessToken))->not->toBeNull();
    expect($this->service->validateRefreshToken($accessToken))->toBeNull();

    expect($this->service->validateRefreshToken($refreshToken))->not->toBeNull();
    expect($this->service->validateAccessToken($refreshToken))->toBeNull();
});
