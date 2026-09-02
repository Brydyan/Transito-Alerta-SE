# Design: F5 — Menús dinámicos administrables

## Technical Approach

Se sustituye una constante de TypeScript por cuatro tablas y un resolutor. El riesgo
concentrado es de **regresión**: es la misma superficie que F1 acaba de arreglar, y
romperla otra vez deja el producto sin navegación.

Por eso el orden es: esquema → migración de datos → lectura desde base de datos con
el contrato intacto → recién entonces CRUD y pantalla. La parte peligrosa se valida
sola, antes de que haya interfaz encima.

## Architecture Decisions

**D1 — El contrato de `GET /api/menus/my` no cambia.**
El resolutor nuevo emite exactamente `{ label, route, icon?, group?, order }` (más
`children` para la jerarquía). `MenuService`, `menuResolver` y el sidebar del frontend
no se tocan. Alternativa rechazada: aprovechar la reescritura para «mejorar» el
contrato. Motivo: mezclar el cambio de origen de datos con un cambio de forma haría
imposible atribuir una regresión a una de las dos causas.

**D2 — La matriz de menú convive con el sistema de permisos; no lo reemplaza.**
Distinción deliberada:

- `users.permissions` sigue gobernando **la API** (qué endpoints puede invocar)
- `menu_option_roles` gobierna **la navegación** (qué secciones se ven y en cuáles
  se puede escribir)

Alternativa rechazada: derivar el menú de los permisos, como hace `MENU_MAP` hoy con
`requires`. El mock exige lectura y escritura por opción y por rol, granularidad que
un único permiso booleano por entrada no expresa. Y la inversa —derivar los permisos
del menú— convertiría una pantalla de administración en el control de acceso de la
API, que es una superficie mucho más delicada.

Consecuencia asumida: dos lugares donde configurar acceso. Se documenta explícitamente
porque un lector futuro podría razonablemente creer que es duplicación accidental.

**D3 — Jerarquía por autorreferencia, resuelta en memoria.**
`parent_id` sobre la propia tabla. Se carga el conjunto completo de opciones visibles
para el rol y se arma el árbol en el servicio, misma técnica que F2 usa para el árbol
de ubicaciones. Alternativas rechazadas: CTE recursiva (innecesaria para el orden de
magnitud —decenas de opciones, no miles—) y `ltree`/materialized path (impone
reescrituras en cascada al mover un nodo).

Validación de ciclos antes de persistir `parent_id`: se recorre la cadena de ancestros
del padre propuesto y se rechaza con 422 si aparece la propia opción. Sin esta
comprobación, un ciclo cuelga el armado del árbol en cada petición de menú — un fallo
de escritura convertido en caída de lectura para todos.

**D4 — Caché en Redis con invalidación total al escribir.**
Clave `menu:v1:role:{roleId}` (no por usuario: el menú depende del rol, y cachear por
usuario multiplicaría las entradas sin ganancia). Cualquier escritura sobre
`menu_options`, `menu_option_roles` o `menu_option_endpoints` invalida `menu:v1:*`
completo.

Se rechaza la invalidación selectiva por rol afectado: mover una opción de padre
cambia el árbol de todos los roles con acceso a esa rama, y calcular el conjunto
afectado es más frágil que recalcular. Las escrituras de menú son raras —es una
pantalla de administración— y las lecturas son constantes.

`menu:v1:*` es un espacio de claves **distinto** de `perm:v3:uid:*`. Confundirlos ya
costó una sesión de depuración en este proyecto: `perm:v3:uid:*` cachea permisos y no
tiene nada que ver con la resolución del menú.

**D5 — Catálogo de endpoints poblado por semilla, con verificación en tests.**
`api_endpoints` se puebla con una semilla mantenida a mano. Se rechaza el
descubrimiento automático vía el explorador de rutas de NestJS para esta entrega:
convertiría cada refactor de controlador en una migración de datos implícita.

A cambio, un test compara el catálogo sembrado contra las rutas registradas en la
aplicación y **falla si divergen**. Es el mismo patrón que F1 aplicó a rutas de menú:
la sincronización se mantiene a mano, pero la divergencia es imposible de ignorar.
Ver Q2.

