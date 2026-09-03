# Roadmap — Migración de frontend y cierre de paridad

> **Punto de entrada para sesiones nuevas.** Este archivo fija el orden, las decisiones
> ya cerradas y los hechos verificados del código, para que nadie los vuelva a discutir
> ni los redescubra.
>
> Fecha: 2026-08-29 · **Revisado 2026-09-02** (cadena REG → ANON → AUD; el ciudadano deja
> de reportar sin sesión) · Artefactos SDD: `openspec/changes/` · Tickets: epic 192
> «⚠️ GeoReporta» (workspace `upse`)

---

## Contexto en una línea

El código de GeoReporta se borró; **`docs/mock/` (18 PNG, 11 vistas) es la única fuente
de verdad visual**. El backend está muy por delante del frontend: 20 módulos de dominio
contra 8 rutas.

---

## Orden de ejecución

```
F0 ──┬──► F1 ──┬──► F2 ──┬──► F3 ──► F4 ──► F7
     │         │        │      ▲      ▲      ▲
     │         │        └──────┤      │      │
     │         └──► F5         │      │      │
     │                    315 ─┘      │      │
     └──► F6 ◄── F2                   │      │
                                      │      │
   REG ──► ANON ──► AUD ──────────────┴──────┘
```

La cadena **REG → ANON → AUD** es independiente de F1–F3: sólo toca backend, esquema y
una pantalla pública. Puede avanzar en paralelo. Lo que **no** admite es reordenarse
internamente — ver «Ciudadano» más abajo.

