# Tasks: Registro Público de Ciudadanos sin Fricción

- [ ] T1 — Revisar y ajustar migración de `users` para garantizar índices únicos en `email` y/o `username`. Cubre: R1.
- [ ] T2 — Crear `app/Http/Requests/RegisterRequest.php` con validación de credenciales mínimas (`email/username`, `password` mín. 6 chars). Cubre: R2, R3.
- [ ] T3 — Añadir ruta `POST /v1/auth/register-citizen` en `routes/api.php` apuntando a `AuthController@register`. Cubre: R2.
- [ ] T4 — Implementar `AuthController@register` forzando el rol "Ciudadano" (ignorando payload malicioso) y asignando `email_verified_at = now()`. Cubre: R4, R5, R6.
- [ ] T5 — Generar token de Sanctum/JWT en `AuthController@register` y retornar HTTP 201. Cubre: R7.
- [ ] T6 — Implementar `authService.register(data)` en `public/js/services/authService.js`. Cubre: R8.
- [ ] T7 — Implementar UI en `public/js/views/signup.js`: prevenir double-submit (deshabilitar botón) y manejar visualización de errores 422/500 reactivando botón. Cubre: R8, R9.
- [ ] T8 — Añadir Feature tests para `POST /v1/auth/register-citizen` verificando éxito, fallos de validación, forzado de rol y token de respuesta. Cubre: R1, R2, R3, R4, R5, R6, R7.
