<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Services;

use App\Domains\Invitations\Exceptions\InvitationGoneException;
use App\Domains\Invitations\Exceptions\InvitationNotFoundException;
use App\Domains\Invitations\Http\Resources\InvitationPreviewResource;
use App\Domains\Invitations\Models\UserInvitation;
use App\Domains\Mail\Services\MailJobDispatcher;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

/**
 * Servicio principal del dominio de invitaciones.
 *
 * Maneja la creación de invitaciones y la aceptación de las mismas.
 *
 * ## Creación de invitación
 *
 * `createAndSendInvitation()` genera un token, lo persiste en `UserInvitation`
 * y encola el mail de invitación vía `MailJobDispatcher`. La cola Redis
 * absorbe la latencia SMTP (el request HTTP que crea la invitación no
 * espera al SMTP), y un worker dedicado procesa el `SendInvitationMailJob`
 * con backoff exponencial (5 intentos, hasta ~1h entre el último reintento).
 * La tolerancia S-7 sigue activa porque el Job, al ejecutarse, llama a
 * `SmtpMailSender::sendUserInvitation()` que absorbe excepciones SMTP
 * internamente. El try/catch exterior en este método es un safety net
 * final por si la cola está caída y `dispatch()` falla (ej. Redis no
 * responde).
 *
 * ## Aceptación de invitación
 *
 * `acceptInvitation()` es atómica:
 *
 * 1. Busca el token plaintext en la DB iterando sobre todas las invitaciones
 *    (Hash::check no es SQL-friendly porque Hash::make es no-determinístico).
 *    Si el token existe pero accepted_at IS NOT NULL → 410 Gone.
 *    Si el token existe pero expires_at < now() → 410 Gone.
 * 2. Dentro de una transacción con SELECT FOR UPDATE:
 *    - Verifica que no esté consumida (doble check).
 *    - UPDATE accepted_at. Si affected_rows === 0 → 410 (race).
 *    - UPDATE del usuario: password, email_verified_at, terms_accepted_at.
 * 3. Retorna el usuario actualizado.
 */
class InvitationService
{
    public function __construct(
        private readonly InvitationTokenGenerator $tokenGenerator,
        private readonly MailJobDispatcher $mailDispatcher,
    ) {}

    /**
     * Crea una invitación y envía el mail al invitado.
     *
     * Si el envío del mail falla (SMTP caído, etc.), la invitación se crea
     * igualmente y solo se loguea un warning. El mail podrá reenviarse más
     * adelante (funcionalidad no implementada en este slice).
     */
    public function createAndSendInvitation(User $user, ?User $inviter = null): UserInvitation
    {
        $tokenPlain = $this->tokenGenerator->generate();
        $tokenHash = $tokenPlain['tokenHash'];
        $plain = $tokenPlain['tokenPlain'];

        $invitation = UserInvitation::create([
            'user_id' => $user->id,
            'token_hash' => $tokenHash,
            'expires_at' => Carbon::now()->addHours((int) config('invitations.ttl_hours', 48)),
            'terms_version' => config('invitations.terms_version', 'v0'),
            'invited_by_user_id' => $inviter?->id,
        ]);

        try {
            $this->mailDispatcher->dispatchInvitationMail($user, $plain);
        } catch (\Throwable $e) {
            // S-7: fallo al encolar no bloquea la creación del usuario.
            // El dispatcher en sí mismo no debería fallar salvo que Redis
            // esté caído o haya un error de configuración; en ese caso la
            // invitación queda creada pero sin Job encolado. Un admin
            // puede reenviar manualmente (out of scope de este slice).
            Log::warning('Invitation mail failed to enqueue', [
                'user_id' => $user->id,
                'invitation_id' => $invitation->id,
                'error' => $e->getMessage(),
            ]);
        }

        return $invitation;
    }

