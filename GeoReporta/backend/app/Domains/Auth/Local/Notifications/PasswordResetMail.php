<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordResetMail extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $token,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $baseUrl = config('app.frontend_url');
        if (empty($baseUrl) || $baseUrl === 'http://localhost:5173') {
            $baseUrl = env('FRONTEND_URL') ?: env('FRONTEND_BASE_URL') ?: env('APP_URL') ?: 'http://localhost:3006';
        }

        $url = rtrim((string) $baseUrl, '/')
            .'/#/reset-password?token='.$this->token
            .'&email='.urlencode($notifiable->email);

        $fromAddress = (string) (config('gmail.from_address') ?: config('mail.from.address') ?: 'noreply@dihm-muertos.site');
        $fromName = (string) (config('gmail.from_name') ?: config('mail.from.name') ?: config('app.name', 'Sistema de Incidencias'));

        return (new MailMessage)
            ->from($fromAddress, $fromName)
            ->subject('Restablecer contraseña - Sistema de Incidencias')
            ->greeting('¡Hola!')
            ->line('Recibiste este correo porque solicitaste restablecer tu contraseña.')
            ->action('Restablecer contraseña', $url)
            ->line('Este enlace expirará en 60 minutos.')
            ->line('Si no solicitaste este cambio, puedes ignorar este mensaje.')
            ->salutation('Saludos, el equipo del Sistema de Incidencias');
    }
}
