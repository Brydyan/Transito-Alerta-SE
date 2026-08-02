<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Repositories;

use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Shared\Repositories\EloquentRepository;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Implementación Eloquent del repositorio de Incidencias.
 *
 * @cqrs-role command-repository
 *
 * Pertenece al command side: toda mutación pasa por DB::transaction(),
 * lockForUpdate() en operaciones con race (claim/release) y el bind del
 * actor de auditoría vía set_config('app.current_user_id', ...) para que
 * el trigger Postgres registre quién hizo el cambio.
 *
 * `applyFilters()` es la única superficie que también consume el query side
 * (FeedController::staffFeed()), pero sólo para casos staff — el feed
 * ciudadano NUNCA debe llegar a este repositorio.
 *
 * @see docs/Convenciones/architecture-cqrs-lite.md
 */
class EloquentIncidentRepository extends EloquentRepository implements IncidentRepository
{
    public function __construct()
    {
        parent::__construct(new Incident);
    }

    /**
     * Override to wrap the write in a transaction and bind the authenticated
     * actor for the audit trigger before the UPDATE fires.
     */
    public function update(int $id, array $data): Model
    {
        return DB::transaction(function () use ($id, $data): Model {
            $this->bindAuditActor();

            $record = $this->findById($id);

            if ($record === null) {
                throw new \RuntimeException("Record [{$this->model->getTable()}] with ID {$id} not found.");
            }

            $record->update($data);

            return $record->fresh();
        });
    }

    protected function applyFilters(Builder $query, array $filters): void
    {
        // Scoping por organización (REQ-RBAC-03)
        /** @var User|null $user */
        $user = Auth::user();
        if ($user !== null && ! $user->isSystemAdmin()) {
            if ($user->isOrganizationAdmin()) {
                $query->where('organization_id', $user->organization_id);
            }
            if ($user->isOperator()) {
                $query->where('organization_id', $user->organization_id);
                // Solo incidencias donde el operador está asignado explícitamente
                $query->whereIn('id', function ($q) use ($user): void {
                    $q->select('incident_id')
                        ->from('assignments')
                        ->where('user_id', $user->id);
                });
            }
            if ($user->isRegularUser()) {
                $query->whereRaw('1 = 0'); // no ven nada en index()
            }
        }

        // REQ-2 (H2): relations[] is now caller-driven. Each controller passes
        // the minimal set it actually consumes (see IncidentController::index
        // vs ::show). When the key is absent we fall back to an empty eager-load
        // set so the repository never silently retains stale behaviour.
        $relations = $filters['relations'] ?? [];

        $query
            ->with(is_array($relations) ? $relations : [])
            ->withCount('comments')
            ->when($filters['title'] ?? null, fn (Builder $q, string $v) => $q->where(function (Builder $q) use ($v): void {
                $q->where('title', 'ilike', '%'.$v.'%')
                    ->orWhere('description', 'ilike', '%'.$v.'%');
            }))
            ->when($filters['status'] ?? null, fn (Builder $q, string $v) => $q->where('status', $v))
            ->when($filters['priority'] ?? null, fn (Builder $q, string $v) => $q->where('priority', $v))
            ->when($filters['location_id'] ?? null, function (Builder $q, string $v): void {
                // Fixes N+1: use a single recursive CTE query instead of
                // Location::find() + descendantsAndSelf()->pluck('id')
                $q->whereRaw('location_id IN (
                    WITH RECURSIVE location_tree AS (
                        SELECT id FROM locations WHERE id = ?
                        UNION ALL
                        SELECT l.id FROM locations l
                        INNER JOIN location_tree lt ON l.parent_id = lt.id
                    )
                    SELECT id FROM location_tree
                )', [(int) $v]);
            })
            ->when($filters['incident_category_id'] ?? null, fn (Builder $q, string $v) => $q->where('incident_category_id', $v))
            ->when($filters['user_id'] ?? null, fn (Builder $q, string $v) => $q->where('user_id', $v))
            ->orderBy('created_at', 'desc')
            ->when($filters['bbox'] ?? null, function (Builder $q, string $v): void {
                // bbox=minLng,minLat,maxLng,maxLat — PostGIS ST_MakeEnvelope
                // takes (xmin, ymin, xmax, ymax, srid), so the order maps
                // directly. The geom column is `geometry` (SRID 4326),
                // and ST_MakeEnvelope returns a geometry — no type cast
                // required.
                [$minLng, $minLat, $maxLng, $maxLat] = array_map('floatval', explode(',', $v));
                $q->whereRaw(
                    'ST_Within(geom, ST_MakeEnvelope(?, ?, ?, ?, 4326))',
                    [$minLng, $minLat, $maxLng, $maxLat]
                );
            });
    }

    public function claim(int $id, int $userId): Incident
    {
        return DB::transaction(function () use ($id, $userId): Incident {
            /** @var Incident $incident */
            $incident = $this->model->newQuery()
                ->where('id', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($incident->claimed_by !== null) {
                throw new \RuntimeException('Esta incidencia ya está asignada a otro operador.', 409);
            }

            $incident->update([
                'claimed_by' => $userId,
                'claimed_at' => now(),
                'status' => IncidentStatus::InProgress,
            ]);

            return $incident->fresh();
        });
    }

    public function release(int $id): Incident
    {
        return DB::transaction(function () use ($id): Incident {
            /** @var Incident $incident */
            $incident = $this->model->newQuery()
                ->where('id', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($incident->claimed_by === null) {
                throw new \RuntimeException('Esta incidencia no está asignada a ningún operador.', 409);
            }

            $incident->update([
                'claimed_by' => null,
                'claimed_at' => null,
                'status' => IncidentStatus::Pending,
            ]);

            return $incident->fresh();
        });
    }

    /**
     * Set the PostgreSQL session variable used by the audit trigger to record
     * the actor who performed the write.  Only runs on pgsql and when a user
     * is authenticated; otherwise the trigger falls back to COALESCE(user_id).
     */
    private function bindAuditActor(): void
    {
        if (DB::getDriverName() === 'pgsql' && Auth::id() !== null) {
            DB::statement("SELECT set_config('app.current_user_id', ?, true)", [(string) Auth::id()]);
        }
    }
}
