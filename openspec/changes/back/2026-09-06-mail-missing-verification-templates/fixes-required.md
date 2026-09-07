# Fixes Required: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Ronda de verify**: 3
**Fuente**: `verify-report.md` de esta misma ronda

**Estado: sin CRITICAL abiertos.** El CRITICAL-CI de la ronda 2 (particionado de e2e roto
por el `--` de `pnpm run`) está cerrado y confirmado por ejecución real de la línea literal
del YAML, comparación de conjuntos, y una corrida completa de una partición. El WARNING-A
(C.2 tautológico) está commiteado, no deja nada colgando, compila, y las dos afirmaciones
de su comentario de reemplazo se comprobaron por mutación de forma independiente.

---

## CRITICAL-CI (`pnpm run test:e2e -- --shard=N/4`) — ✅ RESUELTO, confirmado en ronda 3

Fix aplicado en `ci.yml:238` (commit `3f3a6fa`): se quitó el separador `--`. Confirmado
esta ronda:

- Las cuatro particiones (`pnpm run test:e2e --shard=N/4 --listTests`) listan 14/14/13/13
  archivos — ninguna da "No tests found".
- La unión de las cuatro es exactamente el conjunto completo de 54 archivos
  (`npx jest --config ./test/jest-e2e.json --listTests`), comparado por `diff` de conjuntos
  ordenados: vacío. Sin solapamiento (`uniq -d`: vacío).
- Al menos una partición completa corrida de verdad (shard 2/4, sin `--listTests`): 14/14
  suites, 113/113 tests, verde.
- `integration-gate` revisado en los cuatro estados posibles de `needs.integration.result`
  (`success`, `skipped`, `failure`, `cancelled`): ningún camino deja el agregador en verde
  con una partición rota.

No re-abrir sin nueva evidencia.

---

## CRITICAL-1 (SMTP_HOST) — ✅ RESUELTO, confirmado en rondas 2 y 3

`test-environment.ts` fuerza `process.env.SMTP_HOST = ''` antes de
`createNestApplication()`. Confirmado sin overrides manuales en el subconjunto (6/6, 27/27)
y en el e2e completo (54/54, 470/470) de esta ronda. No re-abrir sin nueva evidencia.

---

## WARNING-A (C.2 tautológico) — ✅ RESUELTO y COMMITEADO, confirmado en ronda 3

`ENQUEUED_TEMPLATE_NAMES` y el `describe` de C.2 fueron borrados (commit `3f3a6fa`).
Confirmado esta ronda:

- Cero referencias colgando a `ENQUEUED_TEMPLATE_NAMES` en `src`/`test`.
- `npx tsc --noEmit` → exit 0.
- Afirmación del comentario de reemplazo ("la cobertura la garantiza `Record<TemplateName,
  TemplateFn>` al compilar"): comprobada por mutación — quitar una entrada de `TEMPLATES`
  dejando el nombre en el union hace fallar el typecheck con `TS2741` en la línea de
  `TEMPLATES`.
- Afirmación del comentario de reemplazo ("el caso runtime vive en
  `mail-outbox.consumer.spec.ts`"): comprobada por mutación — romper la detección de
  nombre desconocido en el consumidor hace caer exactamente
  `sends an unknown template straight to mail:dead (data defect)`.
- Regresión de la suite unitaria: −1 test exacto (1024→1023, 111 suites sin cambio),
  consistente 1:1 con el único test borrado. Ninguna otra suite se vio afectada.

No re-abrir sin nueva evidencia.

---

## WARNING (no bloquean, pero deberían registrarse)

- **Árbol sin commitear**: `apply-progress.md` tiene un diff narrativo sin commitear (fechas,
  rama, resumen de commits). No es código, no afecta ninguna compuerta. Recomendado
  commitearlo antes de archivar.
- **Frontend `npx tsc -b --noEmit` sigue en rojo** por los mismos 3 specs preexistentes de
  las rondas 1-2, no tocados por este change. Sigue sin ticket propio.

---

## SUGGESTION

- El comentario de `mail-templates.ts:113` dice "C.2 de la ronda 14" — nomenclatura de una
  convención anterior a sc-330. No afecta la lógica, señalado desde la ronda 2, sigue sin
  corregirse.

---

## Qué NO hace falta rehacer

Todo lo verificado en rondas anteriores con evidencia de ejecución real + mutación sigue en
pie sin cambios: B.1/B.2, D.1, E.1-E.6, F.1-F.3, G.1-G.4/G.6, H.1-H.7, la mutación de
IPv4-mapped IPv6 en `proxy-trust.ts`. No re-tocado esta ronda, fuera del alcance del
material nuevo (el arreglo de CI y el borrado de WARNING-A).

**Next recommended**: `sdd-archive`.
