# Tasks: TOOL — Compuertas que comprueben lo que dicen comprobar

> **Strict TDD activo.** Acá «test primero» significa: **probar que la compuerta detecta
> un fallo antes de darla por buena**. Una compuerta que nunca se vio fallar es
> exactamente el problema que esta fase existe para cerrar.

---

## A · Typecheck

- [ ] **A.1** — Antes de tocar nada, dejar constancia del estado de partida en
  `apply-progress.md`: salida de `npx tsc --noEmit -p tsconfig.json --listFiles`
  (cero archivos, exit 0) frente a `npx tsc -b tsconfig.json --noEmit` (exit 2). Es la
  evidencia de que la compuerta vieja no miraba nada.
- [ ] **A.2** — `frontend/tsconfig.spec.json`: `"types": ["jest", "node"]`. **Una línea,
  no cinco parches por archivo** (D2).
- [ ] **A.3** — Confirmar que `tsconfig.app.json` **no** cambia: el código de navegador no
  debe compilar contra APIs de Node.
- [ ] **A.4** — Sustituir `-p` por `-b` en toda compuerta declarada: `docs/agents/*.md`,
  `tasks.md` de los changes **vigentes** (no los archivados) y cualquier workflow que la
  invoque.
- [ ] **A.5** — **Probar que detecta.** Introducir un error de tipos deliberado, verificar
  que la compuerta sale distinto de 0, revertir. Sin esta prueba la fase no demuestra nada.
- [ ] **A.6** — Specs: compila el árbol, detecta un error real, el comando viejo era
  vacío, ninguna compuerta declarada usa `-p`.
- [ ] **A.7** — Specs de tipos en tests: tipos declarados, los cinco cierran, un spec
  nuevo no reincide, la app no hereda los tipos de Node.

## B · Lint

- [ ] **B.1** — Script `lint` en `frontend/package.json`, usando la configuración
  existente. **Sin añadir ni relajar reglas**: si aparecen violaciones, se anotan, no se
  silencian.
- [ ] **B.2** — Specs: script presente, ejecutable, sin reglas nuevas.
- [ ] **B.3** — Si la corrida arroja violaciones preexistentes, **anotarlas con conteo** en
  `apply-progress.md` y decidir explícitamente si entran en alcance. Por defecto: no.

## C · actionlint

- [ ] **C.1** — Paso de CI con el contenedor oficial (D4):
  `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/*.yml`
- [ ] **C.2** — **Probar que detecta.** Introducir una clave inválida a nivel raíz —el
  mismo `schedule:` suelto que dejó `ci.yml` inválido desde `351eec0`— verificar que
  falla, revertir.
- [ ] **C.3** — Specs: gate presente, estado actual limpio, detecta clave inválida, sin
  terceros.

## D · El gate nace en rojo, a propósito

- [ ] **D.1** — Registrar en `openspec/ROADMAP.md`, en «Defectos abiertos», el `TS2345` de
  `frontend/src/app/core/services/auth.service.spec.ts:227` (`string | null` no asignable
  a `string`). **Esta fase lo expone y no lo arregla**: decidir si `organization_name`
  puede ser nulo en `InvitationPreview` es una pregunta de dominio, no de herramientas.
- [ ] **D.2** — El gate entra **bloqueando**, sin `continue-on-error` ni lista de exentos.
  Un gate con excepción temporal es un gate con excepción permanente.
- [ ] **D.3** — Specs: falla por el defecto conocido, sin excepción temporal, anotado con
  dueño.

---

## Qué NO hacer

- No añadir `include` al `tsconfig.json` raíz para que `-p` funcione (D1): rompe el modelo
  de project references. El comando estaba mal; la configuración estaba bien
- No arreglar el `TS2345` acá (D3)
- No parchear los 5 specs uno por uno (D2)
- No añadir reglas de lint nuevas
- No reescribir los verify-reports archivados que declaran typechecks vacíos. Son registro
  histórico; la constancia va en el `proposal.md` de esta fase
