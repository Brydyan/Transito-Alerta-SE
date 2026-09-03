# Proposal: TOOL — Compuertas que comprueben lo que dicen comprobar

## Intent

Tres síntomas, un mismo defecto: **gates declarados que no verifican nada**. Y un gate
que no corre se lee exactamente igual que un gate que pasa.

| Síntoma | Efecto |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` compila **cero** archivos | Toda verificación de tipos del frontend es un no-op |
| `frontend/tsconfig.spec.json` declara `"types": ["jest"]`, sin `node` | 14 errores permanentes en `tsc -b`, que normalizan el rojo |
| `frontend/package.json` sin script `lint` | Varias fases exigen `pnpm lint` en sus tasks y no existe |

## Cuánto tiempo lleva mintiendo

`frontend/tsconfig.json` es de tipo *solution*: `"files": []` con sólo `"references"`.
Cualquier invocación que no use `-b` compila la lista vacía y sale 0.

Eso significa que **todo `npx tsc --noEmit` de la historia del proyecto fue vacío**. Hay
al menos cuatro artefactos archivados que lo declaran como evidencia:

```
openspec/changes/back/t3.6-invitations/verify-report.md:32
  «Typecheck: npx tsc --noEmit → ✅ exit 0, zero errors»

openspec/changes/front/2026-08-28-sc-207-…/tasks.md:42
  «T4.2 tsc --noEmit — zero errors»

openspec/changes/front/2026-08-28-sc-203-…/verify-report.md:33
  «Build (tsc --noEmit): PASSED — zero errors»
```

Ninguna de esas afirmaciones era falsa por descuido del autor: el comando salía 0 de
verdad. **Salía 0 porque no miraba nada.** Es el mismo mecanismo que dejó `ci.yml`
inválido durante días y el frontend de staging congelado en un build del 29 de agosto —
una comprobación cuyo verde no significaba lo que todos leían.

Se detectó en sc-324, donde la compuerta de typecheck se había adoptado *específicamente*
para no repetir un falso negativo de F0, y era ella misma un falso negativo.

## Scope

### In Scope
- **`-b` en toda compuerta declarada**: `docs/agents/*.md`, plantillas de `tasks.md`, y
  cualquier workflow que lo invoque
- **`"types": ["jest", "node"]`** en `frontend/tsconfig.spec.json` — una línea que cierra
  los 14 errores de golpe, en vez de cinco parches por archivo
- **Script `lint`** en `frontend/package.json`
- **`actionlint` como gate de CI** — ambos workflows ya pasan limpios, así que entra sin
  ruido y evita repetir el `schedule:` fuera de `on:` que dejó `ci.yml` inválido

### Out of Scope
- Corregir el `TS2345` real de `frontend/src/app/core/services/auth.service.spec.ts:227`
  (`string | null` no asignable a `string`). Es un defecto de tipos legítimo que la
  compuerta arreglada va a exponer, y arreglarlo es trabajo de producto, no de tooling.
  **Se anota con dueño**: sin cerrarlo, el gate nuevo nace en rojo
- Reestructurar `tsconfig.json` para que `-p` funcione — ver `design.md` D1
- Añadir reglas de lint nuevas. El script ejecuta la configuración que ya existe
- Corregir los artefactos archivados que declaran typechecks vacíos. Son registro
  histórico: se deja constancia acá, no se reescribe el pasado

## Capabilities

- `ci-gates` (nueva)

## Dependencias

Ninguna. No toca una sola línea que se ejecute en producción.

**No bloquea a nadie, y por eso conviene no postergarla indefinidamente**: su daño es que
todas las fases siguientes creen estar verificando tipos y no lo estén.
