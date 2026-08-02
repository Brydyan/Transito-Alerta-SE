@php
    /** @var \App\Domains\Users\Models\User $user */
    /** @var \App\Domains\Incidents\Models\Incident $incident */
    /** @var string $assignmentRole */
@endphp
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incidencia asignada</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f6f6; color: #1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f6f6; padding: 24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="background-color: #1d4ed8; padding: 24px 32px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">
                                Incidencia asignada
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 24px 32px;">
                            <p style="margin: 0 0 16px; font-size: 16px;">
                                Hola <strong>{{ trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: $user->email }}</strong>,
                            </p>
                            <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">
                                @if ($assignmentRole === 'responsable')
                                    Se te ha asignado como <strong>responsable</strong> de la siguiente incidencia:
                                @elseif ($assignmentRole === 'apoyo')
                                    Se te ha asignado como <strong>apoyo</strong> en la siguiente incidencia:
                                @else
                                    Se te ha asignado a la siguiente incidencia (rol: {{ $assignmentRole }}):
                                @endif
                            </p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; margin: 16px 0;">
                                <tr>
                                    <td style="padding: 16px;">
                                        <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                            Incidencia
                                        </p>
                                        <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">
                                            {{ $incident->title }}
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 8px; font-size: 14px; color: #6b7280;">
                                Ingresa al sistema para ver los detalles completos y tomar acción.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                                Sistema de Incidencias Georreferenciadas — Notificación automática.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
