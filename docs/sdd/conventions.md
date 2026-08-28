# Convenciones de código

> Homogeneidad extrema. La IA predice mejor cuando el repositorio se parece
> a sí mismo en todas partes.

## Estilo Python

- **Versión:** Python 3.9+ (sintaxis `list[str]` permitida).
- **Formato:** PEP 8. Líneas máximo 100 caracteres.
- **Imports:** stdlib primero, luego locales. Una línea por módulo.
- **Strings:** comillas dobles `"..."` siempre. Comillas simples solo
  para escapar comillas dobles dentro.
- **f-strings** para interpolación. Nada de `.format()` ni `%`.

## Nombres

| Tipo                    | Convención        | Ejemplo               |
|-------------------------|-------------------|-----------------------|
| Módulos                 | `snake_case`      | `notes.py`            |
| Clases                  | `PascalCase`      | `Note`                |
| Funciones / variables   | `snake_case`      | `load_notes`          |
| Constantes              | `UPPER_SNAKE`     | `DEFAULT_NOTES_PATH`  |
| Privadas                | prefijo `_`       | `_atomic_write`       |

## Estructura de archivo

Cada archivo en `src/` empieza con:

```python
"""Una línea describiendo el propósito del módulo."""
from __future__ import annotations

# imports stdlib
import json
import os

# imports locales
from src.notes import Note
```

## Tests

- Un archivo de test por módulo: `tests/test_<módulo>.py`.
- Una clase `Test<Cosa>(unittest.TestCase)` por unidad lógica.
- Cada test usa un `tempfile.TemporaryDirectory()` y limpia tras de sí.
- Nombres de test descriptivos: `test_load_returns_empty_when_file_missing`.

## Manejo de errores

Excepciones del dominio en `src/notes.py`:

```python
class NoteError(Exception):
    """Base para errores del dominio."""

class NoteNotFound(NoteError):
    """Se lanza cuando se busca una nota inexistente."""
```

El CLI captura excepciones del dominio, imprime mensaje a `stderr` y sale
con código 1. Nunca propaga stack traces al usuario.

## Comentarios

Por defecto **no** se escriben. Solo se permiten cuando explican un *por qué*
no obvio (p. ej. workaround documentado, invariante sutil). Los nombres deben
hacer el resto.

---

## Perfiles de test (Backend NestJS)

> Añadido 2026-08-27 por el change `2026-08-26-t8-database-cutover` (D8.1.E3).
> La sección Python de arriba es legacy de un repo anterior; este bloque es
> el que aplica al backend `Transito-Alerta-SE`.

La suite de tests del backend tiene **tres perfiles**, cada uno con su
propio comando npm. La separación existe para que el pipeline de PR no se
vuelva inutilizable cuando un test tarda varios minutos.

| Perfil          | Comando                       | Qué corre | Dónde corre en CI                                |
|-----------------|-------------------------------|-----------|---------------------------------------------------|
| Unit            | `pnpm test`                   | `*.spec.ts` bajo `src/` y `test/unit/` — mocks `@nestjs/testing` | `backend` (lint/typecheck/build/test) — **en cada PR** |
| E2E (general)   | `pnpm run test:e2e`           | `test/e2e/*.e2e-spec.ts` — Testcontainers Postgres+PostGIS+Redis | job `integration` — **en cada PR** (si el path filter detecta cambios en `backend/**` o `database/**`) |
| E2E (cutover)   | `pnpm run test:e2e:cutover`   | `test/e2e/{t7-integrity-referential,t7-rollback-cycle,cutover-validation}.e2e-spec.ts` — Testcontainers, suite pesada (4-5 min) | job `cutover` — **sólo en push a `main`** + nightly (`0 2 * * *`). **Nunca en PRs.** |

### Reglas

- **Un test va al perfil `cutover` si y sólo si** cumple al menos una de:
  1. Tarda > 60s contra un Testcontainers limpio (auditorías de 41 archivos).
  2. Recorre el esquema completo vía `information_schema` (inventarios
     dinámicos) — la cobertura de cada test crece con cada nueva migración,
     así que su duración también.
  3. Verifica artefactos operativos (runbook, script de rehearsal, queries
     de monitoreo) que no son código de la app.
- **Cualquier otro test e2e va al perfil `general`**, sin excepciones.
  Esto preserva la utilidad del pipeline de PR como gate diario.
- Si un test del perfil `cutover` baja de 60s gracias a una optimización,
  moverlo al perfil `general` y eliminarlo del `testPathPattern` del script
  npm. El comentario al lado del `it(...)` debe referenciar el task que
  justificó la promoción (`// T8.2.B4: parallelized, moved to general`).

### El `testPathPattern` del script `test:e2e:cutover`

```json
"test:e2e:cutover": "jest --config ./test/jest-e2e.json --testPathPattern='(t7-(integrity-referential|rollback-cycle))|cutover-validation' --runInBand"
```

- `--runInBand` es obligatorio: los specs de este perfil comparten el
  schema de Testcontainers vía un solo `PostgresContainer` por spec, y
  Jest en paralelo (workers > 1) abre N conexiones que en este caso sólo
  complican el `applyMigrations()` compartido del harness.
- Si se agrega un nuevo spec al perfil, su nombre de archivo debe
  matchear este regex (o actualizar el regex + este bloque al mismo
  tiempo — la doc y el script son un par sincronizado).
