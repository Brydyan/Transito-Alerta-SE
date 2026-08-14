# Design: Registro Público de Ciudadanos sin Fricción

## Archivos a modificar / crear
- **Migraciones**: Ajustar migración de `users` (ej. `database/migrations/..._create_users_table.php` o añadir una nueva) para índices únicos.
- **Request**: Crear `app/Http/Requests/RegisterRequest.php` para centralizar validación.
- **Controlador**: Modificar `app/Http/Controllers/AuthController.php` (añadir o modificar método `register`).
- **Rutas**: Modificar `routes/api.php` para exponer el endpoint `POST /v1/auth/register-citizen`.
- **Frontend**: 
  - `public/js/services/authService.js` (agregar llamada a registro).
  - `public/js/views/signup.js` (lógica del UI, double-submit, manejo de error).

## Firmas y Endpoints nuevos
- `POST /v1/auth/register-citizen`
- Método `register(RegisterRequest $request)` en `AuthController`.

## Excepciones
- Se reutiliza la respuesta de validación 422 predeterminada de Laravel `ValidationException` en los FormRequests.
- Respuestas de error del servidor 500 para fallos inesperados, capturados y gestionados en el frontend.

## Alternativa descartada
- **Múltiples tablas para tipos de usuario:** Crear una tabla separada para "Ciudadanos" y otra para "Staff" o "Admin". Se descartó porque el sistema ya utiliza un modelo unificado de base de datos (`users`) con controles RBAC consolidados (ver id 9 en `feature_list.json`). Separarlos duplicaría lógica de autenticación y complicaría la gestión de tokens.
