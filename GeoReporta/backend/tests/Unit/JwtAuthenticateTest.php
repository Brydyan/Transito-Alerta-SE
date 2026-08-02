<?php

declare(strict_types=1);

use App\Domains\Auth\Shared\Services\JwtService;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Sessions\Models\Session;
use App\Domains\Sessions\Repositories\SessionRepository;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function (): void {
    Role::firstOrCreate(['name' => 'Admin']);
});

function makeJwtRequest(?string $token = null): Request
{
    $server = [];

    if ($token !== null) {
        $server['HTTP_AUTHORIZATION'] = "Bearer {$token}";
    }

    return Request::create('/api/me', 'GET', [], [], [], $server);
}

it('rejects requests without an authorization header', function (): void {
    $middleware = new JwtAuthenticate(
        $this->mock(JwtService::class),
        $this->mock(SessionRepository::class),
    );

    $response = $middleware->handle(makeJwtRequest(), fn () => response()->json(['ok' => true]));

    expect($response->getStatusCode())->toBe(401);
});

it('rejects invalid access tokens', function (): void {
    $jwtService = $this->mock(JwtService::class);
    $jwtService->shouldReceive('validateAccessToken')
        ->once()
        ->with('invalid-token')
        ->andReturnNull();

    $middleware = new JwtAuthenticate(
        $jwtService,
        $this->mock(SessionRepository::class),
    );

    $response = $middleware->handle(makeJwtRequest('invalid-token'), fn () => response()->json(['ok' => true]));

    expect($response->getStatusCode())->toBe(401);
});

it('rejects tokens when the session cannot be found', function (): void {
    $user = User::factory()->create();

    $jwtService = $this->mock(JwtService::class);
    $jwtService->shouldReceive('validateAccessToken')
        ->once()
        ->andReturn([
            'sub' => (string) $user->id,
            'sid' => 'session-1',
            'email' => $user->email,
        ]);

    $sessionRepository = $this->mock(SessionRepository::class);
    $sessionRepository->shouldReceive('findById')
        ->once()
        ->with('session-1')
        ->andReturnNull();

    $middleware = new JwtAuthenticate($jwtService, $sessionRepository);

    $response = $middleware->handle(makeJwtRequest('signed-token'), fn () => response()->json(['ok' => true]));

    expect($response->getStatusCode())->toBe(401);
});

it('allows the request through when the token and session are valid', function (): void {
    $user = User::factory()->create();

    $jwtService = $this->mock(JwtService::class);
    $jwtService->shouldReceive('validateAccessToken')
        ->once()
        ->andReturn([
            'sub' => (string) $user->id,
            'sid' => 'session-2',
            'email' => $user->email,
        ]);

    $session = new Session([
        'id' => 'session-2',
        'user_id' => $user->id,
        'refresh_token_hash' => 'hash',
        'ip_address' => null,
        'user_agent' => null,
        'is_revoked' => false,
        'expires_at' => Carbon::now()->addHour(),
    ]);
    $session->exists = true;

    $sessionRepository = $this->mock(SessionRepository::class);
    $sessionRepository->shouldReceive('findById')
        ->once()
        ->with('session-2')
        ->andReturn($session);

    $middleware = new JwtAuthenticate($jwtService, $sessionRepository);

    $response = $middleware->handle(makeJwtRequest('signed-token'), function (Request $request) {
        return response()->json([
            'user_id' => $request->user()->id,
            '_session_id' => $request->input('_session_id'),
        ]);
    });

    $testResponse = TestResponse::fromBaseResponse($response);

    $testResponse->assertOk()
        ->assertJson([
            'user_id' => $user->id,
            '_session_id' => 'session-2',
        ]);
});

it('falls back to the access_token cookie when the Authorization header is absent', function (): void {
    $user = User::factory()->create();

    $jwtService = $this->mock(JwtService::class);
    $jwtService->shouldReceive('validateAccessToken')
        ->once()
        ->with('cookie-token')
        ->andReturn([
            'sub' => (string) $user->id,
            'sid' => 'session-3',
            'email' => $user->email,
        ]);

    $session = new Session([
        'id' => 'session-3',
        'user_id' => $user->id,
        'refresh_token_hash' => 'hash',
        'ip_address' => null,
        'user_agent' => null,
        'is_revoked' => false,
        'expires_at' => Carbon::now()->addHour(),
    ]);
    $session->exists = true;

    $sessionRepository = $this->mock(SessionRepository::class);
    $sessionRepository->shouldReceive('findById')
        ->once()
        ->with('session-3')
        ->andReturn($session);

    $middleware = new JwtAuthenticate($jwtService, $sessionRepository);

    $request = Request::create('/api/notifications/stream', 'GET', [], ['access_token' => 'cookie-token']);

    $response = $middleware->handle($request, function (Request $req) {
        return response()->json(['user_id' => $req->user()->id]);
    });

    $testResponse = TestResponse::fromBaseResponse($response);

    $testResponse->assertOk()->assertJson(['user_id' => $user->id]);
});
