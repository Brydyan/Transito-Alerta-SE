<?php

declare(strict_types=1);

namespace App\Domains\Mail\Jobs;

use App\Domains\Mail\Services\MailSenderInterface;
use App\Domains\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Job encolado que dispara el mail de invitación a un usuario recién
 * creado por un administrador.
 *
 * Complementa a `SendAssignmentMailJob` con una política de reintentos
 * más agresiva: las invitaciones son el camino crítico para que un
 * operador pueda setear su password y aceptar Términos y Condiciones,
 * así que preferimos seguir intentando durante más tiempo antes de
 * marcar el Job como fallido.
 *
 * ## Política de reintentos
 *
 * - `tries = 5` (vs. 3 del assignment): duplicamos los intentos.
 * - `backoff = [30, 120, 600, 1800, 3600]` (segundos). Backoff
 *   exponencial amplio: 30s → 2m → 10m → 30m → 1h. La última espera
 *   es 1h para dar tiempo a que un SMTP caído por mantenimiento se
 *   recupere antes de que el Job se marque como failed.
 *
 * Esto NO bloquea la fila en `user_invitations` (la invitación se crea
 * sincrónicamente con el usuario vía `InvitationService::createAndSendInvitation`);
 * solo posterga el envío del mail. Si el Job termina en `failed_jobs`,
 * un admin puede reenviar la invitación manualmente (funcionalidad
 * fuera del scope de este slice).
 *
 * ## Unicidad
 *
 * `uniqueId` usa `user_id + primeros 8 chars del token`. El token es
 * el "secreto" de la invitación (sólo viaja por mail, nunca se guarda
 * plaintext en DB), así que nunca lo logueamos completo — sólo un
 * prefijo suficiente para distinguir reintentos de la misma invitación
 * vs. una invitación nueva al mismo usuario (que tendría otro token).
 *
 * ## Seguridad del token en payload
 *
 * El `tokenPlain` se serializa al payload Redis cuando el Job se encola.
 * Redis está protegido con `--requirepass` y la red `incidencias-network`
 * es overlay-only (sin `ports:` expuestos en prod). Consideramos
 * aceptable que el token viaje por Redis cifrado en reposo y por la red
 * overlay: el requisito de transporte seguro se mantiene porque el
 * worker y el backend comparten el mismo Swarm y Redis nunca es accesible
 * desde el host.
 */
class SendInvitationMailJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 5;

    public int $timeout = 60;

    /**
     * Backoff exponencial amplio entre reintentos (segundos).
     *
     *   - 30s   (transient SMTP)
     *   - 120s  (~2 min, blip de infra)
     *   - 600s  (~10 min, deploy/restart)
     *   - 1800s (~30 min, ventana operativa humana)
     *   - 3600s (~1h, mantenimiento programado)
     *
     * @var array<int, int>
     */
    public array $backoff = [30, 120, 600, 1800, 3600];

    public function __construct(
        public readonly User $user,
        public readonly string $tokenPlain,
    ) {}

    public function handle(MailSenderInterface $mailSender): void
    {
        $mailSender->sendUserInvitation($this->user, $this->tokenPlain);
    }

    /**
     * Identificador único del Job. Incluye los primeros 8 caracteres
     * del token (suficientes para distinguir invitaciones distintas al
     * mismo usuario) pero NO el token completo: nunca queremos el
     * plaintext del secreto en logs/observabilidad.
     */
    public function uniqueId(): string
    {
        return sha1('invitation:'.(string) $this->user->id.':'.substr($this->tokenPlain, 0, 8));
    }

    /**
     * Ventana (segundos) durante la cual el lock de unicidad permanece
     * vigente. 5 minutos alcanzan para cubrir el primer reintento (30s)
     * y el segundo (120s) — si entra un dispatch duplicado en ese rango
     * se descarta en lugar de duplicar el mail en la cola.
     */
    public function uniqueFor(): int
    {
        return 300;
    }
}
