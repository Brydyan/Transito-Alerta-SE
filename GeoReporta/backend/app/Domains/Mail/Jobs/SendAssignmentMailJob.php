<?php

declare(strict_types=1);

namespace App\Domains\Mail\Jobs;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Mail\Services\MailSenderInterface;
use App\Domains\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Job encolado que dispara el mail de notificación cuando un operador
 * es asignado formalmente a una incidencia.
 *
 * Encapsula la llamada al `MailSenderInterface` para que el observer
 * (`AssignmentNotificationObserver`) solo se preocupe por construir el
 * evento de dominio y delegar el envío a Redis-backed queues. Esto saca
 * la latencia SMTP (host unreachable, auth lenta, timeouts) del request
 * HTTP que crea la asignación — la fila en `assignments` se persiste
 * sin esperar al SMTP, y un proceso `worker` separado absorbe el envío
 * con reintentos.
 *
 * ## Garantías del Job
 *
 * - `tries = 3` y `backoff = [10, 30, 90]` segundos: la última espera
 *   cubre una ventana de ~2 minutos para outages SMTP cortos (ej.
 *   Gmail 502 transitorio). Si los tres intentos fallan el Job queda
 *   registrado en `failed_jobs` (driver `database-uuids` por default).
 * - `timeout = 60` segundos: cortamos a tiempo un SMTP colgado antes
 *   que el worker se quede colgado también.
 * - `ShouldBeUnique`: el observer puede dispararse dos veces para la
 *   misma asignación (replay de evento, observer registrado dos veces,
 *   etc.). El lock por `sha1(assignment:incident:user)` evita que el
 *   mismo mail se enqueue dos veces dentro de la ventana
 *   `uniqueFor = 300s`. La lógica de deduplicación 60s interna de
 *   NotificationService sigue cubriendo el caso in-app; este lock es
 *   la red de seguridad específica para mails.
 *
 * ## Resolución de dependencias
 *
 * El `MailSenderInterface` se inyecta por método (`handle()`) en lugar
 * de por constructor. Esto es la convención Laravel para Jobs: el
 * constructor se serializa al payload Redis y solo debe contener tipos
 * primitivos serializables (User/Incident via SerializesModels), nunca
 * dependencias del container. El container del worker resuelve la
 * `MailSenderInterface` (registrada como singleton → `SmtpMailSender`)
 * al momento de invocar `handle()`.
 *
 * La tolerancia a fallos SMTP (S-7) sigue activa porque el Job delega
 * al método público del `MailSenderInterface`, que internamente absorbe
 * excepciones vía el helper `buildAndSend()` de SmtpMailSender.
 */
class SendAssignmentMailJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 60;

    /**
     * Backoff exponencial entre reintentos (segundos).
     *   - 1er reintento: 10s (cubre transients SMTP de pocos segundos)
     *   - 2do reintento: 30s
     *   - 3do reintento: 90s (suma ~130s — opera por debajo de los
     *     300s del lock `uniqueFor`)
     *
     * @var array<int, int>
     */
    public array $backoff = [10, 30, 90];

    public function __construct(
        public readonly User $user,
        public readonly Incident $incident,
        public readonly string $assignmentRole,
    ) {}

    public function handle(MailSenderInterface $mailSender): void
    {
        $mailSender->sendAssignedIncident($this->user, $this->incident, $this->assignmentRole);
    }

    /**
     * Identificador único del Job. Combina el incidente con el
     * destinatario para evitar duplicados si el observer de
     * `Assignment` se dispara dos veces para la misma fila.
     *
     * No usamos `assignment_id` directo porque el modelo `Assignment`
     * no se persiste en este Job (el observer sí tiene la fila recién
     * creada pero no la pasamos al dispatcher para mantener la signatura
     * estable). El par `incident_id + user_id` identifica la asignación
     * unívocamente: en una incidencia solo puede haber un responsable
     * y un apoyo por operador a la vez.
     */
    public function uniqueId(): string
    {
        return sha1('assignment:'.(string) $this->incident->id.':'.(string) $this->user->id);
    }

    /**
     * Ventana (segundos) durante la cual el lock de unicidad permanece
     * vigente. 5 minutos cubren los tres reintentos del Job con margen:
     * si el primer intento todavía está en backoff y entra un dispatch
     * duplicado, el segundo se descarta en lugar de saturar la cola.
     */
    public function uniqueFor(): int
    {
        return 300;
    }
}
