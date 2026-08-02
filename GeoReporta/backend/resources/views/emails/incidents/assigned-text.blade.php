@php
    /** @var \App\Domains\Users\Models\User $user */
    /** @var \App\Domains\Incidents\Models\Incident $incident */
    /** @var string $assignmentRole */
@endphp
Sistema de Incidencias Georreferenciadas
=========================================

Hola {{ trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: $user->email }},

@if ($assignmentRole === 'responsable')
Se te ha asignado como RESPONSABLE de la siguiente incidencia:
@elseif ($assignmentRole === 'apoyo')
Se te ha asignado como APOYO en la siguiente incidencia:
@else
Se te ha asignado a la siguiente incidencia (rol: {{ $assignmentRole }}):
@endif

Incidencia: {{ $incident->title }}

Ingresa al sistema para ver los detalles completos y tomar acción.

—
Notificación automática. Por favor no respondas a este mensaje.
