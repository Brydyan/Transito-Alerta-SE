# Requirements: Registro Público de Ciudadanos sin Fricción

## R1
CUANDO el sistema ejecuta la migración de la tabla `users`, el sistema DEBE crear un índice único para las columnas de autenticación (`email` o `username`).

## R2
CUANDO la API recibe una solicitud a `POST /v1/auth/register-citizen`, el sistema DEBE validar que el payload contiene credenciales mínimas válidas (`email` o `username`, y un `password` de mínimo 6 caracteres).

## R3
SI la validación falla ENTONCES el sistema DEBE retornar un error HTTP 422 Unprocessable Entity con los detalles de la validación.

## R4
CUANDO un usuario se registra mediante `POST /v1/auth/register-citizen`, el sistema DEBE crear el registro asignando forzosamente el rol de "Ciudadano".

## R5
SI el payload del registro incluye un rol diferente ENTONCES el sistema DEBE ignorarlo y continuar con el registro como "Ciudadano".

## R6
CUANDO el usuario es creado exitosamente, el sistema DEBE marcar automáticamente la cuenta como verificada asignando la fecha y hora actual a `email_verified_at`.

## R7
CUANDO el usuario es creado exitosamente, el sistema DEBE retornar una respuesta HTTP 201 Created que incluya el token de acceso (Sanctum/JWT) para login inmediato.

## R8
MIENTRAS el usuario completa el formulario de registro en el frontend de VanillaJS, el sistema DEBE deshabilitar el botón de envío tras el primer clic para prevenir envíos duplicados (double-submit).

## R9
SI el registro en el frontend falla por errores como 422 o 500 ENTONCES el sistema DEBE mostrar el error correspondiente al usuario en la interfaz y volver a habilitar el botón de envío.
