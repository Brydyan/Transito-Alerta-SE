<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Jobs;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Services\NotificationService;
use App\Domains\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

final class SendIncidentNotificationJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public array $backoff = [5, 15, 30];

    public function __construct(
        public readonly int $userId,
        public readonly int $incidentId,
        public readonly string $type,
        public readonly string $message,
        public readonly array $data,
    ) {}

    public function handle(NotificationService $service): void
    {
        $user = User::find($this->userId);

        if ($user === null || ! Incident::query()->whereKey($this->incidentId)->exists()) {
            return;
        }

        $service->notify(
            user: $user,
            type: NotificationType::from($this->type),
            message: $this->message,
            incidentId: $this->incidentId,
            data: $this->data,
        );
    }
}
