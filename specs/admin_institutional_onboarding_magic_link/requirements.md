# Requirements: Alta e Invitación de Usuarios Internos vía Magic Link / OTP

## Objetivo
Implementar la creación de cuentas con privilegios elevados (Admin, Supervisor, Operador, Institución). La alta es realizada por un Administrador desde un panel interno, enviando una invitación por correo con Magic Link u OTP para la activación de la cuenta y definición de la contraseña inicial.

## EARS notation
- **WHILE** the user is an 'Admin' navigating the internal panel, **WHEN** they submit an invitation form, **THE SYSTEM SHALL** validate the data and send a Magic Link / OTP to the provided email.
- **IF** the invited role requires an institution (e.g., 'Institucion'), **THE SYSTEM SHALL** require 'institution_id' in the payload.
- **WHEN** the invited user clicks the Magic Link, **THE SYSTEM SHALL** verify the token's validity and expiration (24h).
- **IF** the token is expired, **THE SYSTEM SHALL** display an error and offer a "Solicitar nuevo enlace" option.
- **WHEN** the user submits a new password via the activation screen, **THE SYSTEM SHALL** save the hashed password, set 'email_verified_at' to current timestamp, and activate the account.
- **WHILE** processing the activation, **THE SYSTEM SHALL** prevent reuse of the one-time token.
