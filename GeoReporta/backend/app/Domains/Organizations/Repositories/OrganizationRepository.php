<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Repositories;

use App\Domains\Organizations\Models\Organization;
use App\Domains\Shared\Repositories\Repository;
use Illuminate\Support\Collection;

interface OrganizationRepository extends Repository
{
    public function tree(): Collection;

    /**
     * Organización que cubre una ubicación: su location_id coincide con la
     * ubicación dada o con alguno de sus ancestros en la jerarquía.
     * Usada por el auto-assign de organización al crear incidencias (B-02).
     *
     * Cuando se pasa `$categoryId`, la organización además debe cubrir esa
     * categoría (su `incident_category_id` está en la cadena ancestral de
     * la categoría — una org configurada para una categoría raíz cubre sus
     * subcategorías — o es NULL para orgs transversales).
     */
    public function findForLocation(int $locationId, ?int $categoryId = null): ?Organization;

    /**
     * Organizaciones que serán notificadas cuando se cree una incidencia con
     * la combinación (location_id, category_id) indicada. Incluye toda org
     * cuya location_id esté en la cadena ancestral de la ubicación
     * (mismo criterio que `findForLocation`), siempre que su
     * `incident_category_id` esté en la cadena ancestral de la categoría
     * (una org configurada para una categoría raíz cubre sus subcategorías)
     * o sea NULL (orgs "transversales" que atienden cualquier categoría).
     *
     * Orden estable por id para que el primer elemento sea determinístico
     * (coincide con el que `findForLocation` devolvería, así el frontend
     * puede marcar sin ambigüedad cuál es la "principal" / claimable).
     *
     * @return Collection<int, Organization>
     */
    public function findNotifiedFor(int $locationId, int $categoryId): Collection;

    /**
     * Catálogo plano id/name (ordenado por nombre) para selects de
     * formularios. Con `$withParent` incluye parent_id (form de organizaciones).
     *
     * @return Collection<int, array{id: int, name: string, parent_id?: int|null}>
     */
    public function catalog(bool $withParent = false): Collection;
}
