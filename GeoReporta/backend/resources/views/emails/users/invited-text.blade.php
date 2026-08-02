@php
    /** @var \App\Domains\Users\Models\User $user */
    /** @var string $acceptUrl */
@endphp
Sistema de Incidencias Georreferenciadas
=========================================

Hola {{ trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: $user->email }},

Un administrador te creó una cuenta en el Sistema de Incidencias Georreferenciadas.
Para activar tu cuenta, aceptá los Términos y Condiciones y establecé tu contraseña
ingresando al siguiente enlace:

{{ $acceptUrl }}

Si no solicitaste esta invitación, ignorá este correo.
El enlace expira en 48 horas.

—
Notificación automática. Por favor no respondas a este mensaje.