    /**
     * Acepta una invitación con el token plaintext y los datos del formulario.
     *
     * @throws InvitationNotFoundException cuando el token no existe
     * @throws InvitationGoneException cuando el token está expirado o ya fue consumido
     */
    public function acceptInvitation(
        string $tokenPlain,
        string $password,
        bool $acceptTerms,
        string $termsVersion,
    ): User {
        // Buscar la invitación por hash usando Hash::check
        // (Hash::make es no-determinístico, no se puede hacer WHERE token_hash = ?)
        $invitation = $this->findInvitationByToken($tokenPlain);

        if ($invitation === null) {
            throw new InvitationNotFoundException;
        }

        // Verificar expiración (antes de la transacción para respuesta rápida)
        if ($invitation->isExpired()) {
            throw new InvitationGoneException('Token expirado');
        }

        // Verificar si ya fue consumida (antes de la transacción)
        if ($invitation->accepted_at !== null) {
            throw new InvitationGoneException('Invitación ya utilizada');
        }

        return DB::transaction(function () use ($invitation, $password, $termsVersion): User {
            // Bloquear la fila para evitar race conditions
            $locked = UserInvitation::where('id', $invitation->id)
                ->lockForUpdate()
                ->first();

            // Doble verificación dentro de la transacción
            if ($locked === null || $locked->accepted_at !== null) {
                throw new InvitationGoneException('Invitación ya utilizada');
            }

            // Marcar como consumida
            $affected = UserInvitation::where('id', $invitation->id)
                ->whereNull('accepted_at')
                ->update([
                    'accepted_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ]);

            if ($affected === 0) {
                throw new InvitationGoneException('Invitación ya utilizada');
            }

            // Actualizar el usuario
            $user = $invitation->user;
            $user->password = $password; // hashed cast
            $user->email_verified_at = Carbon::now();
            $user->terms_accepted_at = Carbon::now();
            $user->terms_version = $termsVersion;
            $user->save();

            return $user;
        });
    }

    /**
     * Busca una invitación por token plaintext.
     *
     * Dado que Hash::make es no-determinístico, debemos usar Hash::check
     * en PHP. Iteramos sobre todas las invitaciones para distinguir:
     *
     * - Token no encontrado → retorna null (caller lanza 404)
     * - Token encontrado, accepted_at IS NOT NULL → lanza InvitationGoneException (410)
     * - Token encontrado, expirado → lanza InvitationGoneException (410)
     * - Token encontrado, pending → retorna la invitación
     *
     * En producción el volumen es bajo (una invitación por usuario creado),
     * así que está bien iterar sobre todas.
     *
     * @throws InvitationGoneException cuando el token está expirado o ya fue consumido
     */
    private function findInvitationByToken(string $tokenPlain): ?UserInvitation
    {
        $invitation = $this->lookupInvitationByHash($tokenPlain);

        if ($invitation === null) {
            return null;
        }

        // Token encontrado — verificar estado
        if ($invitation->accepted_at !== null) {
            throw new InvitationGoneException('Invitación ya utilizada');
        }

        if ($invitation->isExpired()) {
            throw new InvitationGoneException('Token expirado');
        }

        // Vigente y pendiente
        return $invitation;
    }

    /**
     * Lookup compartido por SHA-256 sin chequeo de estado. Usado por
     * `findInvitationByToken` (que después valida pending-only) y por
     * `previewInvitation` (que reporta cualquier estado).
     */
    private function lookupInvitationByHash(string $tokenPlain): ?UserInvitation
    {
        $hash = hash('sha256', $tokenPlain);

        return UserInvitation::where('token_hash', $hash)->first();
    }

    /**
     * Read-only preview de una invitación. NO consume ni modifica el
     * estado: sólo carga la fila y construye el payload via
     * `InvitationPreviewResource`. Permite al frontend mostrar la
     * invitación (org, invitador, expiración) ANTES de pedirle al
     * usuario que tipee la contraseña.
     *
     * El preview sólo aplica a invitaciones pendientes. Si el token ya
     * fue consumido o expiró, se lanza `InvitationGoneException` para
     * que la respuesta HTTP lleve 410: el frontend muestra un banner de
     * estado y deshabilita el formulario en lugar de pretender que el
     * token sigue activo. El recurso nunca se construye en esos casos,
     * así no hay riesgo de exponer PII accidentalmente.
     *
     * @throws InvitationNotFoundException cuando el token no existe (404)
     * @throws InvitationGoneException cuando el token está expirado o consumido (410)
     */
    public function previewInvitation(string $tokenPlain): InvitationPreviewResource
    {
        $invitation = $this->lookupInvitationByHash($tokenPlain);

        if ($invitation === null) {
            throw new InvitationNotFoundException;
        }

        // Estado del token. Si NO está pendiente, el preview no aplica:
        // queremos que el cliente reciba 410 y muestre el banner
        // correspondiente, no un payload con `status: 'expired'`.
        if ($invitation->accepted_at !== null) {
            throw new InvitationGoneException('Invitación ya utilizada');
        }

        if ($invitation->isExpired()) {
            throw new InvitationGoneException('Token expirado');
        }

        // Eager load para evitar N+1 en el resource.
        $invitation->loadMissing([
            'user.role',
            'user.organization',
            'invitedByUser.role',
        ]);

        return new InvitationPreviewResource($invitation, 'pending');
    }
}
