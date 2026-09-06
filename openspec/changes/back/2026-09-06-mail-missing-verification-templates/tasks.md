# Tasks: MAIL — Las plantillas de verificación que nunca existieron

Rama: `brydyan/mail/plantillas-de-verificacion-ausentes`, sacada de `develop`.

Orden obligatorio: **A antes que B**. Quitar los `as never` antes de que las plantillas
existan deja el proyecto sin compilar.

---

## A · Las dos plantillas

- [ ] **A.1** — Añadir `'email_verification'` y `'existing_account_attempt'` a la unión
  `TemplateName` en `backend/src/modules/mail/templates/mail-templates.ts`.

- [ ] **A.2** — Añadir sus dos funciones al registro `TEMPLATES`, en el mismo archivo.

  `email_verification` recibe `{ otp, expiresMinutes }`. El cuerpo muestra el código y los
  minutos de vigencia.

  `existing_account_attempt` recibe `{ ip, userAgent }`. Aviso informativo: alguien intentó
  crear una cuenta con este correo. **Sin OTP y sin enlace de acción** (D4).

  Ambas interpolan **exclusivamente** a través de `field()`, como las seis existentes. Nada
  de plantillas de cadena con datos crudos: es el requisito R13 y la razón por la que este
  módulo no usa un motor de plantillas.

- [ ] **A.3** — Tests de renderizado, uno por plantilla:
  - el cuerpo contiene el dato esperado (el OTP; la IP)
  - un dato con marcado HTML sale **escapado**, no interpretado
  - el aviso de intento **no** contiene el OTP ni un `href` de acción

---

## B · Retirar los `as never`

- [ ] **B.1** — Quitar el cast de `email-verification.service.ts:56`
  (`'existing_account_attempt' as never` → `'existing_account_attempt'`).

- [ ] **B.2** — Quitar el cast de `email-verification.service.ts:115`
  (`'email_verification' as never` → `'email_verification'`).

- [ ] **B.3** — `npx tsc --noEmit -p backend/tsconfig.json` en exit 0.

  **Trampa**: `nest build` usa `tsconfig.build.json`, que **excluye `test/`**. El build
  puede pasar con un test roto. Correr el typecheck, no sólo el build.

---

## C · La cobertura que faltaba

- [ ] **C.1** — Reforzar `email-verification.service.spec.ts:99`: la aserción pasa a
  incluir **la plantilla**, igual que hace su vecino en
  `password-reset.service.spec.ts:58`.

  ```ts
  expect.objectContaining({ to: 'test@example.com', template: 'email_verification' })
  ```

  Hacer lo mismo con el test del aviso de intento, si existe; si no existe, escribirlo.

- [ ] **C.2** — **El test que recorre la costura**. Nuevo, y es el entregable de fondo de
  esta fase: por cada nombre de plantilla que los servicios encolan, `renderMailTemplate`
  lo acepta sin lanzar.

  No vale enumerar los nombres a mano en el test — eso vuelve a partir la costura en dos.
  Derivarlos de la propia unión `TemplateName` y comprobar que el registro `TEMPLATES` los
  cubre todos.

- [ ] **C.3** — **Verificación por mutación, ejecutada por quien implementa.** Quitar
  `email_verification` del registro `TEMPLATES` y comprobar que **cae C.2**. Restaurar.

  Anotar en `apply-progress.md` **el nombre del test que cayó**. Si no cae ninguno, C.2 es
  decorativo y hay que rehacerlo antes de seguir.

- [ ] **C.4** — Test de integración del camino completo, contra Redis real: encolar una
  verificación, dejar que el consumidor la procese, y comprobar que **no** aparece en
  `mail:dead`. Es la prueba que habría detectado el defecto el primer día.

  Con `SMTP_HOST` sin configurar, `deliverViaSmtp` cae al transporte de sólo-registro y
  devuelve sin error: el camino se recorre entero sin mandar correo de verdad.

---

## D · Higiene de `mail:dead`

- [ ] **D.1** — Acotar el crecimiento del stream de entradas muertas (`XADD` con `MAXLEN ~`
  o equivalente) en `mail-outbox.consumer.ts`.

  Motivo: las entradas guardan el cuerpo, y en la verificación eso incluye **el OTP en
  claro**. El stream no caduca por sí solo.

  **No** vaciarlo al arrancar: es la única evidencia de que un correo falló, y borrarla
  convierte un fallo silencioso en uno invisible (D6).

- [ ] **D.2** — Documentar en el `apply-progress.md` el comando de limpieza manual
  (`redis-cli DEL mail:dead`) y por qué no es automático.

---

## Qué NO hacer en esta fase

- **No** introducir un motor de plantillas. El diseño original eligió funciones puras a
  propósito, por R13.
- **No** tocar la respuesta HTTP del alta. La indistinguibilidad de REG costó seis rondas;
  cualquier diferencia observable entre los dos caminos la rompe (D5).
- **No** reinyectar las entradas de `mail:dead` existentes. El OTP que contienen ya caducó.
- **No** tocar el `as never` de `incidents.service.ts:269`. Otro cast, otro camino, sin
  relación con el correo.
- **No** cambiar nada de Resend, del dominio ni del DNS. Se verificó que el fallo ocurre
  antes de abrir la conexión SMTP (`attempts 0`).

---

## Compuertas antes de dar por terminada la fase

```
backend  npx tsc --noEmit          exit 0   (no `nest build`: excluye test/)
backend  pnpm run lint             0 errores
backend  unit                      suites/tests, comparar con la línea base
backend  e2e                       suites/tests, comparar con la línea base
```

Si el total de tests **no sube**, los tests nuevos no se están ejecutando. Eso es un fallo
de la fase, no un detalle.
