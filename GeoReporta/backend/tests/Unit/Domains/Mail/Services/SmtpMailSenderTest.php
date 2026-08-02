<?php

declare(strict_types=1);

use App\Domains\Incidents\Models\Incident;
use App\Domains\Mail\Messages\IncidentAssignedMail;
use App\Domains\Mail\Services\SmtpMailSender;
use App\Domains\Users\Models\User;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Mail\PendingMail;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

uses(TestCase::class);

// Helpers para construir fixtures mínimos (no necesitamos DB completa).
function mailerTestUser(string $email = 'op@example.com'): User
{
    $user = new User;
    $user->id = 42;
    $user->email = $email;
    $user->first_name = 'Jane';
    $user->last_name = 'Doe';

    return $user;
}

function mailerTestIncident(string $title = 'Poste roto en av. 24 de Mayo'): Incident
{
    $incident = new Incident;
    $incident->id = 7;
    $incident->title = $title;

    return $incident;
}

beforeEach(function (): void {
    // Defaults de config para que ningún test herede valores de corrida previa.
    config()->set('gmail.from_address', null);
    config()->set('gmail.from_name', null);
    config()->set('gmail.mail_host', 'smtp.gmail.com');
    config()->set('gmail.mail_port', 587);
    config()->set('gmail.mail_username', null);
    config()->set('gmail.mail_password', null);
    config()->set('gmail.mail_encryption', 'tls');
    config()->set('mail.from.address', 'fallback@example.com');
    config()->set('mail.from.name', 'Fallback App');
});

// ──────────────────────────────────────────────────────────────────────
// Happy path
// ──────────────────────────────────────────────────────────────────────
it('sends a mailable to the user email via the Laravel mailer (success)', function (): void {
    config()->set('gmail.from_address', 'ops@gov.example');

    $user = mailerTestUser();
    $incident = mailerTestIncident();
    $role = 'responsable';

    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')
        ->once()
        ->withArgs(function (IncidentAssignedMail $mailable) use ($user, $incident, $role): bool {
            expect($mailable->user)->toBe($user);
            expect($mailable->incident)->toBe($incident);
            expect($mailable->assignmentRole)->toBe($role);

            return true;
        })
        ->andReturnNull();

    $mailer = Mockery::mock(Mailer::class);
    $mailer->shouldReceive('to')
        ->once()
        ->with($user->email)
        ->andReturn($pending);

    Log::shouldReceive('info')
        ->once()
        ->withArgs(function (string $message, array $ctx) use ($user, $incident): bool {
            expect($message)->toBe('AssignmentNotification mail sent');
            expect($ctx)->toMatchArray([
                'user_id' => $user->id,
                'incident_id' => $incident->id,
                'role' => 'responsable',
                'email_sent' => true,
            ]);

            return true;
        });

    $sender = new SmtpMailSender($mailer);
    $sender->sendAssignedIncident($user, $incident, $role);

    // El PendingMail se consume dentro de sendAssignedIncident — solo
    // necesitamos asegurar que Mockery::close() no reporte expectations
    // incumplidas; Pest ya lo hace en tearDown.
});

// ──────────────────────────────────────────────────────────────────────
// Tolerancia a fallos: el SMTP no debe romper el flujo principal
// ──────────────────────────────────────────────────────────────────────
it('catches SMTP failures and logs a warning without propagating', function (): void {
    config()->set('gmail.from_address', 'ops@gov.example');

    $user = mailerTestUser();
    $incident = mailerTestIncident();
    $role = 'apoyo';

    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')
        ->once()
        ->andThrow(new RuntimeException('smtp.gmail.com:587 unreachable: connection refused'));

    $mailer = Mockery::mock(Mailer::class);
    $mailer->shouldReceive('to')
        ->once()
        ->with($user->email)
        ->andReturn($pending);

    Log::shouldReceive('warning')
        ->once()
        ->withArgs(function (string $message, array $ctx) use ($user, $incident, $role): bool {
            expect($message)->toBe('AssignmentNotification mail failed');
            expect($ctx)->toMatchArray([
                'user_id' => $user->id,
                'incident_id' => $incident->id,
                'role' => $role,
            ]);
            expect($ctx)->toHaveKey('error');
            expect($ctx['error'])->toContain('connection refused');

            return true;
        });

    // Log::info NO debe invocarse en el path de fallo.
    Log::shouldReceive('info')->never();

    $sender = new SmtpMailSender($mailer);

    // El test verifica ausencia de excepción: si SmtpMailSender propaga,
    // esta llamada propagaría y el test fallaría.
    $sender->sendAssignedIncident($user, $incident, $role);

    expect(true)->toBeTrue(); // anclaje explícito
});

// ──────────────────────────────────────────────────────────────────────
// Precedencia de config: GMAIL_FROM_ADDRESS > MAIL_FROM_ADDRESS
// ──────────────────────────────────────────────────────────────────────
it('uses gmail.from_address when set, ignoring mail.from.address', function (): void {
    Log::spy();

    config()->set('gmail.from_address', 'gmail-specific@example.com');
    config()->set('mail.from.address', 'mail-from@example.com');

    $capturedFrom = null;

    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')
        ->once()
        ->withArgs(function (IncidentAssignedMail $mailable) use (&$capturedFrom): bool {
            // Mailable::$from es la fuente real que usa el framework al
            // armar el mensaje (ver Illuminate\Mail\Mailable::buildFrom
            // línea 463 — `$message->from($this->from[0]['address'], ...)`).
            $capturedFrom = $mailable->from[0]['address'] ?? null;

            return true;
        })
        ->andReturnNull();

    $mailer = Mockery::mock(Mailer::class);
    $mailer->shouldReceive('to')->once()->andReturn($pending);

    $sender = new SmtpMailSender($mailer);
    $sender->sendAssignedIncident(mailerTestUser(), mailerTestIncident(), 'responsable');

    expect($capturedFrom)->toBe('gmail-specific@example.com');
});

it('falls back to mail.from.address when gmail.from_address is empty', function (): void {
    Log::spy();

    config()->set('gmail.from_address', null);
    config()->set('mail.from.address', 'fallback-from@example.com');

    $capturedFrom = null;

    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')
        ->once()
        ->withArgs(function (IncidentAssignedMail $mailable) use (&$capturedFrom): bool {
            $capturedFrom = $mailable->from[0]['address'] ?? null;

            return true;
        })
        ->andReturnNull();

    $mailer = Mockery::mock(Mailer::class);
    $mailer->shouldReceive('to')->once()->andReturn($pending);

    $sender = new SmtpMailSender($mailer);
    $sender->sendAssignedIncident(mailerTestUser(), mailerTestIncident(), 'responsable');

    expect($capturedFrom)->toBe('fallback-from@example.com');
});

// ──────────────────────────────────────────────────────────────────────
// El subject del envelope refleja el título de la incidencia
// ──────────────────────────────────────────────────────────────────────
it('sets a subject that includes the incident title', function (): void {
    Log::spy();

    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')
        ->once()
        ->withArgs(function (IncidentAssignedMail $mailable): bool {
            expect($mailable->envelope()->subject)->toBe('Incidencia asignada: Semaforo quemado en av. Madrid');

            return true;
        })
        ->andReturnNull();

    $mailer = Mockery::mock(Mailer::class);
    $mailer->shouldReceive('to')->once()->andReturn($pending);

    $sender = new SmtpMailSender($mailer);
    $sender->sendAssignedIncident(
        mailerTestUser(),
        mailerTestIncident('Semaforo quemado en av. Madrid'),
        'responsable',
    );
});
