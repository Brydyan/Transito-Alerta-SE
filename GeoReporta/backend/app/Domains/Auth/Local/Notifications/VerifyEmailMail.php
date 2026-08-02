<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Verificación de correo electrónico con OTP — story sc-117.
 *
 * Envía la notificación con el código OTP de 6 dígitos para que el usuario
 * lo ingrese en la pantalla /verify-email.
 */
class VerifyEmailMail extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly ?string $otp = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $verifyUrl = $this->verificationUrl($notifiable);

        $fromAddress = (string) (config('gmail.from_address') ?: config('mail.from.address') ?: 'noreply@dihm-muertos.site');
        $fromName = (string) (config('gmail.from_name') ?: config('mail.from.name') ?: config('app.name', 'Sistema de Incidencias'));

        $expireMinutes = 15;

        $mail = (new MailMessage)
            ->from($fromAddress, $fromName)
            ->subject(__('messages.verification_email_subject'))
            ->greeting(__('messages.verification_email_greeting'))
            ->line(__('messages.verification_email_intro'));

        if ($this->otp !== null) {
            $mail->line(__('messages.verification_email_otp_label'))
                ->line("# **{$this->otp}**")
                ->line(__('messages.verification_email_cta_intro'));
        } else {
            $mail->line(__('messages.verification_email_link_intro'));
        }

        return $mail
            ->action(__('messages.verification_email_action'), $verifyUrl)
            ->line(__('messages.verification_email_expiry', ['minutes' => $expireMinutes]))
            ->line(__('messages.verification_email_ignore'))
            ->salutation(__('messages.verification_email_salutation'));
    }

    public function verificationUrl(object $notifiable): string
    {
        $frontendBase = (string) (config('app.frontend_url') ?: env('FRONTEND_URL') ?: env('FRONTEND_BASE_URL') ?: env('APP_URL') ?: 'http://localhost:3006');
        $email = urlencode((string) $notifiable->getEmailForVerification());

        return rtrim($frontendBase, '/').'/#/verify-email?email='.$email;
    }
}
