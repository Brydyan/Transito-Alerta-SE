<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Services;

use App\Domains\Auth\Firebase\Exceptions\RejectedUnverifiedException;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AccountLinker
{
    /**
     * @throws RejectedUnverifiedException
     */
    public function linkOrCreate(VerifiedFirebaseToken $token): User
    {
        $existing = User::where('email', $token->email)->first();

        if ($existing !== null) {
            if ($existing->email_verified_at !== null) {
                return $existing;
            }

            throw new RejectedUnverifiedException;
        }

        return $this->createGoogleUser($token);
    }

    private function createGoogleUser(VerifiedFirebaseToken $token): User
    {
        $citizenRole = Role::where('name', UserRole::Usuario->value)->first();

        if ($citizenRole === null) {
            throw new \RuntimeException(
                'No se pudo registrar el usuario Google: el rol "usuario" no existe en la base de datos.'
            );
        }

        return User::create([
            'role_id' => $citizenRole->id,
            'email' => $token->email,
            'password' => Hash::make(Str::random(64)),
            'first_name' => $token->firstName,
            'last_name' => $token->lastName,
            'email_verified_at' => now(),
        ]);
    }
}
