<?php

declare(strict_types=1);

namespace App\Domains\Shared\Repositories;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

abstract class EloquentRepository implements Repository
{
    public function __construct(
        protected readonly Model $model,
    ) {}

    /**
     * Paginación compartida para todos los repositorios.
     * Cada repositorio concreto solo necesita definir applyFilters() y,
     * si pagina con relaciones eager, paginateRelations().
     */
    public function paginate(
        array $filters = [],
        int $perPage = 20,
        ?int $hardCap = null,
    ): LengthAwarePaginator {
        $perPage = isset($filters['per_page']) ? (int) $filters['per_page'] : $perPage;
        unset($filters['per_page']);

        $query = $this->newQuery()->with($this->paginateRelations());
        $this->applyFilters($query, $filters);

        return $query->paginate(min($perPage, $hardCap ?? 100));
    }

    /**
     * Relaciones eager-loaded solo por paginate(). Vacío por defecto para
     * no cargar de más en findById()/create()/update().
     */
    protected function paginateRelations(): array
    {
        return [];
    }

    public function findById(int $id): ?Model
    {
        return $this->newQuery()->find($id);
    }

    public function create(array $data): Model
    {
        return $this->newQuery()->create($data);
    }

    public function update(int $id, array $data): Model
    {
        $record = $this->findById($id);

        if ($record === null) {
            throw new \RuntimeException("Record [{$this->model->getTable()}] with ID {$id} not found.");
        }

        $record->update($data);

        return $record->fresh();
    }

    public function delete(int $id): void
    {
        $this->newQuery()->where('id', $id)->delete();
    }

    protected function newQuery(): Builder
    {
        return $this->model->newQuery();
    }

    /**
     * Cada repositorio concreto define sus filtros acá.
     * Ejemplo:
     *   $query->when($filters['role_id'] ?? null, fn($q, $v) => $q->where('role_id', $v));
     */
    abstract protected function applyFilters(Builder $query, array $filters): void;
}
