<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Http\Resources\NotificationResource;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Users\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Crea notificaciones para usuarios objetivo.
 *
 * El servicio encapsula la regla "no duplicar notificaciones idénticas
 * recientes" (no le spameamos al operador con N copies del mismo claim)
 * y centraliza el armado del payload `data`.
 *
 * El evento de notificación se entrega en vivo vía Redis Pub/Sub al
 * canal `user:{id}:notifications`. La tabla `notifications` es la
 * fuente durable: si Redis cae o el cliente estaba desconectado, el
 * snapshot inicial del endpoint SSE (`/api/notifications/stream`)
 * recupera los eventos perdidos a partir del `Last-Event-ID` enviado
 * por el browser. Ver `openspec/changes/eliminar-mercure-sse-nativo`
 * para el contrato completo.
 */
class NotificationService
{
    // Constructor deliberadamente vacío: la clase no guarda estado
    // mutable y depende solo de facades estáticas. Cualquier dependencia
    // futura (logger, métricas) debe inyectarse por constructor para
    // mantener testeabilidad.

    /**
     * Topic used both to publish a user's notifications (Redis Pub/Sub)
     * and, on the subscriber side, as the entry the SSE endpoint reads
     * back to filter events for the authenticated user. Must match
     * `GET /api/notifications/stream` subscriber logic exactly.
     */
    public static function topicFor(int $userId): string
    {
        return "user:{$userId}:notifications";
    }

    /**
     * Crea una notificación. Devuelve la instancia creada (o null si fue
     * descartada por deduplicación).
     *
     * @param  array<string, mixed>  $data
     */
    public function notify(
        User $user,
        NotificationType $type,
        string $message,
        ?int $incidentId = null,
        array $data = [],
    ): ?Notification {
        // Dedup simple: si ya existe una notificación idéntica (mismo user,
        // mismo type, mismo incident) en los últimos 60 segundos, no creamos otra.
        $exists = Notification::query()
            ->where('user_id', $user->id)
            ->where('type', $type->value)
            ->when($incidentId !== null, fn ($q) => $q->where('incident_id', $incidentId))
            ->where('created_at', '>=', now()->subSeconds(60))
            ->exists();

        if ($exists) {
            Log::debug('notifications.deduplicated', [
                'method' => __METHOD__,
                'user_id' => $user->id,
                'type' => $type->value,
                'incident_id' => $incidentId,
            ]);

            return null;
        }

        $notification = Notification::create([
            'user_id' => $user->id,
            'incident_id' => $incidentId,
            'type' => $type->value,
            'message' => $message,
            'data' => $data,
            'read' => false,
        ]);

        $this->publish($user->id, $notification);

        return $notification;
    }

    /**
     * Publishes the notification to the user's private Redis Pub/Sub
     * channel so an open SSE stream on `/api/notifications/stream`
     * delivers it live. Publish failures (Redis unreachable, auth
     * misconfig, payload too large) must never break notification
     * creation: the `notifications` table row is the source of truth,
     * and the SSE snapshot covers delivery gaps via `Last-Event-ID`.
     */
    private function publish(int $userId, Notification $notification): void
    {
        try {
            $payload = (new NotificationResource($notification))->resolve();
            Redis::publish(
                self::topicFor($userId),
                json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            );
        } catch (\Throwable $e) {
            Log::warning('notifications.publish_failed', [
                'method' => __METHOD__,
                'user_id' => $userId,
                'notification_id' => $notification->id,
                'exception' => $e->getMessage(),
                'exception_class' => get_class($e),
            ]);
            report($e);
        }
    }

    /**
     * Marca como leídas todas las notificaciones del usuario.
     */
    public function markAllAsRead(User $user): int
    {
        return Notification::query()
            ->forUser($user)
            ->unread()
            ->update(['read' => true]);
    }
}