| # | Fase | Story | Est. | Qué hace |
|---|---|---|---|---|
| 1 | **F0** Design system ✅ | [300](https://app.shortcut.com/upse/story/300) | 5 | Tokens violeta, Outfit, Lucide, 6 primitivos — **completada y archivada 2026-09-02** |
| 2 | **F1** Navegación ✅ | [303](https://app.shortcut.com/upse/story/303) | 2 | Arregla el 404 del sidebar — **completada y archivada 2026-09-02** |
| — | **324** Test de contraste ✅ | [324](https://app.shortcut.com/upse/story/324) | 2 | Cierra el único requisito de `design-system` sin cobertura. **Completada y archivada 2026-09-02** |
| 3 | **315** Fix estados | [315](https://app.shortcut.com/upse/story/315) | 3 | Habilita `closed`, declara la máquina |
| 4 | **F2** Catálogos | [304](https://app.shortcut.com/upse/story/304) | 8 | Ubicaciones, Categorías, Organizaciones |
| 5 | **F3** Incidencias | [305](https://app.shortcut.com/upse/story/305) | 8 | Listado, detalle, comentarios, workflow |
| — | **REG** Auto-registro | [325](https://app.shortcut.com/upse/story/325) | 5 | El ciudadano puede crearse cuenta. **Hoy no puede** |
| — | **ANON** Cerrar sin sesión | [326](https://app.shortcut.com/upse/story/326) | 3 | Retira el reporte anónimo sin cuenta |
| — | **AUD** Auditoría y revelación | [327](https://app.shortcut.com/upse/story/327) | 8 | Autoría sellada, `REVEAL` sólo `master`, auditoría |
| 6 | **F4** Ciudadano | [306](https://app.shortcut.com/upse/story/306) | 13 | Feed, asistente 4 pasos, mapa, publicación anónima |
| 7 | **F7** Emergencias | [316](https://app.shortcut.com/upse/story/316) | 8 | Telegram + carga + aislamiento org |
| 8 | **F5** Menús dinámicos | [307](https://app.shortcut.com/upse/story/307) | 13 | Menús en BD, matriz rol×lectura/escritura |
| 9 | **F6** Rediseño | [308](https://app.shortcut.com/upse/story/308) | 5 | Dashboard, Usuarios, Roles, Perfil |

**Empezar por F0 → F1. 315 antes de F3. REG antes de ANON, sin excepción.**

Las dependencias de la cadena están además declaradas como enlaces «blocks» en Shortcut
(325→326→327→{306, 316}), no sólo en este documento: un orden que sólo vive en un `.md`
se salta sin que nada se entere.

---

## Qué hace cada fase

### F0 — Design system ✅ · `archive/2026-08-29-f0-design-system-mock-alignment/`
Paleta navy/hi-vis → violeta del mock. Barlow Condensed → Outfit. Iconos unificados en
Lucide. Sidebar blanco con secciones. Seis primitivos: `ui-badge`, `ui-card`,
`ui-button`, `ui-table`, `ui-page-header`, `ui-kpi-card`.

**Completada y archivada** (2026-09-02, 4 pasadas de `sdd-verify`, 0 CRITICAL,
192/192 tests). Spec consolidado en `openspec/specs/design-system/spec.md`.

**Bloqueaba todo.** Sin primitivos estables, cada fase inventaba su propio botón —
ya no aplica, F1–F6 pueden consumir los primitivos.

**Deuda que dejó abierta, con dueño:**

| Qué | Dónde se cierra |
|---|---|
| ✅ El requisito de contraste no tiene test automatizado | [sc-324](https://app.shortcut.com/upse/story/324) · `archive/2026-09-02-contrast-regression-test/` — cerrada |
| Alias de puente `brand-navy`/`brand-hivis` vivos (21 consumidores) | [sc-323](https://app.shortcut.com/upse/story/323) · F6 |
| **12 archivos de `features/` sin icono** — `bi bi-*` sin hoja de estilos | F1–F6, pantalla por pantalla |
| ✅ `transformBackendMenu()` no popula `group`; el backend tampoco lo envía | F1 (cerrada 2026-09-02) · `archive/2026-08-29-f1-menu-routing-alignment/` |
| `ui-table` no encapsula: los consumidores deben recordar las helper classes | sin asignar |

La tercera es una **regresión visual viva**: F0.2.5 retiró Material Symbols y Bootstrap
Icons del `index.html`, y esos 12 archivos renderizan hueco hoy, no «con estilo viejo».
Se difirió a propósito —esas pantallas se rediseñan igual— pero conviene no confundirla
con trabajo pendiente neutro.

### F1 — Navegación ✅ · `archive/2026-08-29-f1-menu-routing-alignment/`
`MENU_MAP` apunta a rutas que no existen en `app.routes.ts` → las 5 entradas del sidebar
caen al wildcard 404. Reescribe el mapa en español con `group` y `order`, registra
placeholders para destinos futuros, engancha el huérfano `citizen-report`.

**Completada y archivada** (2026-09-02, 3 pasadas de `sdd-verify`, 0 CRITICAL, 883/883 tests backend, 227/227 frontend). Spec consolidado en `openspec/specs/admin-panel-backend/spec.md` con 5 requisitos nuevos (Grupo 0).

Entregable de fondo: **`menu-map.spec.ts`**, test que falla si rutas y menú divergen otra vez.

### 315 — Fix máquina de estados · `back/2026-08-29-fix-incident-state-machine/`
`closed` está en BD y en el tipo pero excluido de `ALLOWED_STATUSES`. Además conviven dos
semánticas contradictorias. Declara el grafo en `incident-state-machine.ts`, deriva
`ALLOWED_STATUSES` de él, añade permiso `CLOSE incidents`.

**Bloquea F3** — `workflow.util.ts` deriva de este grafo.

### F2 — Catálogos · `front/2026-08-29-f2-catalogs-crud/`
Tres módulos con backend completo y cero frontend. Orden interno: Categorías (fija el
patrón) → Organizaciones (lo copia) → Ubicaciones (árbol de 4 niveles).

Entrega además `*hasPermission` y `permissionGuard`, que F3 y F6 reutilizan.

### F3 — Incidencias · `front/2026-08-29-f3-incidents-module/`
El dominio central sin una sola pantalla. Listado con filtros en URL, filtro jerárquico
de categorías, detalle con historial, galería, mini-mapa y comentarios.

**Primera tarea, antes de maquetar: revalidar contratos.** `incident.service.ts` y
`comment.service.ts` existen sin consumidor; su mapeo nunca tocó el wire real.

### Ciudadano — la cadena REG → ANON → AUD · añadida 2026-09-02

Nace de una decisión de producto: **el ciudadano se registra y puede publicar de forma
anónima; el reporte sin sesión desaparece.** Antes, la única forma de reportar sin cuenta
era la identidad `device_uuid = 'anonymous'`, que es **una sola fila compartida por todos
los anónimos** y por tanto no rastreable por construcción.

El equipo quiere poder **sancionar la información falsa**. Eso es incompatible con esa
identidad compartida, y de ahí las tres fases.

#### REG — Auto-registro · `front/2026-09-02-reg-citizen-self-registration/`
Hoy `POST /auth/register` responde **410 Gone** (`auth.controller.ts:54`, T6.8.C1): el
alta es sólo por invitación. Correcto para el personal, y deja fuera al ciudadano. REG lo
revierte **sólo para `reporter`**; el rol es constante del servidor, nunca dato de la
petición. Reutiliza `EmailVerificationService` y `email_verified_at`, que ya existen.

#### ANON — Cerrar el reporte sin sesión · `back/2026-09-02-anon-close-anonymous-reporting/`
Vacía `anonymousPermissions` y rechaza el login con `device_uuid = 'anonymous'`. **La
fila máscara sobrevive**: AUD la recicla como identidad de publicación.

Alcance quirúrgico: se cierra **la rama** `device_uuid === 'anonymous'`, no la forma de
credencial `{device_uuid}` — los 122 tests e2e la usan.

#### AUD — Auditoría y revelación · `back/2026-09-02-aud-audit-trail-and-identity-reveal/`
La primera tabla de auditoría del proyecto. `incident_reporters` guarda al autor real de
una publicación anónima; `incidents.citizen_id` apunta a la máscara, así que **la tabla
principal no contiene la identidad**. Revelarla es un `POST` con motivo obligatorio que
deja registro, y el permiso `REVEAL incidents` lo tiene **sólo `master`**.

**Bloquea también a F7**, cuya decisión cerrada («excepción al tope con motivo y autor
registrados») necesita la misma auditoría. Se construye una vez.

**El orden no es negociable:**

```
REG ──► ANON ──► AUD
```

Cerrar el reporte sin sesión antes de que exista el registro deja una ventana en la que
**ningún ciudadano puede reportar nada**. Primero la puerta nueva.

### F4 — Ciudadano · `front/2026-08-29-f4-citizen-feed-wizard-map/`
Dos fases con compuerta (B no se integra antes que A).
- **A (backend)**: tablas `incident_followers` e `incident_corroborations`
- **B (frontend)**: asistente de 4 pasos con borrador en IndexedDB, feed con carga
  incremental, mapa Leaflet con clustering, **publicación anónima con sesión**

**Depende de REG, ANON y AUD.** Sus tareas `B.2.11`–`B.2.13` se reescribieron el
2026-09-02: describían el flujo sin sesión, que ya no existe.

### F7 — Emergencias · `back/2026-08-29-f7-emergency-dispatch/`
Dos bloques independientes.
- **A**: corrige que `assign()` no valide el tope **ni el alcance por organización** —
  defectos que ya afectan a producción
- **B**: Telegram avisa al `admin_org` ante `critical`; recordatorio cada 5 min mientras
  siga en `pending`, escalado a los 30 min, corte a la hora

### F5 — Menús dinámicos · `back/2026-08-29-f5-dynamic-menus/`
Sustituye `MENU_MAP` por 4 tablas: jerarquía, matriz rol×lectura/escritura, endpoints
asociados, más la pantalla de administración (mock 05-01).

Va al final porque F1 ya dejó la navegación funcionando: aquí no hay urgencia operativa.

### F6 — Rediseño · `front/2026-08-29-f6-redesign-existing-screens/`
Las 4 pantallas preexistentes quedaron con paleta nueva y maquetación vieja. Orden:
Perfil → Roles → Usuarios → Dashboard.

**Regla:** los specs existentes deben pasar **sin editar aserciones**. Si hay que tocar
una, se cambió comportamiento y eso está fuera de alcance.

---

## Decisiones cerradas — NO reabrir

| Tema | Decisión |
|---|---|
| Paleta | Violeta del mock. `--color-brand-hivis` se elimina, no se deja huérfano |
| Tipografía | Outfit (inferida de los PNG). Aislada en `--font-sans` |
| Iconos | Lucide, familia única. El backend ya emite nombres Lucide |
| Prioridades | **Cuatro**: `low`, `medium`, `high`, `critical`. Los mocks sólo dibujan tres |
| Emergencia | Es `priority = 'critical'`. **No** un tipo de incidencia aparte |
| Estados | Cuatro, **ramificados**: `resolved` y `closed` son terminales alternativos |
| `critical` al crearse | Nace en `pending`, **no** salta a `in_progress` |
| Cerrar incidencia | Sólo `admin_org` y `master`, vía permiso `CLOSE incidents` |
| `pending → closed` | Permitido, para descartar reportes inválidos o duplicados |
| Perfil en el sidebar | **Fuera** — ya está en el menú de usuario del encabezado |
| Grupos del sidebar | `CATÁLOGOS` sólo para tablas de referencia (Categorías, Ubicaciones) |
| Roles de cliente | No existen como catálogo aparte. `roles` es global |
| Bot de Telegram | Una vía: notifica y enlaza. No se asigna desde Telegram |
| Destinatario de emergencia | `admin_org`, **no** un grupo de operadores |
| Notificación al operador | Sólo al **asignado**, nunca a todos |
| Excepción al tope | Limitada a `critical`, con motivo y autor registrados |
| Permiso de excepción | **No** se añade `OVERRIDE assignments` — `ASSIGN` ya está bien acotado |

### Añadidas 2026-09-02 — el ciudadano

| Tema | Decisión |
|---|---|
| Reporte sin sesión | **Se retira.** El ciudadano es `reporter` autenticado. Revierte el alcance que F4 había reincorporado el 2026-08-29 |
| Publicación anónima | Con sesión. `citizen_id` apunta a la máscara; el autor real se sella en `incident_reporters` |
| El nombre correcto | Es **seudonimato sellado**, no anonimato. El sistema sabe; nadie lo ve; hay procedimiento para abrirlo |
| Aviso al ciudadano | **Obligatorio y visible sin interacción.** Un mecanismo de revelación oculto no disuade a nadie y convierte la etiqueta «anónimo» en una afirmación falsa |
| Quién revela | **Sólo `master`.** El cliente no pidió esta capacidad; ampliarla a `admin_org` sería decidir por él |
| Auto-registro | Concede **siempre y sólo** `reporter`. El rol es constante del servidor, nunca dato de la petición |
| Invitación | Sigue siendo el **único** camino a los roles de personal |
| Correo verificado | Exigido para **publicar**, no para entrar. Sin eso el auto-registro genera cuentas desechables y el sello de AUD no vale nada |
| Existencia de cuentas | El alta **no** revela si un correo ya está registrado. Un 409 convierte el endpoint en oráculo |
| Cifrado de `incident_reporters` | **Fuera de alcance hoy.** Tabla aparte para que endurecer sea migración, no reescritura |
| Renderizado | Sigue siendo **SPA estática**. Si aparece superficie pública indexable, la herramienta es prerender de rutas puntuales, no SSR completo |

---

## Hechos verificados del código

Comprobados contra migraciones y fuente. **No re-derivar.**

- **Roles: son cinco**, no cuatro. `master`, `operador_sistema`, `admin_org`,
  `operador_org` y **`reporter`** (el ciudadano, sembrado en `0009`). `users.js` no crea
  ningún usuario con `reporter`, por eso pasa desapercibido
- **El anónimo no tiene rol, y es deliberado.** Sus permisos salen de `auth.config.ts` →
  `anonymousPermissions`, no de `roles`. `AuthService.getPermissions` ramifica por
  `device_uuid === 'anonymous'`. Ampliar `reporter` nunca amplía el techo anónimo
- **`roles` no tiene `organization_id`** — catálogo global con `name` único
- **`critical` ya existe** en `0004_incidents.sql:27` y en todo el backend
- ~~**El reporte anónimo de emergencia ya está soportado**~~ — cierto hasta el
  2026-09-02. **ANON lo retira.** `auth.config.spec.ts:56` afirma hoy lo contrario de lo
  que debe afirmar cuando ANON se integre: ese test se **invierte**, no se borra

### Verificados el 2026-09-02

- **`incidents.citizen_id` es `NOT NULL REFERENCES users (id)`**
  (`0004_incidents.sql:30`). La autoría vive en la tabla principal: ocultar al autor no
  es sólo filtrar en la API. De ahí la máscara de AUD/D1
- **`POST /auth/register` responde 410 Gone** (`auth.controller.ts:54`, T6.8.C1) — lápida
  deliberada, alta sólo por invitación. **Hoy un ciudadano no puede crearse cuenta**
- **No hay pantalla de registro.** `frontend/src/app/features/auth/` tiene
  `login`, `accept-invitation`, `forgot-password`, `reset-password`, `verify-email`
- **La verificación de correo por OTP ya existe** — `EmailVerificationService`,
  `email_verified_at`, columnas OTP de `0028_users_otp_compliance.sql`. REG la consume,
  no la construye
- **Los 122 tests e2e autentican con `{device_uuid}`** —
  `exactly-one-credential.validator.ts:24`. Esa forma de credencial **no se toca**;
  ANON cierra sólo la rama `=== 'anonymous'`
- **El frontend es SPA estática, sin SSR.** Builder `@angular/build:application` con sólo
  `browser`; sin `@angular/ssr`, sin `platform-server`, sin `server.ts`;
  `nginx.conf:42` hace `try_files $uri $uri/ /index.html`
- **Cero rutas públicas hoy.** `path: ''` redirige a `login` y todo `/app/**` está tras
  `authGuard`. El «Volver al inicio» del login es `href="#!"` — un enlace muerto
- **`@nestjs/schedule@6.1.3` instalado**; **no hay tabla de auditoría**; **la acción
  `CLOSE` no existe** en el `CHECK` de `permissions.action`
- **`users.permissions` es copia denormalizada de `roles.permissions`.** Toda migración
  que conceda permisos debe tocar **ambas tablas** e invalidar `perm:v3:uid:*`
- **`menu:v1:*` y `perm:v3:uid:*` son espacios distintos.** Confundirlos ya costó una
  sesión de depuración
- **`SnakeCaseResponseInterceptor`** reescribe toda respuesta: los modelos frontend se
  derivan del **controlador**, no de la clase DTO

---

## Defectos abiertos

| Defecto | Dónde | Cubierto en |
|---|---|---|
| ✅ `closed` inalcanzable desde el flujo | `incident-workflow.service.ts:31,46` | 315 (verify PASS 2026-09-03, pendiente archivar) |
| **Lista de estados a mano en analíticas** — `by_status` enumera los cuatro estados como literal, tercer origen de verdad tras eliminar `LEGAL_TRANSITIONS` | `incident-analytics.service.ts:125` | Sin ticket — fuera del alcance declarado de 315, detectado en su 2ª pasada |
| ✅ **Inventario de filas `closed` preexistentes** — ejecutado contra staging el 2026-09-03: **0 filas**. Sin migración de datos que hacer, como preveía D6 (el servicio nunca pudo escribir ese estado) | `database/migrations/0043`, `0044` | 315 / D6 — cerrado |
| `assign()` no valida el tope de carga | `assignments.service.ts:28-36` | F7 / A.2 |
| Escrituras de asignación sin acotar por organización | `assignments.controller.ts` | F7 / A.5 |
| ✅ Sidebar cae al 404 | `menu-map.ts` ↔ `app.routes.ts` | F1 (cerrada 2026-09-02) · `archive/2026-08-29-f1-menu-routing-alignment/` |
| **El ciudadano no puede registrarse** — F4/B.2.12 ofrecía un registro inexistente | `auth.controller.ts:54` (410) | REG |
| **El reporte sin sesión no es rastreable** — identidad compartida por todos los anónimos | `auth.config.ts:74` | ANON + AUD |
| **No hay tabla de auditoría** — F7 la necesita para la excepción al tope | — | AUD |
| «Volver al inicio» del login es `href="#!"` | `login.component.html:147` | REG (apunta a `/registro`) |
| **Compuerta de typecheck es un no-op** — `npx tsc -p tsconfig.json --noEmit` revisa 0 archivos (`files: []`); el comando real es `npx tsc -b tsconfig.json --noEmit` | `frontend/tsconfig.json` + `frontend/tsconfig.spec.json` | Sin ticket — detectado en sc-324; afecta toda ejecución de verificación de tipos en el frontend |

**Patrón común: reglas implementadas a medias** — aplicadas en el camino por donde entró
la funcionalidad y no en el añadido después.

| Regla | Implementada en | Ausente en |
|---|---|---|
| Cuatro estados | BD + tipo | Servicio de flujo |
| Tope de carga | `claim` | `assign` |
| Alcance por organización | Lecturas | Escrituras |

**Pendiente y no ticketeado:** auditar el backend con esa misma lente — soft delete,
alcance por organización en otros módulos, guards de permiso, y DTOs que asuman camelCase.

### Compuertas que no comprueban lo que dicen → **TOOL** · [sc-329](https://app.shortcut.com/upse/story/329) · `front/2026-09-03-tool-ci-gates/`

Tres síntomas, un mismo defecto. **Un gate que no corre se lee igual que un gate que
pasa**, y es la clase de problema que costó tres pasadas en F1.

| Síntoma | Efecto |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` compila **cero** archivos (`files: []`) y sale 0 siempre | Toda verificación de tipos del frontend es un no-op. El comando real es `npx tsc -b` |
| `frontend/tsconfig.spec.json` declara `"types": ["jest"]`, sin `node` | 14 errores permanentes en `-b`, que normalizan el rojo. **Una línea los cierra** |
| `frontend/package.json` sin script `lint` | `tasks.md` de varias fases exige `pnpm lint` y no existe |

Incluye **actionlint** como gate: ambos workflows ya pasan limpios, así que entra sin
deuda previa. Justifica su existencia el `schedule:` suelto que dejó `ci.yml` **inválido**
desde `351eec0` sin que nadie lo notara.

**Cuánto lleva mintiendo:** al menos cuatro artefactos archivados declaran
`npx tsc --noEmit → 0 errors` como evidencia (`t3.6-invitations/verify-report.md:32`,
`sc-207/tasks.md:42`, `sc-203/verify-report.md:33`). Ninguno era falso por descuido: el
comando salía 0 de verdad, **porque no miraba nada**.

**El gate nace en rojo a propósito.** Al arreglarlo aflora un `TS2345` legítimo en
`frontend/src/app/core/services/auth.service.spec.ts:227` (`string | null` no asignable a
`string`). TOOL lo expone y **no** lo arregla: decidir si `organization_name` puede ser
nulo en `InvitationPreview` es una pregunta de dominio, no de herramientas.

### e2e sin credenciales válidas → **E2E** · [sc-328](https://app.shortcut.com/upse/story/328) · `front/2026-09-03-e2e-test-user-and-credentials/`

`auth-flow.e2e.ts:69` entra con `admin@correo.com` / `123456`, credenciales que
`database/seeds/users.js` no crea — vienen del GeoReporta original. `comment-flow` y
`menu-navigation` dependen del mismo login.

Mientras `vars.STAGING_BASE_URL` estuvo sin definir, los specs se saltaban y el fallo
estaba tapado. Ahora corren y fallan: **no es una regresión, es el mismo defecto ahora
visible.** Una corrida llegó a 9m44 antes de que `efe021f` acotara la suite
(`globalTimeout`, `maxFailures: 3`, `retries: 1`).

Entrega un usuario dedicado `e2e@tase.local` con rol **`operador_org`** —no `master`, que
atraviesa los guards sin que ninguno decida nada— credenciales por entorno, y caché de los
navegadores de Playwright, que hoy se descargan enteros en cada corrida mientras el store
de pnpm sí se cachea.

**Bloquea de hecho el flujo de PR**: un rojo permanente es un rojo que se deja de mirar.

### Deuda con fecha de caducidad — heredada de F1

`menu-map.spec.ts` valida que cada **segmento** de una ruta de `MENU_MAP` exista en
`app.routes.ts`, pero **no la jerarquía**: `/app/categorias` y `/app/admin/categorias` le
resultan indistinguibles.

Hoy no es alcanzable (10 entradas, 2 rutas multi-segmento, ambas reales). **Se vuelve
alcanzable a medida que el menú crezca**, y F2, F3 y F4 añaden destinos. **Dueño natural:
F5**, que sustituye `MENU_MAP` por tablas en BD y rehace ese test igual.

---

## Trampas conocidas

- Los **mocks describen menos que el esquema**. `critical` no se maquetó; los estados van
  al revés (el mock dibuja «Cerrada» y el servicio no la admite). **Contrastar mock ↔
  esquema ↔ servicio antes de implementar**
- Un **servicio sin consumidor es un contrato sin verificar**. Precedente: SC-209 declaró
  `size_bytes` mientras el wire emitía `file_size`, y sobrevivió porque el test afirmaba
  sobre la URL en vez de sobre la carga
- Tras reseedear la base, **vaciar Redis** antes de probar login o menús

---

## Fuera de código

- **Revocar la API key de Firebase** del proyecto `auth-92411` (pertenece a un compañero
  del GeoReporta original) y cerrar la alerta #1 de GitHub como *revoked*
- **Purga del historial** de `GeoReporta/` pendiente de coordinar: sólo 2 commits la
  tocan (`3ad8267`, `db94337`), pero el primero está en casi todas las ramas. 2
  colaboradores. Reescribir **no** sustituye revocar la key

---

## Referencias

- Artefactos SDD: `openspec/changes/{front,back}/2026-08-29-*/`
- Reglas de formato: `openspec/config.yaml` (`strict_tdd: true`, `working_dir: backend`)
- Rol del arquitecto: `docs/agents/gemini-architect.md` — **lo ejecuta Claude desde
  2026-09-01** (se agotó el plan de Gemini). Salvaguardas del rol doble en
  `docs/agents/claude-qa.md`, sección «Rol doble»
- Mocks: `docs/mock/*.png`
- Índice del legacy (consultable, sin código): `GeoReporta/.codegraph/codegraph.db`
