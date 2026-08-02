<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Services;

use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Support\PhoneRules;
use Illuminate\Support\Facades\Log;

class RegisterService
{
    /**
     * @param  array<string, mixed>  $data  Validated payload from RegisterRequest
     *
     * @throws \RuntimeException When the citizen role row is missing from the database.
     */
    public function register(array $data): User
    {
        unset($data['role_id']);

        $citizenRole = Role::where('name', UserRole::Usuario->value)->first();

        if ($citizenRole === null) {
            throw new \RuntimeException(
                'No se pudo registrar el usuario: el rol "usuario" no existe en la base de datos.'
            );
        }

        $user = User::create([
            'role_id' => $citizenRole->id,
            'email' => $data['email'],
            'password' => $data['password'],
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'phone' => PhoneRules::normalize($data['phone'] ?? null),
        ]);

        // Despacha la notificación de verificación de correo en cola
        // (ShouldQueue). El mail NO bloquea la respuesta 201 a
        // POST /api/register (story sc-117, R8).
        $user->sendEmailVerificationNotification();

        Log::info('auth.register.success', [
            'user_id' => $user->id,
            'email_hash' => hash('sha256', (string) $user->email),
        ]);

        return $user;
    }
}
