<?php

declare(strict_types=1);

namespace App\Domains\Mail\Services;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Mail\Messages\IncidentAssignedMail;
use App\Domains\Mail\Messages\UserInvitedMail;
use App\Domains\Users\Models\User;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Log;

/**
 * Implementación SMTP del contrato MailSenderInterface.
 *
 * Esta clase es SINGLETON (registrada en AppServiceProvider::register)
 * porque la instancia solo guarda dependencias inyectadas y el resolver
 * se usa siempre con la misma configuración SMTP. No mantener estado
 * mutable aquí — `sendAssignedIncident()` es una operación fire-and-forget.
 *
 * Precedencia de configuración (de mayor a menor):
 *
 *   1. `config('gmail.*')` y `config('gmail.from_address')` — dedicado
 *      al envío de notificaciones de asignación vía SMTP genérico (no
 *      exclusivamente Gmail: cualquier host que hable SMTP funciona).
 *      Se setea vía vars `GMAIL_*` en `.env`.
 *
 *   2. `config('mail.from.address')` — fallback automático si la sección
 *      `gmail.from_address` está vacía. Garantiza que el mail salga con
 *      un `from` razonable incluso en entornos sin GMAIL_* configuradas.
 *
 * El from Name sigue el mismo patrón (`gmail.from_name` → `mail.from.name`).
 *
 * Tolerancia a fallos (S-7):
 *
 *   `sendAssignedIncident()` y `sendUserInvitation()` envuelven
 *   `Mailer::to()->send()` en try/catch a través del helper interno
 *   `buildAndSend()`. Si el SMTP falla (host inalcanzable, auth error,
 *   timeout, etc.) el método NO propaga: registra `Log::warning` con
 *   contexto (user, incident, role, error) y retorna. Esto sigue el
 *   patrón de `AssignmentNotificationObserver::created()` y de
 *   `NotificationService::publish()` — un fallo de mail nunca debe
 *   romper la fila en `assignments` que es lo importante para el
 *   negocio.
 *
 * Refactor helper:
 *
 *   `buildAndSend()` centraliza la lógica común de las dos rutas de
 *   envío (assignment + invitation) para no duplicar el try/catch, los
 *   nombres de evento de log y el merge de contexto. Está declarado
 *   `protected` para uso interno de esta clase. Los Jobs encolados
 *   (`SendAssignmentMailJob`, `SendInvitationMailJob`) NO lo invocan
 *   directamente — siguen llamando a las rutas públicas
 *   (`sendAssignedIncident` / `sendUserInvitation`) vía la
 *   `MailSenderInterface` resuelta del container, lo que preserva el
 *   contrato existente y permite que la tolerancia S-7 siga activa
 *   incluso cuando el envío corre en el proceso del worker.
 */
class SmtpMailSender implements MailSenderInterface
{
    public function __construct(
        private readonly Mailer $mailer,
    ) {}

    public function sendAssignedIncident(User $user, Incident $incident, string $assignmentRole): void
    {
        $fromAddress = $this->resolveFromAddress();
        $fromName = $this->resolveFromName();

        $mailable = new IncidentAssignedMail($user, $incident, $assignmentRole);
        // El framework espera `$mailable->from` como array de filas
        // [['address' => ..., 'name' => ...]] (ver Mailable::buildFrom()
        // línea 463 de Illuminate/Mail/Mailable.php). Por eso el doble
        // array anidado, no key-value simple.
        $mailable->from = [
            [
                'address' => $fromAddress,
                'name' => $fromName,
            ],
        ];

        $this->buildAndSend($mailable, (string) $user->email, [
            'failure_event' => 'AssignmentNotification mail failed',
            'success_event' => 'AssignmentNotification mail sent',
            'user_id' => $user->id,
            'incident_id' => $incident->id,
            'role' => $assignmentRole,
            'from' => $fromAddress,
        ]);
    }

    public function sendUserInvitation(User $user, string $tokenPlain): void
    {
        $fromAddress = $this->resolveFromAddress();
        $fromName = $this->resolveFromName();

        $baseUrl = $_ENV['FRONTEND_BASE_URL'] ?? $_ENV['APP_URL'] ?? 'http://localhost:3000';
        $acceptUrl = rtrim($baseUrl, '/').'/accept-invite?token='.$tokenPlain;

        $mailable = new UserInvitedMail($user, $tokenPlain, $acceptUrl);
        $mailable->from = [
            [
                'address' => $fromAddress,
                'name' => $fromName,
            ],
        ];

        $this->buildAndSend($mailable, (string) $user->email, [
            'failure_event' => 'UserInvitation mail failed',
            'success_event' => 'UserInvitation mail sent',
            'user_id' => $user->id,
            'user_email' => $user->email,
            'from' => $fromAddress,
        ]);
    }

    /**
     * Envía un Mailable vía el Mailer inyectado absorbiendo excepciones
     * SMTP. Centraliza el try/catch, los eventos de log y el merge de
     * contexto compartido por los dos métodos públicos.
     *
     * El array `$logContext` debe incluir:
     *   - `failure_event`: nombre del evento Log::warning ante error SMTP
     *   - `success_event`: nombre del evento Log::info tras envío OK
     *   - cualquier clave adicional de contexto (user_id, incident_id, …)
     *     que se mergea tanto en el warning como en el info.
     *
     * Los nombres de evento viven dentro de `$logContext` para que el call
     * site sea self-describing. Esto implica que `failure_event` y
     * `success_event` aparecen también como claves en el payload logueado
     * — aceptable: `Log::warning('AssignmentNotification mail failed', [...])`
     * ya repite el nombre del evento como mensaje, la clave extra es ruido
     * menor y los tests existentes usan `toMatchArray` (subset check) así
     * que no rompen.
     */
    protected function buildAndSend(Mailable $mailable, string $toEmail, array $logContext): void
    {
        try {
            $this->mailer->to($toEmail)->send($mailable);
        } catch (\Throwable $e) {
            Log::warning($logContext['failure_event'], $logContext + ['error' => $e->getMessage()]);

            return;
        }

        Log::info($logContext['success_event'], $logContext + ['email_sent' => true]);
    }

    private function resolveFromAddress(): string
    {
        $gmail = (string) config('gmail.from_address', '');
        if ($gmail !== '') {
            return $gmail;
        }

        return (string) config('mail.from.address', 'hello@example.com');
    }

    private function resolveFromName(): string
    {
        $gmail = (string) config('gmail.from_name', '');
        if ($gmail !== '') {
            return $gmail;
        }

        return (string) config('mail.from.name', (string) config('app.name', 'Sistema de Incidencias'));
    }
}
