<?php

declare(strict_types=1);

namespace App\Domains\Mail\Messages;

use App\Domains\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Mailable enviado al invitado cuando un admin crea su cuenta.
 *
 * Contiene un link con el token en plaintext para que el invitado
 * complete el flujo de aceptación de T&C y seteo de password.
 *
 * Renderiza dos vistas Blade:
 *   - HTML: `emails.users.invited`
 *   - Texto plano: `emails.users.invited-text`
 */
class UserInvitedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $tokenPlain,
        public readonly string $acceptUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Te invitaron a sistema-incidencias-georreferenciadas',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.users.invited',
            text: 'emails.users.invited-text',
            with: [
                'user' => $this->user,
                'acceptUrl' => $this->acceptUrl,
            ],
        );
    }
}
