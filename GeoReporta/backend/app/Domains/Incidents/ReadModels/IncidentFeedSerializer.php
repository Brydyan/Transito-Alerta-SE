<?php

declare(strict_types=1);

namespace App\Domains\Incidents\ReadModels;

use App\Console\Commands\FeedRebuildCommand;
use App\Domains\Incidents\Http\FeedController;
use App\Domains\Incidents\Listeners\RedisIncidentSync;
use App\Domains\Incidents\Models\FeedService;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;
use App\Domains\Users\Services\UserAnonymizer;

/**
 * Fuente única de verdad del shape que el read model Redis espera por Incidencia.
 *
 * Si modificás este método, también tenés que actualizar {@see FeedController}
 * / {@see FeedService} si consumen los campos nuevos — pero el SERIALIZER
 * es lo único que {@see RedisIncidentSync} y
 * {@see FeedRebuildCommand} usan para escribir. Antes de este extractor, el
 * shape estaba duplicado en esos dos sitios y un cambio silencioso en uno degradaba el feed
 * sin que el otro se enterara (versión live vs versión rebuild quedaban desincronizadas).
 */
final class IncidentFeedSerializer
{
    /**
     * Serializa una Incidencia al array que se persiste en Redis como `feed:v2:items`.
     *
     * Issue #234 — the Redis cache is only consumed by the citizen feed
     * (`FeedController::$citizenBranch` → `FeedService::getFeed()`), so the
     * user fields are always anonymized. There's no real viewer in a
     * write-time serializer, so we pass `null` as the viewer and the
     * anonymizer reduces the user to id-only.
     *
     * @return array<string, mixed>
     */
    public function serialize(Incident $incident): array
    {
        // Eager-load defensivo: si el llamador no hizo ->with([...]) los relations
        // vienen null, y queremos que el shape sea estable aunque se invoque con
        // un Incident "pelado" (ej. un test).
        $incident->loadMissing(['category', 'location', 'user']);

        $locationPathIds = $incident->location?->ancestorsAndSelf()
            ->orderBy('depth', 'desc')
            ->pluck('id')
            ->toArray() ?? [];

        // The Redis cache is a *write-time* projection — there is no
        // viewer at this point. The only consumer (citizen feed) never
        // sees real names anyway, so we always anonymize.
        /** @var UserAnonymizer $anonymizer */
        $anonymizer = app(UserAnonymizer::class);
        $anonUser = $anonymizer->anonymize($incident->user, null);

        return [
            'id' => (string) $incident->id,
            'incident_category_id' => (string) $incident->incident_category_id,
            'organization_id' => (string) $incident->organization_id,
            'user_id' => (string) $incident->user_id,
            'location_id' => (string) $incident->location_id,
            'title' => $incident->title,
            'status' => $incident->status,
            'priority' => $incident->priority,
            'resolution_date' => $incident->resolution_date?->toIso8601String(),
            'created_at' => $incident->created_at?->toIso8601String(),
            'updated_at' => $incident->updated_at?->toIso8601String(),
            'geom' => $incident->geom ? $incident->geom->toJson() : null,
            'category_name' => $incident->category?->name ?? '',
            'organization_name' => $incident->organization?->name ?? '',
            'location_name' => $incident->location?->name ?? '',
            'location_path_ids' => json_encode($locationPathIds),
            // Issue #234 — anonymized reporter payload. The id is the
            // only thing preserved; the frontend renders "Anónimo" (or
            // initials + #id) but never a real name.
            'user_first_name' => $anonUser['first_name'] ?? null,
            'user_last_name' => $anonUser['last_name'] ?? null,
            'user_avatar' => $anonUser['profile_image_path'] ?? null,
            'user_is_anonymous' => $anonUser['is_anonymous'] ?? true,
            'user_anon_id' => $anonUser['id'] ?? null,
        ];
    }
}
