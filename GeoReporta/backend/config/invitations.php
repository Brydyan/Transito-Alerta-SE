<?php

/**
 * Configuración del dominio de invitaciones de usuario.
 *
 * Se lee desde .env mediante env():
 *   INVITATION_TTL_HOURS  — TTL de la invitación en horas (default 48)
 *   TERMS_VERSION         — versión actual de Términos y Condiciones (default v0)
 */

return [
    'ttl_hours' => (int) env('INVITATION_TTL_HOURS', 48),

    'terms_version' => env('TERMS_VERSION', 'v0'),
];
