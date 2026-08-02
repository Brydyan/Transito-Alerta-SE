<?php

declare(strict_types=1);

use App\Domains\Invitations\Services\InvitationTokenGenerator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

uses(TestCase::class);

it('generate returns a plaintext token and a hash', function (): void {
    $generator = new InvitationTokenGenerator;

    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $generator->generate();

    // Plaintext must be a non-empty string
    expect($tokenPlain)->toBeString()->not->toBeEmpty();
    // Hash must be a non-empty string different from plaintext
    expect($tokenHash)->toBeString()->not->toBeEmpty();
    expect($tokenHash)->not->toEqual($tokenPlain);
});

it('generate returns a 64-character random token', function (): void {
    $generator = new InvitationTokenGenerator;

    ['tokenPlain' => $tokenPlain] = $generator->generate();

    expect(mb_strlen($tokenPlain))->toBe(64);
    // Must be alphanumeric (Str::random produces this)
    expect(ctype_alnum($tokenPlain))->toBeTrue();
});

it('the hash is verifiable with sha256', function (): void {
    $generator = new InvitationTokenGenerator;

    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $generator->generate();

    expect(hash('sha256', $tokenPlain))->toEqual($tokenHash);
});

it('two generate calls produce different tokens', function (): void {
    $generator = new InvitationTokenGenerator;

    ['tokenPlain' => $tokenPlain1] = $generator->generate();
    ['tokenPlain' => $tokenPlain2] = $generator->generate();

    expect($tokenPlain1)->not->toEqual($tokenPlain2);
});
