# Tasks: alinear `auth.interceptor.spec.ts` con las rutas reales

**Change**: `2026-09-01-fix-auth-interceptor-spec-urls`
**Working dir**: `frontend`
**Archivo único**: `frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
**Agrupación**: Verificación → Corrección → Red de seguridad → Gates

> **Nota sobre Strict TDD**: acá no aplica el ciclo rojo→verde habitual. El test **ya
> está en rojo** y el código de producción es correcto — el defecto está en la aserción.
> La disciplina que sí aplica es la de T1: confirmar contra el backend antes de tocar
> nada, para no «arreglar» el test en la dirección equivocada.

---

## T1 — Verificar el contrato antes de editar

- [ ] **T1.1** — Confirmar el prefijo global: `backend/src/main.ts:30` debe decir
      `app.setGlobalPrefix('api')`, sin segmento de versión.
- [ ] **T1.2** — Confirmar que no hay versionado: `grep -rn "enableVersioning" backend/src`
      debe dar **cero**. Si diera algo, **pará** — la corrección va en la otra dirección
      y este change queda inválido.
- [ ] **T1.3** — Confirmar los controladores implicados: `@Controller('auth')` en
      `backend/src/modules/auth/auth.controller.ts:41` y `@Controller('incidents')` en
      `backend/src/modules/incidents/incidents.controller.ts:49`.
- [ ] **T1.4** — Confirmar la base del frontend: `apiUrl: '/api'` en
      `frontend/src/environments/environment.ts:3` y en `environment.development.ts:3`.

## T2 — Corregir las URLs del spec

- [ ] **T2.1** — Reemplazar las **11** apariciones de `/api/v1/` por `/api/` en
      `auth.interceptor.spec.ts` (líneas 54, 55, 62, 63, 73, 75, 78, 88, 93, 112, 121, 123).
      Las 11 van, no sólo las 2 que fallan — D2.
- [ ] **T2.2** — **No tocar** las aserciones de cuerpo ni de cabecera:
      `expect(refresh.request.body).toEqual({ refresh_token: 'rt-1' })`,
      `expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-1')`,
      `expect(retry.request.headers.get('Authorization')).toBe('Bearer jwt-2')`.
      Son correctas y son la parte del test que sí verifica el contrato real.
- [ ] **T2.3** — **No tocar** `expectNone((r) => r.url.includes('/auth/refresh'))` en
      E3.5: es agnóstico del prefijo y sigue siendo válido.
- [ ] **T2.4** — Actualizar el comentario de cabecera del archivo si menciona `/api/v1`,
      para que no quede contradiciendo al código de abajo.

## T3 — Impedir la reincidencia

- [ ] **T3.1** — Añadir al archivo un comentario breve, encima del primer `it`, que
      explique por qué las URLs se escriben a mano y por qué no llevan versión:
      el prefijo real es `setGlobalPrefix('api')`, no existe `enableVersioning`, y el
      literal escrito a mano es deliberado para que el test tenga una opinión
      independiente del `environment` (D3).
- [ ] **T3.2** — Añadir un test que falle si reaparece un segmento de versión: leer el
      propio archivo del spec y afirmar que no contiene `/api/v1`. Es el mismo patrón que
      `layout-tokens.regression.spec.ts` de F0. El test debe excluirse a sí mismo de la
      búsqueda si hace falta nombrar la cadena.

## T4 — Gates

- [ ] **T4.1** — `pnpm test` desde `frontend/`: **102/102 en verde**. Si queda alguna
      falla, no es de este change — reportala, no la absorbas.
- [ ] **T4.2** — `pnpm build` desde `frontend/`: verde.
- [ ] **T4.3** — Verificar con `git diff --stat` que el único archivo tocado bajo
      `frontend/src/` es `core/interceptors/auth.interceptor.spec.ts`, y que no hay
      nada bajo `backend/`.

---

## Definition of Done

- [ ] `pnpm test` en verde, **102/102**, desde `frontend/`
- [ ] `pnpm build` en verde
- [ ] Grep en cero para `api/v1` en `frontend/src/`
- [ ] Cero cambios en `auth.interceptor.ts`, `auth.service.ts` y `environments/*.ts`
- [ ] Cero cambios bajo `backend/`
- [ ] Test de regresión que falla si `/api/v1` reaparece en el spec
- [ ] El job `frontend` del CI llega al paso `build` (hoy corta en `test`)

---

## Fuera de alcance

| Qué | Por qué |
|---|---|
| Añadir `enableVersioning` al backend | D1 — desproporcionado y sin demanda |
| Otros specs del frontend que inventen URLs | Change aparte, si los hay |
| `docs/tasks/0-OVERVIEW.md:92` (origen del `/v1`) | Documento del arnés viejo, ya marcado como obsoleto |
| Cualquier cosa de F0 | Change distinto |
