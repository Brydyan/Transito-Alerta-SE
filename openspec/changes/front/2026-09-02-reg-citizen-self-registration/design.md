# Design: REG — Auto-registro del ciudadano

---

## D1 — El rol es constante del servidor, no dato de la petición

```ts
// El DTO NO tiene campo `role`.
const user = await this.usersService.create({
  ...dto,
  roleName: 'reporter',   // fijo, no proviene de la petición
});
```

**Decisión: el endpoint fija `reporter` y el DTO no acepta ningún campo de rol.**

**Alternativa rechazada — aceptar `role` y validarlo contra una lista blanca.** Es el
patrón habitual y aquí es peligroso: convierte una imposibilidad en una validación. Una
imposibilidad no se puede saltar; una validación se puede escribir mal, refactorizar mal,
o quedar fuera de un camino nuevo. El proyecto ya tiene tres instancias registradas del
patrón *«regla aplicada en un camino y no en el vecino»*. Un endpoint público capaz de
conceder `master` si alguien se equivoca en una lista es la peor versión posible de ese
patrón.

**Corolario para el spec:** hay un escenario negativo que envía `role: 'master'` y afirma
que el usuario creado sigue siendo `reporter`. La propiedad se verifica; no se confía.

---

## D2 — Correo verificado para publicar, no para entrar

**Decisión: se puede iniciar sesión sin verificar; no se puede publicar.**

Razonamiento: la barrera existe para que el auto-registro no sea un generador de cuentas
desechables. Si un ciudadano puede registrarse con un correo inventado y publicar de
inmediato, la trazabilidad que AUD construye —el sello que permite sancionar información
falsa— no vale nada: se revela la autoría y detrás hay una dirección que nunca existió.

Ponerla en el *login* en cambio castiga al ciudadano legítimo que quiere mirar el feed y
todavía no abrió su correo, sin ganar nada: mirar no crea riesgo.

```
registrarse         → libre
entrar y leer       → libre
publicar / comentar → exige email_verified_at
```

**Alternativa rechazada — verificación en el login.** Más simple de implementar (un guard
único) y peor: bloquea la lectura, que es inofensiva, y no bloquea nada que la
verificación al publicar no bloquee ya.

**Alternativa rechazada — sin verificación.** Deja AUD sin sustento. Sellar la identidad
de una cuenta cuya identidad nadie comprobó es guardar un dato inútil con la ceremonia de
uno valioso.

La infraestructura existe entera: `EmailVerificationService`, `email_verified_at` y las
columnas OTP de `0028_users_otp_compliance.sql`. Esta fase la consume, no la construye.

---

## D3 — El alta no dice si el correo ya existe

Ante un correo ya registrado, la respuesta es **la misma** que ante uno nuevo: «te
enviamos un correo para verificar tu cuenta». Al correo existente se le manda un aviso de
intento de alta, no un OTP.

**Alternativa rechazada — responder 409 Conflict.** Es lo que pide la buena experiencia de
usuario y convierte el endpoint en un **oráculo de existencia de cuentas**: cualquiera
puede comprobar si una dirección está registrada en el sistema. En un producto donde la
autoría se sella justamente para proteger al denunciante, filtrar quién tiene cuenta va en
contra de lo que el resto del diseño intenta conseguir.

El costo es real y se acepta: quien ya tenía cuenta y lo olvidó recibe un correo en vez de
un mensaje en pantalla. Ese correo lo lleva a recuperar la contraseña.

---

## D4 — Limitación de tasa antes que captcha

Dos límites: por IP y por correo. Sin terceros.

**Alternativa rechazada — captcha desde el inicio.** Añade una dependencia externa, un
punto de fallo y datos que salen del sistema, para un problema que todavía no se observó.
Queda anotado como la respuesta si la limitación resulta insuficiente — decisión con
evidencia, no por si acaso.

---

## D5 — Ruta pública y su efecto en el renderizado

`/registro` es la **primera ruta alcanzable sin sesión** del producto. Hasta hoy `path: ''`
redirige a `login` y todo lo demás está tras `authGuard`.

No cambia la decisión de SPA estática: una página de registro es contenido fijo, no
necesita render por petición. Si más adelante aparece superficie pública real —un mapa
ciudadano indexable— la herramienta es **prerender de rutas puntuales**, que Angular
permite sin convertir la aplicación entera y sin añadir un proceso Node en producción.

Se anota acá para que quede constancia de que el punto se evaluó y no se arrastró por
inercia.