**D6 — Borrado lógico en `menu_options`, físico en las tablas de unión.**
`menu_options` sigue el patrón del proyecto (`deleted_at`). Las tablas de unión
(`menu_option_roles`, `menu_option_endpoints`) borran físicamente: son configuración
pura, sin valor histórico, y conservar filas borradas complicaría las PK compuestas
igual que en F4/D3.

**D7 — La migración de datos es reversible por construcción.**
`menu-map.ts` **permanece en el repositorio** tras la migración, marcado como origen
histórico. Si la resolución desde base de datos falla en producción, revertir es
reactivar el resolutor anterior, no reconstruir el mapa de memoria. Se elimina en un
change posterior, cuando la versión dinámica lleve tiempo estable.

**D8 — El test de coherencia de F1 se adapta, no se descarta.**
`menu-map.spec.ts` valida hoy que toda ruta del mapa exista en `app.routes.ts`. Pasa a
validar lo mismo sobre las filas de `menu_options`. Es la defensa que impide que F5
reintroduzca el defecto que F1 arregló, y descartarlo por «ya no aplica» sería
exactamente el error.

## Data Flow

**Lectura**:
`GET /api/menus/my` → `roleId` del usuario autenticado → caché `menu:v1:role:{roleId}`
→ fallo de caché: consulta `menu_options` ⋈ `menu_option_roles` con `can_read = true`,
`is_active = true`, `deleted_at IS NULL` → armado del árbol por `parent_id` (D3) →
orden por `display_order` → se cachea → respuesta con el contrato de D1

**Escritura**:
`POST`/`PATCH`/`DELETE /api/menu-options` → validación (ciclo, ruta duplicada, hijos,
lectura/escritura coherentes) → transacción → invalidación de `menu:v1:*` (D4)

**Pantalla de administración**:
árbol de menús (panel izquierdo) → selección → formulario de detalle + matriz de roles
+ doble panel de endpoints → guardar → recarga del árbol

## File Changes

### Backend

| Archivo | Acción | Descripción |
|---|---|---|
| `database/migrations/00XX_dynamic_menus.sql` | Nuevo | Cuatro tablas + **`roles.scope`** (Q1) + permisos en catálogo, `roles.permissions` y `users.permissions` |
| `database/migrations/00XX_menu_data_migration.sql` | Nuevo (D7) | Traslada las entradas de `MENU_MAP` a filas |
| `database/MIGRATION_LOG.md` | Modificar | Entradas nuevas |
| `backend/src/modules/menus/entities/menu-option.entity.ts` | Nuevo (D3/D6) | Autorreferencia, borrado lógico |
| `backend/src/modules/menus/entities/menu-option-role.entity.ts` | Nuevo | PK compuesta, `can_read`/`can_write` |
| `backend/src/modules/menus/entities/api-endpoint.entity.ts` | Nuevo (D5) | Catálogo |
| `backend/src/modules/menus/entities/menu-option-endpoint.entity.ts` | Nuevo | PK compuesta |
| `backend/src/modules/menus/menus.service.ts` | Reescribir (D1/D3/D4) | Resolución desde base de datos con contrato intacto |
| `backend/src/modules/menus/menu-options.service.ts` | Nuevo | CRUD, validación de ciclos, matriz, endpoints |
| `backend/src/modules/menus/menu-options.controller.ts` | Nuevo | Endpoints de administración |
| `backend/src/modules/menus/menu-map.ts` | Conservar (D7) | Marcado como origen histórico; se elimina en un change posterior |
| `backend/src/modules/menus/menu-map.spec.ts` | Modificar (D8) | Valida rutas contra `menu_options` |

