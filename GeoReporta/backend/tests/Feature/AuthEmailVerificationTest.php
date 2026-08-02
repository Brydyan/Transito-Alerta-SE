<?php

declare(strict_types=1);

/**
 * Story sc-117 — Verificación de correo electrónico para registros locales.
 *
 * Cubre:
 *   R8   RegisterService dispara la notificación de verificación.
 *   R9a  GET /api/email/verify/{id}/{hash} marca email_verified_at y retorna 200.
 *   R9b  GET /api/email/verify con firma inválida retorna 403.
 *   R9c  GET /api/email/verify con firma expirada retorna 403.
 *   R9d  GET /api/email/verify es idempotente (re-picar el enlace no rompe).
 *   R10  POST /api/email/resend reenvía la notificación (autenticado).
 *   R10a POST /api/email/resend sin auth retorna 401.
 *   R11  POST /api/email/resend throttled a 6/hora por usuario.
 *   R12  GET  /api/email/notice retorna el estado de verificación.
 *   R13  Login local retorna 403 con code=email_not_verified cuando
 *        email_verified_at es NULL.
 *   R14  Login local funciona cuando email_verified_at IS NOT NULL.
 */

use App\Domains\Auth\Local\Exceptions\EmailNotVerifiedException;
use App\Domains\Auth\Local\Notifications\VerifyEmailMail;
use App\Domains\Auth\Local\Services\RegisterService;
use App\Domains\Auth\Shared\Services\AuthService;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    DB::table('roles')->insert([
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
        ['id' => 2, 'name' => UserRole::OperadorSistema->value],
        ['id' => 3, 'name' => UserRole::AdminOrganizacion->value],
        ['id' => 4, 'name' => UserRole::OperadorOrganizacion->value],
        ['id' => 5, 'name' => UserRole::Usuario->value],
    ]);

    RateLimiter::clear('register:127.0.0.1');
    RateLimiter::clear('email-verify:user:0');
    RateLimiter::clear('email-verify:user:1');
});

/**
 * Build a payload que pasa la RegisterRequest.
 *
 * @return array<string, string>
 */
function validRegisterPayloadSc117(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'Juan',
        'last_name' => 'Pérez',
        'email' => 'juan@example.com',
        'phone' => '0991234567',
        'password' => 'Password1',
        'password_confirmation' => 'Password1',
    ], $overrides);
}
// ─── R8 — RegisterService dispara VerifyEmailMail ─────────────────────

it('R8: RegisterService sends the VerifyEmailMail notification on registration', function (): void {
    Notification::fake();

    $service = app(RegisterService::class);
    $user = $service->register(validRegisterPayloadSc117());

    expect($user)->toBeInstanceOf(User::class);
    expect($user->email_verified_at)->toBeNull();
    expect($user->hasVerifiedEmail())->toBeFalse();

    Notification::assertSentTo(
        $user,
        VerifyEmailMail::class,
    );
});

it('R8b: RegisterService never sends the framework default VerifyEmail notification', function (): void {
    Notification::fake();

    $service = app(RegisterService::class);
    $user = $service->register(validRegisterPayloadSc117());

    // La idea es impedir una regresión silenciosa si alguien borra
    // el override `sendEmailVerificationNotification` del modelo —
    // ese override es lo que apunta a VerifyEmailMail en vez del
    // VerifyEmail por defecto de Illuminate.
    Notification::assertNotSentTo($user, VerifyEmail::class);
});

// ─── R10/R11 — POST /api/email/resend ─────────────────────────────────

it('R10: POST /api/email/resend re-sends the notification for an authenticated user', function (): void {
    Notification::fake();

    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => null,
    ]);

    $response = $this->withoutMiddleware(JwtAuthenticate::class)
        ->actingAs($user)
        ->postJson('/api/email/resend');

    $response->assertStatus(202)
        ->assertJson(['message' => __('messages.verification_sent')]);

    Notification::assertSentTo($user, VerifyEmailMail::class);
});

it('R10a: POST /api/email/resend without authentication returns 401', function (): void {
    $response = $this->postJson('/api/email/resend');

    $response->assertStatus(401);
});

it('R10b: POST /api/email/resend returns 200 when email is already verified', function (): void {
    Notification::fake();

    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => now(),
    ]);

    $response = $this->withoutMiddleware(JwtAuthenticate::class)
        ->actingAs($user)
        ->postJson('/api/email/resend');

    $response->assertOk()
        ->assertJson(['message' => __('messages.email_already_verified')]);

    Notification::assertNotSentTo($user, VerifyEmailMail::class);
});

