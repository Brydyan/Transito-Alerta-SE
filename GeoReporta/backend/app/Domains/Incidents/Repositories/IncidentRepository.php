<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Repositories;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Shared\Repositories\Repository;

/**
 * Contrato del repositorio de Incidencias.
 *
 * @cqrs-role command-repository-contract
 *
 * Define los métodos de mutación que el command side consume. Cualquier
 * método nuevo que sólo sirva para alimentar el read model (Redis) debe
 * vivir en un repositorio separado bajo `App\Domains\Incidents\ReadModels`,
 * no acá — este contrato es exclusivamente del command side.
 *
 * @see docs/Convenciones/architecture-cqrs-lite.md
 */
interface IncidentRepository extends Repository
{
    public function claim(int $id, int $userId): Incident;

    public function release(int $id): Incident;
}
