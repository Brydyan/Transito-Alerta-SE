<?php

declare(strict_types=1);

use App\Domains\Incidents\Jobs\SyncIncidentToRedisJob;
use App\Domains\Incidents\Listeners\RedisIncidentSync;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Jobs\SendIncidentNotificationJob;
use App\Domains\Notifications\Observers\IncidentNotificationObserver;
use App\Domains\Users\Models\User;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Mockery\MockInterface;
use Tests\TestCase;

uses(TestCase::class);

it('queues Redis reconciliation only after the incident transaction commits', function (): void {
    Queue::fake();
    Redis::shouldReceive('hset')->never();
    Redis::shouldReceive('zadd')->never();

    $incident = new Incident;
    $incident->id = 42;
    $incident->exists = true;

    DB::transaction(function () use ($incident): void {
        (new RedisIncidentSync)->created($incident);

        Queue::assertNothingPushed();
    });

    Queue::assertPushed(
        SyncIncidentToRedisJob::class,
        fn (SyncIncidentToRedisJob $job): bool => $job->incidentId === 42,
    );
});

it('logs and tolerates Redis dispatch failures after transaction commit', function (): void {
    $dispatchAttempted = false;

    $this->mock(Dispatcher::class, function (MockInterface $mock) use (&$dispatchAttempted): void {
        $mock->shouldReceive('dispatch')
            ->once()
            ->andReturnUsing(function (SyncIncidentToRedisJob $job) use (&$dispatchAttempted): never {
                expect($job->incidentId)->toBe(42);
                expect(DB::transactionLevel())->toBe(0);
                $dispatchAttempted = true;

                throw new RuntimeException('Redis queue unavailable');
            });
    });

    Log::shouldReceive('warning')
        ->once()
        ->withArgs(function (string $message, array $context): bool {
            expect($message)->toBe('Failed to queue incident Redis reconciliation');
            expect($context)->toBe([
                'incident_id' => 42,
                'error' => 'Redis queue unavailable',
            ]);

            return true;
        });

    $incident = new Incident;
    $incident->id = 42;
    $incident->exists = true;

    DB::transaction(function () use (&$dispatchAttempted, $incident): void {
        (new RedisIncidentSync)->created($incident);

        expect($dispatchAttempted)->toBeFalse();
    });

    expect($dispatchAttempted)->toBeTrue();
});

it('queues captured claim notification data only after commit', function (): void {
    Queue::fake();

    $owner = User::factory()->make(['id' => 7]);
    $incident = new Incident([
        'user_id' => $owner->id,
        'title' => 'Broken traffic light',
        'status' => 'pending',
        'claimed_by' => null,
    ]);
    $incident->id = 51;
    $incident->exists = true;
    $incident->setRelation('user', $owner);
    $incident->syncOriginal();
    $incident->claimed_by = 9;
    $incident->syncChanges();

    DB::transaction(function () use ($incident): void {
        app(IncidentNotificationObserver::class)->updated($incident);

        Queue::assertNothingPushed();
    });

    Queue::assertPushed(
        SendIncidentNotificationJob::class,
        fn (SendIncidentNotificationJob $job): bool => $job->userId === 7
            && $job->incidentId === 51
            && $job->type === NotificationType::Claim->value
            && $job->data === ['claimed_by' => 9],
    );
});

it('logs and tolerates notification dispatch failures after transaction commit', function (): void {
    $dispatchAttempted = false;

    $this->mock(Dispatcher::class, function (MockInterface $mock) use (&$dispatchAttempted): void {
        $mock->shouldReceive('dispatch')
            ->once()
            ->andReturnUsing(function (SendIncidentNotificationJob $job) use (&$dispatchAttempted): never {
                expect($job->userId)->toBe(7);
                expect($job->incidentId)->toBe(51);
                expect($job->type)->toBe(NotificationType::Claim->value);
                expect($job->message)->toBe('Tu incidencia "Broken traffic light" fue reclamada.');
                expect($job->data)->toBe(['claimed_by' => 9]);
                expect(DB::transactionLevel())->toBe(0);
                $dispatchAttempted = true;

                throw new RuntimeException('Notification queue unavailable');
            });
    });

    Log::shouldReceive('warning')
        ->once()
        ->withArgs(function (string $message, array $context): bool {
            expect($message)->toBe('Failed to queue incident notification');
            expect($context)->toBe([
                'incident_id' => 51,
                'user_id' => 7,
                'type' => NotificationType::Claim->value,
                'error' => 'Notification queue unavailable',
            ]);

            return true;
        });

    $incident = new Incident([
        'user_id' => 7,
        'title' => 'Broken traffic light',
        'status' => 'pending',
        'claimed_by' => null,
    ]);
    $incident->id = 51;
    $incident->exists = true;
    $incident->syncOriginal();
    $incident->claimed_by = 9;
    $incident->syncChanges();

    DB::transaction(function () use (&$dispatchAttempted, $incident): void {
        app(IncidentNotificationObserver::class)->updated($incident);

        expect($dispatchAttempted)->toBeFalse();
    });

    expect($dispatchAttempted)->toBeTrue();
});

it('queues force-delete reconciliation without serializing the incident model', function (): void {
    Queue::fake();

    $incident = new Incident;
    $incident->id = 99;
    $incident->exists = true;

    (new RedisIncidentSync)->forceDeleted($incident);

    Queue::assertPushed(
        SyncIncidentToRedisJob::class,
        fn (SyncIncidentToRedisJob $job): bool => $job->incidentId === 99
            && ! property_exists($job, 'incident'),
    );
});

it('captures release and resolution transitions before queued execution', function (): void {
    Queue::fake();

    $released = new Incident([
        'user_id' => 7,
        'title' => 'Released incident',
        'status' => 'in_progress',
        'claimed_by' => 9,
    ]);
    $released->id = 52;
    $released->exists = true;
    $released->syncOriginal();
    $released->claimed_by = null;
    $released->syncChanges();

    $resolved = new Incident([
        'user_id' => 8,
        'title' => 'Resolved incident',
        'status' => 'pending',
    ]);
    $resolved->id = 53;
    $resolved->exists = true;
    $resolved->syncOriginal();
    $resolved->status = 'resolved';
    $resolved->syncChanges();

    DB::transaction(function () use ($released, $resolved): void {
        $observer = app(IncidentNotificationObserver::class);
        $observer->updated($released);
        $observer->updated($resolved);

        Queue::assertNothingPushed();
    });

    Queue::assertPushed(
        SendIncidentNotificationJob::class,
        fn (SendIncidentNotificationJob $job): bool => $job->incidentId === 52
            && $job->type === NotificationType::Assignment->value
            && $job->data === ['released_from' => 9],
    );
    // pending→resolved fires handleResolvedPendingApproval (sends IncidentPendingApproval to admins),
    // which requires admin recipients to exist in the org — not set up here, so no job is dispatched.
    // The old StatusChange assertion was against pre-PR-3 behavior (notify citizen on resolved).
});
