<?php

return [

    /*
    |--------------------------------------------------------------------------
    | From address for AssignmentNotification mail
    |--------------------------------------------------------------------------
    |
    | Overrides opcionales del `from` para el canal de notificaciones de
    | asignación de operador. Si los valores GMAIL_FROM_* están vacíos,
    | SmtpMailSender hace fallback automático a config('mail.from.*').
    |
    | Orden de precedencia que SmtpMailSender aplica:
    |
    |   1. config('gmail.from_address')  →  si no vacío
    |   2. config('mail.from.address')   →  fallback
    |
    |   1. config('gmail.from_name')     →  si no vacío
    |   2. config('mail.from.name')      →  fallback
    |
    | IMPORTANTE: las credenciales SMTP (host, port, username, password,
    | encryption) NO se leen desde este archivo. El motor real (Symfony
    | Mailer) las consume directamente de la sección `mail.mailers.smtp`
    | de config/mail.php, que se llena con las env vars MAIL_HOST,
    | MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD y MAIL_SCHEME/ENCRYPTION.
    | Esto garantiza una sola fuente de verdad para credenciales SMTP
    | y evita drift entre canales.
    */

    'from_address' => env('GMAIL_FROM_ADDRESS'),

    'from_name' => env('GMAIL_FROM_NAME'),
];
