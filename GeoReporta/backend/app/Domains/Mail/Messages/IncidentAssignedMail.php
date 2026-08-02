<?php

declare(strict_types=1);

namespace App\Domains\Mail\Messages;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Mailable enviado a un operador cuando se le asigna formalmente a una
 * incidencia (responsable o apoyo).
 *
 * Renderiza dos vistas Blade:
 *   - HTML: `emails.incidents.assigned`
 *   - Texto plano: `emails.incidents.assigned-text`
 *
 * El `from` se setea programáticamente desde `SmtpMailSender` (precedencia
 * `gmail.from_address` → `mail.from.address`) para mantener la lógica
 * de configuración en una sola clase. Dejamos `envelope()->subject` acá
 * porque es estático al tipo de mail.
 */
class IncidentAssignedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly Incident $incident,
        public readonly string $assignmentRole,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Incidencia asignada: {$this->incident->title}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.incidents.assigned',
            text: 'emails.incidents.assigned-text',
            with: [
                'user' => $this->user,
                'incident' => $this->incident,
                'assignmentRole' => $this->assignmentRole,
            ],
        );
    }
}
