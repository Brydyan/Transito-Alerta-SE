# AGENTS.md — Mapa de navegación para agentes de IA

> Este archivo es el **punto de entrada** para cualquier agente que trabaje en este
> repositorio. NO es una biblia de reglas: es un **mapa**. Lee solo lo que
> necesites cuando lo necesites (divulgación progresiva).
>
> Nota: el arnés viejo (feature_list.json, init.sh, progress/, specs/ Kiro-style)
> fue retirado. El estado de las features vive en OpenSpec y la memoria persistente
> (Engram). No busques archivos de estado del arnés: no existen.

---

## 1. Antes de empezar (obligatorio)

1. Revisa el estado de **OpenSpec**: el change activo vive en
   `openspec/changes/<scope>/` (layout anidado: `{front, back, infra, archive}`)
   y el change archivado/movido refleja el estado real. Los specs canónicos
   (post-archive) viven en `openspec/specs/<dominio>/`.
2. Para contexto de sesiones pasadas usa la memoria persistente (Engram) o
   `docs/`. No hay bits de bitácora en archivos: la bitácora es Engram.
3. Antes de tocar specs o delegar, lee los agentes modernos en `docs/agents/`
   (`gemini-architect.md`, `minimax-builder.md`, `claude-qa.md`) y el proceso en
   `docs/sdd/specs.md`.

## 2. Mapa del repositorio

| Archivo / carpeta      | Qué contiene                                                                 | Cuándo leerlo |
|------------------------|------------------------------------------------------------------------------|---------------|
| `openspec/`            | Changes SDD (`changes/<scope>/...`) + specs canónicos (`specs/<dominio>/`)   | Siempre, al empezar |
| `docs/agents/`         | Definiciones/modernas de roles de agente (architect, builder, qa)            | Antes de delegar trabajo |
| `docs/sdd/`            | Proceso SDD: `specs.md`, `architecture.md`, `conventions.md`, `verification.md`, `MANUAL_SDD.md` (histórico) | Antes de especificar o verificar |
| `docs/tasks/`          | Documentación técnica legacy de tareas (migraciones, esquema, etc.)          | Contexto técnico si aplica |
| `CHECKPOINTS.md`       | Criterios objetivos de "estado final correcto"                               | Para auto-evaluarte |
| `frontend/`            | App Angular (standalone, signals, Tailwind)                                  | Para implementar/verificar |
| `backend/`             | API NestJS (permisos por controlladores)                                     | Para implementar/verificar |
| `database/`            | Migraciones SQL / seeders                                                    | Esquema y permisos |
| `compose.yaml`         | Infraestructura local (docker)                                               | Entorno de ejecución |

## 3. Reglas duras (no negociables)

- **Una sola change a la vez.** No mezcles cambios de varias changes en la misma sesión.
- **No declares una change implementada sin pruebas verdes.**
  - Frontend: `pnpm test` (todo PASS) + `pnpm run build` (exit 0).
  - Backend: suite de tests + build sin errores.
  - (No existe `pnpm lint`; `tsc -b --noEmit` tiene deuda preexistente conocida,
    no la agraves.)
- **No saltes la fase de spec.** Toda change pasa por spec + aprobación humana
  antes de tocar código.
- **No saltes la puerta de aprobación humana** entre spec y apply.
- **Deja el repositorio limpio** antes de cerrar la sesión (ver §5).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.

## 4. Flujo de trabajo (Spec-Driven con OpenSpec)

```
proposal → spec → design → tasks → apply → verify → archive
```

1. El change vive en `openspec/changes/<scope>/` (layout anidado por scope:
   `front`, `back`, `infra`, `archive`). El nombre canónico de un change de
   frontend es `front/<nombre-del-change>`.
2. Cada change tiene `proposal.md`, `specs/<dominio>/...`, `design.md`,
   `tasks.md`; durante el trabajo se mantiene `apply-progress.md`; al cerrar se
   audita con `verify-report.md` y se archiva moviendo el change a
   `openspec/changes/archive/<fecha>-<nombre>/`, sincronizando el delta en
   `openspec/specs/<dominio>/spec.md`.
3. Los `tasks.md` que quedan `[ ]` como deuda externa declarada (dependencia de
   otro change/backend) son honestos y NO bloquean el archive — se registran
   como follow-ups.
4. El archivo es la fuente de verdad del estado; nunca certifiques en
   `apply-progress`/`verify-report` algo que el código no hace. Si un hallazgo
   queda abierto, se anota con su ronda (`fixes-required.md`).

## 5. Cierre de sesión (lifecycle)

Antes de terminar:

1. Gates verdes: frontend `pnpm test` + `pnpm run build`; backend suite/build.
2. Guarda el contexto durable en **Engram** (`mem_save` / `mem_session_summary`).
3. No dejes archivos temporales, ni `print()` de debug, ni TODOs sin contexto.
4. No commitees: el humano commitea (working tree listo, sin staging residual).

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si la herramienta no hace lo que esperas, **no inventes un workaround**:
  documenta el bloqueo (Engram o conversación) y para la sesión.

## 7. AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## 8. Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.