### Frontend

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/app/core/services/menu-option.service.ts` | Nuevo | CRUD y catálogo de endpoints |
| `frontend/src/app/features/admin/menu-options/` | Nuevo | Pantalla del mock 05-01 |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/` | Nuevo | Árbol con «Agregar menú» |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/` | Nuevo | Matriz rol × lectura/escritura, agrupada |
| `frontend/src/app/features/admin/menu-options/components/endpoint-picker/` | Nuevo | Doble panel disponibles ↔ asignados |
| `frontend/src/app/app.routes.ts` | Modificar | Ruta `/app/controles` |
| `frontend/src/app/core/models/menu.model.ts` | Modificar | `children` deja de ser siempre vacío |

## Redis Caching Strategy

- **Clave**: `menu:v1:role:{roleId}` — por rol, no por usuario (D4)
- **Invalidación**: `menu:v1:*` completo ante cualquier escritura de menú
- **TTL**: 1 hora como red de seguridad ante una invalidación fallida
- **Espacio separado**: `menu:v1:*` no tiene relación con `perm:v3:uid:*`. Vaciar uno
  no afecta al otro. Se hace explícito porque confundirlos ya costó tiempo de
  depuración en este proyecto.

## Testing Strategy

`strict_tdd: true` — test primero en todo el backend.

- **Resolución**: filtrado por `can_read`, exclusión de inactivas y borradas, orden por
  `display_order`, hijo oculto cuando su padre no es accesible.
- **Paridad (la prueba clave)**: tras la migración de datos, la salida de
  `GET /api/menus/my` para `master@tase.local` coincide con la que producía `MENU_MAP`.
  Es la aserción que demuestra que F5 no reintroduce el defecto de F1.
- **Ciclos**: asignar como padre a un descendiente ⇒ 422; autopadre ⇒ 422. Sin esto,
  un error de escritura tumba la lectura de menú para todos los usuarios.
- **Matriz**: `can_write` sin `can_read` ⇒ 422; un rol creado después aparece sin acceso.
- **Integración (Testcontainers)**: PK compuestas y cascadas se comportan como se
  espera; borrar una opción con hijos ⇒ 409.
- **Caché**: dos lecturas seguidas no repiten consulta; una escritura invalida.
- **Catálogo de endpoints (D5)**: la semilla coincide con las rutas registradas en la
  aplicación; divergencia ⇒ fallo.
- **Migración**: permisos presentes en `roles.permissions` **y** en `users.permissions`
  de los usuarios preexistentes.
- **Frontend**: árbol renderiza jerarquía; matriz refleja y envía cambios; doble panel
  mueve endpoints en ambos sentidos.
- **e2e**: crear opción → asignar rol con lectura → iniciar sesión con ese rol → la
  opción aparece en el sidebar y navega. Es el ciclo completo del valor de la fase.
- Comandos: `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde
  `backend/`; `pnpm lint && pnpm test && pnpm test:e2e` desde `frontend/`.

## Open Questions

