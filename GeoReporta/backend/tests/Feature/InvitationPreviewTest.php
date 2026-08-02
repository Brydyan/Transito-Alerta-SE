<?php

declare(strict_types=1);

use App\Domains\Invitations\Models\UserInvitation;
use App\Domains\Invitations\Services\InvitationTokenGenerator;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    DB::table('roles')->insert(['id' => 1, 'name' => 'admin_sistema']);
});

/**
 * Story sc-130 / GitHub issue #109 — preview endpoint coverage.
 *
 * Contract under test:
 *   GET /api/invitations/{token}/preview
 *     200 → { status, organization, invitedBy, role, issuedAt, expiresAt, termsVersion }
 *           for valid pending tokens (NO PII: email, phone, id, user_id, etc.)
 *     404 → unknown token (InvitationNotFoundException → JSON via the
 *           RuntimeException render hook in bootstrap/app.php)
 *     410 → expired OR consumed token (InvitationGoneException → 410 JSON)
 *     Idempotent: 3 previews + 1 accept on the same token still consume cleanly.
 */
it('returns 200 with the preview payload for a valid pending token', function (): void {
    // Arrange: org + inviter + invited user.
    $location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $org = Organization::create(['name' => 'GAD Santa Elena', 'location_id' => $location->id]);

    $inviter = User::factory()->create([
        'first_name' => 'Ana',
        'last_name' => 'Pérez',
        'organization_id' => $org->id,
    ]);

    $invited = User::factory()->create([
        'email' => 'invitee@example.com',
        'organization_id' => $org->id,
    ]);

    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $invited->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->addHours(48),
        'terms_version' => 'v0',
        'invited_by_user_id' => $inviter->id,
    ]);

    // Act
    $response = $this->getJson("/api/invitations/{$tokenPlain}/preview");

    // Assert: payload shape
    $response->assertOk()
        ->assertJson([
            'status' => 'pending',
            'organization' => [
                'name' => 'GAD Santa Elena',
                'initials' => 'GS',
            ],
            'invitedBy' => [
                'name' => 'Ana Pérez',
                // role name is whatever the factory seeded — assert not null.
            ],
            'role' => 'admin_sistema',
            'termsVersion' => 'v0',
        ]);

    // Assert: NO PII leaks (the public preview must never expose internal ids,
    // contact info, or token material — the resource is the only seam that
    // can leak data, and we audit it explicitly).
    $body = $response->json();
    expect($body)->not->toHaveKey('email')
        ->and($body)->not->toHaveKey('phone')
        ->and($body)->not->toHaveKey('token')
        ->and($body)->not->toHaveKey('token_hash')
        ->and($body)->not->toHaveKey('tokenHash')
        ->and($body)->not->toHaveKey('id')
        ->and($body)->not->toHaveKey('user_id')
        ->and($body)->not->toHaveKey('invited_by_user_id')
        ->and($body)->not->toHaveKey('userId')
        ->and($body['organization'])->not->toHaveKey('id');

    // The invited user's email must never appear anywhere in the payload.
    expect(json_encode($body))->not->toContain('invitee@example.com');

    // The token plaintext must never appear in the payload.
    expect(json_encode($body))->not->toContain($tokenPlain);
});

it('returns 404 JSON for an unknown token', function (): void {
    $response = $this->getJson('/api/invitations/totally-fake-token-1234/preview');

    $response->assertNotFound()
        ->assertJsonStructure(['message']);
});

it('returns 410 JSON for an expired (not consumed) token', function (): void {
    $invited = User::factory()->create();
    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $invited->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->subHour(),
        'terms_version' => 'v0',
    ]);

    $response = $this->getJson("/api/invitations/{$tokenPlain}/preview");

    $response->assertStatus(410)
        ->assertJsonStructure(['message']);
});

it('returns 410 JSON for a consumed token', function (): void {
    $invited = User::factory()->create();
    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $invited->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->addHours(48),
        'accepted_at' => now()->subMinute(),
        'terms_version' => 'v0',
    ]);

    $response = $this->getJson("/api/invitations/{$tokenPlain}/preview");

    $response->assertStatus(410)
        ->assertJsonStructure(['message']);
});

it('is idempotent across repeated previews: 3 calls + 1 accept still consumes cleanly', function (): void {
    $invited = User::factory()->create();
    $tokenGen = app(InvitationTokenGenerator::class);
    ['tokenPlain' => $tokenPlain, 'tokenHash' => $tokenHash] = $tokenGen->generate();

    UserInvitation::create([
        'user_id' => $invited->id,
        'token_hash' => $tokenHash,
        'expires_at' => now()->addHours(48),
        'terms_version' => 'v0',
    ]);

    // 3 preview calls — none should mutate state.
    for ($i = 0; $i < 3; $i++) {
        $this->getJson("/api/invitations/{$tokenPlain}/preview")
            ->assertOk()
            ->assertJson(['status' => 'pending']);
    }

    expect(UserInvitation::where('user_id', $invited->id)->value('accepted_at'))
        ->toBeNull();

    // Now consume the token.
    $accept = $this->postJson('/api/invitations/accept', [
        'token' => $tokenPlain,
        'password' => 'ValidPass1',
        'password_confirmation' => 'ValidPass1',
        'accept_terms' => true,
        'terms_version' => 'v0',
    ]);

    $accept->assertOk()
        ->assertJson(['message' => 'Cuenta activada']);

    // A subsequent preview must report 410 (consumed).
    $this->getJson("/api/invitations/{$tokenPlain}/preview")
        ->assertStatus(410);
});
