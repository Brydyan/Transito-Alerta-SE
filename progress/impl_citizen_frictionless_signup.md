## Trazabilidad: Registro Público de Ciudadanos sin Fricción

- **R1** → `test_citizen_frictionless_signup` (Se verifica el éxito de la creación única).
- **R2** → `test_citizen_frictionless_signup` (Rechaza la petición si falta password o es menor de 6 caracteres).
- **R3** → `test_citizen_frictionless_signup` (Comprueba el retorno del HTTP Status 422).
- **R4** → `test_citizen_frictionless_signup` (Comprueba la inserción forzosa de rol Ciudadano: `$this->assertTrue($user->roles->contains('nombre', 'Ciudadano'));`).
- **R5** → `test_citizen_frictionless_signup` (Verifica que ignora un intento de rol Admin en el payload).
- **R6** → `test_citizen_frictionless_signup` (Valida que el campo `email_verified_at` no sea nulo).
- **R7** → `test_citizen_frictionless_signup` (Afirma que el response contiene la estructura correcta `['access_token', 'user']` y es 201 Created).
- **R8** → Manual / UI Check en `signup.component.js` (Botón se deshabilita para evitar double-submit).
- **R9** → Manual / UI Check en `signup.component.js` (Manejo visual del 422 Reactivando el botón).
