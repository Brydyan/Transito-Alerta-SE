# Proposal: E2E — Usuario de pruebas y credenciales reales

## Intent

**El job `frontend-e2e` falla en cada PR.** Los tres specs que hacen login usan
credenciales que el seed no crea:

```ts
// frontend/e2e/auth-flow.e2e.ts:69-70
await page.getByLabel(/usuario/i).fill('admin@correo.com');
await page.getByLabel(/contraseña|password/i).fill('123456');
```

`database/seeds/users.js` siembra seis usuarios `@tase.local`. `admin@correo.com` no
existe y nunca existió en este backend — viene del GeoReporta original.

Hasta que se definió `vars.STAGING_BASE_URL`, los specs se saltaban y el fallo estaba
tapado. Ahora corren y fallan. **No es una regresión: es el mismo defecto, ahora
visible** — y eso es una mejora, no un problema nuevo.

## El síntoma que lo destapó

Una corrida del step llevaba **9m44** sin acercarse a terminar: 6 tests × 3 intentos ×
30 s de timeout, encadenados por `workers: 1`. Ya se acotó en `efe021f`
(`globalTimeout`, `maxFailures: 3`, `retries: 1`), así que hoy falla en un minuto en vez
de en diez. **Eso acotó el síntoma; esta fase cura la causa.**

## Scope

### In Scope — A · Usuario de pruebas
- Un usuario dedicado `e2e@tase.local` con rol **`operador_org`**, sembrado por
  `database/seeds/users.js` junto a los seis existentes
- Su contraseña llega por variable de entorno propia, nunca literal en el repo

### In Scope — B · Credenciales en los specs
- `auth-flow.e2e.ts`, `comment-flow.e2e.ts` y `menu-navigation.e2e.ts` leen usuario y
  contraseña del entorno
- Distinguir **«no configurado»** (se salta, con motivo declarado) de **«configurado y
  roto»** (falla) — ver `design.md` D4

### In Scope — C · CI
- Secret `E2E_PASSWORD` consumido por el job `frontend-e2e`
- El paso de seed de `deploy-staging.yml` siembra también este usuario
- **Caché de los navegadores de Playwright**: `~/.cache/ms-playwright` no está cacheado
  y se descarga Chromium entero en cada corrida, mientras el store de pnpm sí se cachea
  en los seis jobs

### Out of Scope
- Ampliar la cobertura e2e. Esta fase hace que **los tests existentes puedan pasar**; no
  añade escenarios
- Reescribir los asertos de los specs más allá de las credenciales
- Un entorno e2e aislado con su propia base. Hoy corren contra staging compartido, y por
  eso `workers: 1` se mantiene

## Capabilities

- `e2e-authentication` (nueva)

## Dependencias

Ninguna bloqueante. El paso de seed de `deploy-staging.yml` ya está integrado y esta fase
lo extiende.

**Bloquea de hecho al flujo de PR**: mientras no se cierre, cada PR muestra un job en
rojo, y un rojo permanente es un rojo que se deja de mirar.

## Preguntas abiertas

- **Q1** — ¿El usuario e2e debería poder borrarse solo lo que crea? Los specs crean
  comentarios contra staging compartido y nada los limpia. Fuera de alcance acá, pero es
  deuda que crece con cada corrida. Anotarla con dueño.
