<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Services;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Repositories\IncidentRepository;
use App\Domains\Users\Models\User;

/**
 * Servicio de claim/release de incidencias.
 *
 * @cqrs-role command-service
 *
 * Pertenece al command side: encapsula la lógica de negocio para que un
 * OperadorOrg tome (claim) o libere (release) una incidencia de su
 * organización. Valida pertenencia organizacional, no-duplicidad del
 * claim y el límite `max_active_claims` antes de delegar al
 * IncidentRepository, que es quien efectivamente muta Postgres dentro
 * de una transacción.
 *
 * @see docs/Convenciones/architecture-cqrs-lite.md
 */
class IncidentClaimService
{
    public function __construct(
        private readonly IncidentRepository $incidents,
    ) {}

    /**
     * Asigna una incidencia al operador.
     *
     * @throws \RuntimeException con código HTTP como semantic code
     */
    public function claim(int $incidentId, User $operator): Incident
    {
        $incident = $this->incidents->findById($incidentId);

        if ($incident === null) {
            throw new \RuntimeException('Incidencia no encontrada.', 404);
        }

        if ($incident->claimed_by !== null) {
            throw new \RuntimeException('Esta incidencia ya está asignada a otro operador.', 409);
        }

        if ($incident->organization_id !== $operator->organization_id) {
            throw new \RuntimeException('No pertenece a tu organización.', 403);
        }

        $org = $operator->organization;

        if ($org === null) {
            throw new \RuntimeException('No tenés una organización asignada.', 403);
        }

        $activeClaims = $this->activeClaimCount($operator);

        if ($activeClaims >= $org->max_active_claims) {
            throw new \RuntimeException(
                'Alcanzaste el límite máximo de claims activos ('.$org->max_active_claims.').',
                429,
            );
        }

        return $this->incidents->claim($incidentId, $operator->id);
    }

    /**
     * Libera una incidencia previamente asignada al operador.
     *
     * @throws \RuntimeException con código HTTP como semantic code
     */
    public function release(int $incidentId, User $operator): Incident
    {
        $incident = $this->incidents->findById($incidentId);

        if ($incident === null) {
            throw new \RuntimeException('Incidencia no encontrada.', 404);
        }

        if ($incident->claimed_by !== $operator->id) {
            throw new \RuntimeException('No sos el dueño de este claim.', 403);
        }

        return $this->incidents->release($incidentId);
    }

    /**
     * Cantidad de claims activos del operador.
     */
    public function activeClaimCount(User $operator): int
    {
        return Incident::query()
            ->where('claimed_by', $operator->id)
            ->where('status', 'in_progress')
            ->count();
    }
}
