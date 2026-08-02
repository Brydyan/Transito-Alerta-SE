<?php

declare(strict_types=1);

use App\Domains\Sessions\Models\Session;
use Carbon\Carbon;
use Tests\TestCase;

uses(TestCase::class);

it('marks active future sessions as valid', function (): void {
    $session = new Session([
        'id' => 'session-valid',
        'user_id' => 10,
        'refresh_token_hash' => 'hash',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'PHPUnit',
        'is_revoked' => false,
        'expires_at' => Carbon::now()->addHour(),
    ]);

    expect($session->isValid())->toBeTrue();
});

it('marks revoked or expired sessions as invalid', function (): void {
    $revoked = new Session([
        'id' => 'session-revoked',
        'user_id' => 10,
        'refresh_token_hash' => 'hash',
        'ip_address' => null,
        'user_agent' => null,
        'is_revoked' => true,
        'expires_at' => Carbon::now()->addHour(),
    ]);

    $expired = new Session([
        'id' => 'session-expired',
        'user_id' => 10,
        'refresh_token_hash' => 'hash',
        'ip_address' => null,
        'user_agent' => null,
        'is_revoked' => false,
        'expires_at' => Carbon::now()->subHour(),
    ]);

    expect($revoked->isValid())->toBeFalse();
    expect($expired->isValid())->toBeFalse();
});
