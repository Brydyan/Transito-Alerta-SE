<?php

declare(strict_types=1);

namespace App\Domains\Shared\Http\Policies;

use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

abstract class PermissionPolicy
{
    abstract protected function resource(): string;

    public function viewAny(User $user): bool
    {
        return $user->can("{$this->resource()}.view");
    }

    public function view(User $user, Model $model): bool
    {
        return $user->can("{$this->resource()}.view");
    }

    public function create(User $user): bool
    {
        return $user->can("{$this->resource()}.create");
    }

    public function update(User $user, Model $model): bool
    {
        return $user->can("{$this->resource()}.update");
    }

    public function delete(User $user, Model $model): bool
    {
        return $user->can("{$this->resource()}.delete");
    }
}
