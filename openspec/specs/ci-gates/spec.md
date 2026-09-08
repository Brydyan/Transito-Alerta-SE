# Spec: TOOL — Compuertas que comprueben lo que dicen comprobar

## Domain: ci-gates (NEW)

### Requirement: El typecheck del frontend compila archivos de verdad
La compuerta de tipos DEBE recorrer los proyectos referenciados y NO DEBE poder salir 0
sin haber compilado nada.

- Scenario: Compila el árbol — GIVEN `npx tsc -b tsconfig.json --listFiles` desde
  `frontend/` THEN lista los archivos de `tsconfig.app.json` y `tsconfig.spec.json`
- Scenario: Detecta un error real — GIVEN un error de tipos introducido en cualquier
  archivo de `src/` THEN la compuerta sale distinto de 0
- Scenario: El comando viejo era vacío — GIVEN `npx tsc --noEmit -p tsconfig.json
  --listFiles` THEN no lista ningún archivo del proyecto: queda documentado por qué se
  cambió
- Scenario: Ninguna compuerta declarada usa `-p` — GIVEN los `tasks.md` vigentes,
  `docs/agents/*.md` y los workflows THEN ninguno invoca el typecheck del frontend sin `-b`

### Requirement: Los specs pueden leer archivos del repositorio
La configuración de tipos de los tests DEBE incluir los tipos de Node.

- Scenario: Tipos declarados — GIVEN `frontend/tsconfig.spec.json` THEN su `types`
  incluye `node` además de `jest`
- Scenario: Los cinco cierran — GIVEN `npx tsc -b tsconfig.json --noEmit` THEN no hay
  errores `TS2307` por `node:fs` o `node:path`, ni `TS2304` por `__dirname` o `__filename`
- Scenario: Un spec nuevo no reincide — GIVEN un spec nuevo que importe `node:fs`
  THEN typechequea sin añadir nada por archivo
- Scenario: La app no hereda los tipos de Node — GIVEN `tsconfig.app.json` THEN su
  configuración de tipos no cambia: el código de navegador no debe compilar contra APIs de
  Node

### Requirement: Existe un script de lint en el frontend
El comando que los `tasks.md` exigen DEBE existir.

- Scenario: Script presente — GIVEN `frontend/package.json` THEN declara un script `lint`
- Scenario: Ejecutable — GIVEN `pnpm lint` desde `frontend/` THEN corre y termina con un
  código de salida propio, no con «script not found»
- Scenario: Sin reglas nuevas — GIVEN la corrida THEN usa la configuración de lint
  existente, sin añadir ni relajar reglas

### Requirement: Los workflows se validan en CI
Un workflow inválido NO DEBE poder llegar a la rama por defecto.

- Scenario: Gate presente — GIVEN el pipeline de CI THEN incluye un paso que valida
  `.github/workflows/*.yml` con `actionlint`
- Scenario: Estado actual limpio — GIVEN los workflows de hoy THEN el gate pasa sin
  hallazgos
- Scenario: Detecta clave inválida — GIVEN un workflow con una clave a nivel raíz que no
  pertenece ahí (como el `schedule:` suelto que dejó `ci.yml` inválido desde `351eec0`)
  THEN el gate falla
- Scenario: Sin terceros — GIVEN el paso THEN ejecuta el contenedor oficial de
  `actionlint`, no una action del marketplace

### Requirement: El gate arreglado expone el estado real
Tras esta fase, la compuerta de tipos DEBE reflejar los errores que existen.

- Scenario: Falla por el defecto conocido — GIVEN `npx tsc -b tsconfig.json --noEmit`
  THEN falla por `auth.service.spec.ts:227` (`string | null` no asignable a `string`)
- Scenario: Sin excepción temporal — GIVEN el gate en CI THEN bloquea desde su
  incorporación, sin lista de archivos exentos ni `continue-on-error`
- Scenario: Anotado con dueño — GIVEN `openspec/ROADMAP.md` THEN registra ese `TS2345`
  como defecto abierto: la fase lo expone a propósito y no lo arregla
