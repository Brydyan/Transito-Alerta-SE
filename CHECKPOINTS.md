# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano.

## C1 — La base está completa

- [ ] Existen `AGENTS.md` y los docs de proceso en `docs/sdd/`
      (`architecture.md`, `conventions.md`, `specs.md`, `verification.md`).
- [ ] Gates verdes al cierre: frontend `pnpm test` + `pnpm run build`
      (exit code 0); backend suite + build sin errores.

## C2 — El estado es coherente

- [ ] Un solo change activo a la vez en `openspec/changes/<scope>/`.
- [ ] Toda change archivada tiene tests asociados que pasan y verify-report.
- [ ] El estado real vive en OpenSpec + Engram, no en archivos de bitácora
      sueltos ni basura de sesiones anteriores.

## C3 — El código respeta la arquitectura

- [ ] `src/` solo contiene los módulos previstos en `docs/architecture.md`.
- [ ] No hay dependencias externas en `requirements.txt` (debe estar vacío
      o no existir).
- [ ] No hay `print()` sueltos para debug, ni TODOs sin contexto.

## C4 — La verificación es real

- [ ] `tests/` tiene al menos un test por módulo de `src/`.
- [ ] Los tests usan `tempfile.TemporaryDirectory()`, no mocks de fs.
- [ ] `python3 -m unittest discover -s tests -v` muestra > 0 tests
      y todos verdes.

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (`*.tmp`, `__pycache__`
      fuera del `.gitignore`).
- [ ] La última change trabajada quedó reflejada en su estado correcto
      (`openspec/changes/` o `archive/`) y el contexto quedó en Engram.

## C6 — Spec Driven Development

- [ ] Toda change activa o archivada tiene su spec en OpenSpec
      (`openspec/changes/<scope>/<change>/specs/...` y `openspec/specs/`).
- [ ] Los specs usan la notación del proceso (`docs/sdd/specs.md`).
- [ ] Toda change archivada con `"sdd"` tiene sus tasks `[x]` o deuda externa
      declarada honestamente en `tasks.md`.
- [ ] Cada requisito de spec está cubierto por al menos un test concreto
      verificado en el gate del frontend/backend.

---

**Cómo usar este archivo:** un agente revisor (`docs/agents/claude-qa.md`)
recorre cada checkbox, marca `[x]` o `[ ]`, y rechaza el cierre de sesión
si quedan boxes vacíos en C1-C6.
