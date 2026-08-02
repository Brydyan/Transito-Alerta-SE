<?php

declare(strict_types=1);

namespace App\Domains\Users\Repositories;

use App\Domains\Shared\Repositories\Repository;
use App\Domains\Users\Models\User;

interface UserRepository extends Repository
{
    public function findByEmail(string $email): ?User;
}