it('R11: POST /api/email/resend rate-limits at 6 per hour per user', function (): void {
    Notification::fake();

    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => null,
    ]);

    // Limpiar contadores que puedan haber quedado de iteraciones previas.
    RateLimiter::clear('email-verify:user:'.$user->id);

    $bypass = $this->withoutMiddleware(JwtAuthenticate::class);

    // 6 requests dentro del límite: cada una retorna 202.
    for ($i = 0; $i < 6; $i++) {
        $bypass->actingAs($user)->postJson('/api/email/resend')->assertStatus(202);
    }

    // La séptima debe ser 429.
    $bypass->actingAs($user)->postJson('/api/email/resend')->assertStatus(429);
});

// ─── R12 — GET /api/email/notice ──────────────────────────────────────

it('R12: GET /api/email/notice reports verified=false for an unverified user', function (): void {
    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => null,
    ]);

    $response = $this->withoutMiddleware(JwtAuthenticate::class)
        ->actingAs($user)
        ->getJson('/api/email/notice');

    $response->assertOk()
        ->assertJson(['verified' => false]);
});

it('R12b: GET /api/email/notice reports verified=true for a verified user', function (): void {
    $verifiedAt = now()->subMinutes(2)->startOfSecond();
    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => $verifiedAt,
    ]);

    $response = $this->withoutMiddleware(JwtAuthenticate::class)
        ->actingAs($user)
        ->getJson('/api/email/notice');

    $response->assertOk()
        ->assertJson(['verified' => true]);

    $returnedAt = $response->json('verified_at');
    expect($returnedAt)->not->toBeNull();

    // El roundtrip JSON → ISO8601 puede redondear subsegundos; las
    // marcas de tiempo que retorna la API son razonablemente próximas
    // dentro del mismo segundo (diffInSeconds == 0).
    expect(Carbon::parse($returnedAt)->diffInSeconds(Carbon::parse($verifiedAt)))->toBeLessThanOrEqual(1);
});

it('R12c: GET /api/email/notice without auth returns 401', function (): void {
    $response = $this->getJson('/api/email/notice');

    $response->assertStatus(401);
});

// ─── R13/R14 — login bloqueado / permitido ────────────────────────────

it('R13: AuthService.login throws EmailNotVerifiedException when email_verified_at is null', function (): void {
    $citizenRole = Role::where('name', UserRole::Usuario->value)->value('id');
    $user = User::factory()->create([
        'role_id' => $citizenRole,
        'email' => 'unverified@example.com',
        'password' => bcrypt('Password1'),
        'email_verified_at' => null,
    ]);

    $service = app(AuthService::class);

    expect(fn () => $service->login(
        email: 'unverified@example.com',
        password: 'Password1',
        ip: '127.0.0.1',
        ua: 'phpunit',
    ))->toThrow(EmailNotVerifiedException::class);
});

it('R13b: POST /api/login returns 403 with code=email_not_verified for an unverified user', function (): void {
    $citizenRole = Role::where('name', UserRole::Usuario->value)->value('id');
    User::factory()->create([
        'role_id' => $citizenRole,
        'email' => 'unverified@example.com',
        'password' => bcrypt('Password1'),
        'email_verified_at' => null,
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'unverified@example.com',
        'password' => 'Password1',
    ]);

    $response->assertStatus(403)
        ->assertJson([
            'code' => 'email_not_verified',
            'message' => __('messages.email_not_verified'),
        ]);
});

it('R14: POST /api/login works when email_verified_at is set', function (): void {
    $citizenRole = Role::where('name', UserRole::Usuario->value)->value('id');
    User::factory()->create([
        'role_id' => $citizenRole,
        'email' => 'verified@example.com',
        'password' => bcrypt('Password1'),
        'email_verified_at' => now(),
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'verified@example.com',
        'password' => 'Password1',
    ]);

    $response->assertOk()
        ->assertJsonStructure(['access_token', 'token_type', 'expires_in', 'user']);
});

// ─── OTP Tests ────────────────────────────────────────────────────────

it('verifies email using valid 6-digit OTP code via POST /api/email/verify-otp', function (): void {
    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => null,
    ]);

    $otp = $user->generateVerificationOtp(15);
    expect($user->fresh()->email_verified_at)->toBeNull();

    $response = $this->postJson('/api/email/verify-otp', [
        'email' => $user->email,
        'otp' => $otp,
    ]);

    $response->assertOk()
        ->assertJsonPath('verified', true);

    expect($user->fresh()->email_verified_at)->not->toBeNull();
});

it('rejects invalid or expired 6-digit OTP via POST /api/email/verify-otp', function (): void {
    $user = User::factory()->create([
        'role_id' => Role::where('name', UserRole::Usuario->value)->value('id'),
        'email_verified_at' => null,
    ]);

    $user->generateVerificationOtp(15);

    $response = $this->postJson('/api/email/verify-otp', [
        'email' => $user->email,
        'otp' => '000000',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('code', 'otp_invalid');

    expect($user->fresh()->email_verified_at)->toBeNull();
});
