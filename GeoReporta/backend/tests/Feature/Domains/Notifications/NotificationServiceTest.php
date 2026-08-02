<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Jobs\SendIncidentNotificationJob;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Notifications\Services\NotificationService;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
    ]);

    $this->user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $category->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

it('publishes a JSON payload to the user\'s Redis Pub/Sub channel when a notification is created', function (): void {
    Redis::shouldReceive('publish')
        ->once()
        ->withArgs(function (string $channel, string $payload): bool {
            expect($channel)->toBe(NotificationService::topicFor($this->user->id));
            expect($channel)->toBe("user:{$this->user->id}:notifications");
            expect($payload)->toContain('Nueva notificación de prueba');
            // Payload must be valid JSON (Laravel serializes via NotificationResource).
            $decoded = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
            expect($decoded)->toBeArray();
            expect($decoded)->toHaveKey('id');

            return true;
        });

    $service = app(NotificationService::class);
    $notification = $service->notify(
        $this->user,
        NotificationType::Legacy,
        'Nueva notificación de prueba',
        $this->incident->id,
    );

    expect($notification)->not->toBeNull();
    expect(Notification::count())->toBe(1);
});

it('still creates the notification even if Redis publish fails', function (): void {
    Redis::shouldReceive('publish')
        ->once()
        ->andThrow(new RuntimeException('redis pub/sub unreachable'));

    $service = app(NotificationService::class);
    $notification = $service->notify(
        $this->user,
        NotificationType::Legacy,
        'No debe perderse aunque Redis falle',
        $this->incident->id,
    );

    // Notification row is the source of truth; the live channel is a
    // delivery accelerator. SSE reconnect + Last-Event-ID recovery is
    // what guarantees the bell sees this even if publish threw.
    expect($notification)->not->toBeNull();
    expect(Notification::count())->toBe(1);
});

it('does not publish a second update for a deduplicated notification', function (): void {
    Redis::shouldReceive('publish')->once();

    $service = app(NotificationService::class);
    $service->notify($this->user, NotificationType::Legacy, 'Original', $this->incident->id);
    $second = $service->notify($this->user, NotificationType::Legacy, 'Original', $this->incident->id);

    expect($second)->toBeNull();
    expect(Notification::count())->toBe(1);
});

it('creates at most one notification when the queued job is retried', function (): void {
    Redis::shouldReceive('publish')->once();

    $job = new SendIncidentNotificationJob(
        $this->user->id,
        $this->incident->id,
        NotificationType::Claim->value,
        'Tu incidencia fue reclamada.',
        ['claimed_by' => 15],
    );

    $job->handle(app(NotificationService::class));
    $job->handle(app(NotificationService::class));

    expect(Notification::query()->where('type', NotificationType::Claim->value)->count())->toBe(1);
});