- **Q1 — RESUELTA, con corrección de esquema** (equipo + verificación, 2026-08-29).

  Intención confirmada por el equipo: «empresa principal» es la organización operadora
  de la plataforma; «clientes» son las organizaciones usuarias y sus roles
  (`admin_org`, `operador_org`).

  **Corrección respecto a una versión previa de este documento**: se afirmó que la
  partición podía derivarse de `roles.organization_id`. Esa columna **no existe**.
  Verificado contra las migraciones — `roles` es un catálogo global:

  ```sql
  -- 0001_initial_schema.sql
  CREATE TABLE roles (
    id uuid PK, name varchar(100) NOT NULL UNIQUE, description text, created_at timestamptz
  );
  -- + permissions jsonb (0009), deleted_at (0031), updated_at (0032)
  ```

  `organization_id` vive en `users`, no en `roles`. Hoy la distinción existe sólo como
  convención de nombres, no como dato consultable.

  **Por qué eso obliga a un cambio de esquema.** El mock 05-01 lista `ROL_3`, `ROL_4`,
  `ROL_5` del lado empresa y `ROL_2_CLIENT`, `ROL_3_CLIENT`, `ROL_4_CLIENT` del lado
  cliente: el sistema anticipa **crear roles nuevos en ambos lados**. Con `name` global
  y único y sin columna de lado, al crear un rol no hay forma de clasificarlo.
  Derivarlo de los usuarios que lo tengan asignado tampoco sirve: un rol recién creado
  no tiene ninguno, y quedaría sin bloque en la matriz.

  **Aclaración del equipo (2026-08-29) que cierra la ambigüedad del mock**: los
  `ADMIN_CLIENT`, `ROL_2_CLIENT`… de la maqueta **no son roles nuevos**. Era el nombre
  del *usuario* en el mockup; el rol subyacente es `admin_org`. No existen dos
  catálogos de roles paralelos.

  **Catálogo real, verificado en migraciones — son cinco, no cuatro:**

  | Rol | Sembrado en | Ámbito |
  |---|---|---|
  | `master` | 0015 (`admin_sistema`) → 0040 renombra | plataforma |
  | `operador_sistema` | 0015 | plataforma |
  | `admin_org` | 0015 (`admin_organizacion`) → 0040 | organización |
  | `operador_org` | 0015 (`operador_organizacion`) → 0040 | organización |
  | **`reporter`** | **0009** | **público (ciudadano autenticado)** |

  `reporter` («Default role for authenticated citizen reporters») es el **ciudadano**;
  sólo está nombrado en inglés. Existe desde 0009 y 0015 lo deja explícitamente
  intacto. `database/seeds/users.js` no crea ningún usuario con él, que es por lo que
  pasa desapercibido.

  **Decisión**: añadir a `roles` una columna de ámbito con **tres** valores.

  ```sql
  ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS scope varchar(20) NOT NULL DEFAULT 'organization'
      CHECK (scope IN ('platform', 'organization', 'public'));

  UPDATE roles SET scope = 'platform' WHERE name IN ('master', 'operador_sistema');
  UPDATE roles SET scope = 'public'   WHERE name = 'reporter';
  -- admin_org y operador_org quedan en 'organization' por el DEFAULT
  ```

  Haber elegido `varchar` con `CHECK` en vez de un booleano `is_client_role` resultó
  acertado: el tercer ámbito apareció al verificar el catálogo, y es un valor más en el
  `CHECK`, no una migración de tipo.

  La matriz del mock se arma agrupando por `scope` — **tres bloques, no dos**. El bloque
  público suele tener una sola fila y aun así conviene mostrarlo: es donde se ve de un
  vistazo qué secciones alcanza un ciudadano.

- **Q4 — CERRADA sin trabajo** (equipo, 2026-08-29). Se preguntó si los roles de
  cliente debían ser por organización. No aplica: no hay roles de cliente separados,
  el catálogo es global y compartido. **`roles.organization_id` no se añade.**

- **Q5 (NUEVA, informativa)** — El usuario anónimo **no tiene rol, y es deliberado**.
  Sus permisos salen de `backend/src/config/auth.config.ts` → `anonymousPermissions`
  (`READ/CREATE incidents`, `READ/CREATE comments`), no de la tabla `roles`. El
  comentario de 0009 lo argumenta: el rol `reporter` «MIRRORS the anonymous ceiling at
  seed time but does NOT drive it», y `AuthService.getPermissions` ramifica por
  `device_uuid === 'anonymous'` leyendo el config directamente. Así, ampliar `reporter`
  jamás amplía el techo anónimo.

  Consecuencia para F5: **el anónimo no aparece en la matriz de menú y no debe
  aparecer**, porque no es una fila de `roles`. Gobernar su menú desde la pantalla de
  administración exigiría romper ese aislamiento, y la respuesta por defecto a eso
  debería ser que no.
- **Q2** — ¿Debe el catálogo de endpoints descubrirse automáticamente desde el
  explorador de rutas de NestJS en lugar de sembrarse? Reduce el mantenimiento a
  cambio de acoplar el catálogo al arranque de la aplicación. Fuera de alcance aquí;
  el test de divergencia de D5 cubre el riesgo mientras tanto.
- **Q3** — El mock muestra el campo `RUTA` con el valor `/management/...`, un prefijo
  que no existe en el enrutado actual. ¿Es maqueta o una convención esperada? Se
  implementan rutas sin ese prefijo, coherentes con `app.routes.ts`.
