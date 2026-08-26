# Tasks: T7.9.C/D — Geography + Organizations Seed & Demo/Volume Seeding

**Change**: t7-geography-organizations-seed
**Date**: 2026-08-25
**Mode**: Strict TDD (`npm test && npm run test:e2e` desde `backend/`)

> **Bloqueo conocido — leer antes de ejecutar `sdd-apply`**: **T7.9.C1 está
> bloqueada en un paso humano externo**, pero ya no por disponibilidad de
> INEC — INEC DPA fue **rechazado**: su shapefile no tiene licencia alguna
> (metadata FGDC con el placeholder de plantilla ESRI sin rellenar, los
> "términos y condiciones" del geoportal apuntan a la política de
> privacidad, y el alcance declarado es sólo para "operativos de campo");
> CONALI/IGM/GADM fallan por razones propias (ver proposal.md Approach y
> design.md D0). La fuente ahora es **OpenStreetMap** (`admin_level=8`, ODbL
> 1.0) — el dataset ya está verificado disponible (consulta Overpass real
> sobre las 11 parroquias de Santa Elena). Lo que sigue bloqueado en el
> operador es el **criterio legal sobre el alcance del share-alike de
> ODbL** (si un NOTICE junto al GeoJSON basta o si la obligación alcanza más
> del repo — ver design.md D0) y la ejecución de la extracción
> Overpass/osmium. **T7.9.C2–C7 dependen de su salida**
> (`database/data/santa-elena-parroquias.geojson`) y quedan bloqueadas
> transitivamente.
>
> **El bloque D7.9.D es completamente independiente de T7.9.C1 y es
> ejecutable hoy mismo**: no toca geografía ni organizaciones (esas llegan
> por la migración 0041, nunca por un seed script — R22.1), sólo usuarios e
> incidentes de demo/volumen. Quien corra `sdd-apply` sobre este change
> puede completar D7.9.D1–D11 en su totalidad mientras T7.9.C1 sigue
> pendiente del operador.
>
> Orden dentro de cada bloque: **Test (🔴) → Implementación → Verificación**,
> salvo T7.9.C1/C2/C3 donde el test depende de tener datos reales primero
> (no tiene sentido escribir el E2E de contención geométrica contra un
> fixture sintético — design.md D5 lo prohíbe explícitamente).
>
> Ninguna tarea se marca `[x]` en esta fase — eso es de la fase apply.

---

## D7.9.C — Geografía y organizaciones (migración 0041)

> Depende de: 0040 registrada en `schema_migrations` (prerequisito de D6/design.md).
> Nada ≤ 0040 se edita. Migración nueva: `database/migrations/0041_geography_organizations_seed.sql`.

- [ ] **T7.9.C1** — 🚧 **BLOQUEADA — operador**: INEC DPA queda
      **descartado como fuente** — no tiene licencia alguna (metadata FGDC
      `nxparroquias.shp.xml` con `<accconst>`/`<useconst>` sin rellenar,
      placeholder de plantilla ESRI; "términos y condiciones" del geoportal
      apuntando a la política de privacidad; alcance declarado sólo para
      "operativos de campo"); CONALI exige autorización expresa, IGM no
      publica parroquias, GADM es no-comercial — ver design.md D0. Fuente
      definitiva: **OpenStreetMap**, `admin_level=8` = parroquia en Ecuador
      (verificado con una consulta Overpass real sobre
      `area["ISO3166-2"="EC-SE"]`); las 11 parroquias de Santa Elena existen
      completas (7 en cantón Santa Elena, 1 en La Libertad, 3 en Salinas).
      Extraer vía Overpass API (recomendado, 11 relaciones) o Geofabrik
      `ecuador-latest.osm.pbf` filtrado con `osmium`/`osmosis`; OSM ya está
      en EPSG:4326 — sin reproyección. Promover a MultiPolygon si hace falta
      (`-nlt PROMOTE_TO_MULTI` o `ST_Multi` aguas abajo, D0/D3). Commitear
      `database/data/santa-elena-parroquias.geojson` (con propiedad
      `municipality_code` por feature, formato `PP-CC-XX`, cruzable con el
      código DPA histórico de INEC) y `database/data/README.md` (consulta
      Overpass/URL exacta, fecha, licencia ODbL 1.0 + determinación de
      atribución, checksum).
      **✅ EXTRACCIÓN COMPLETADA 2026-08-25.** Ya están en el repo:
      `database/data/santa-elena-parroquias.geojson` (11 parroquias, las 11
      válidas según `ST_IsValid`, SHA-256 `91632dec…`),
      `database/data/osm-parroquias-to-geojson.py` (reproducible, aborta si
      un anillo no cierra), `database/data/NOTICE` (atribución ODbL + el
      aviso MIT de Ecuador-geoJSON que GeoReporta nunca reprodujo) y
      `database/data/README.md` (procedencia + tabla de medición de R21.3).
      No hizo falta GDAL: OSM ya viene en EPSG:4326 y el script promueve a
      MultiPolygon.
      **Queda abierto sólo el criterio legal del operador**, que NO bloquea
      el trabajo técnico: el alcance del share-alike de ODbL 1.0 se activa
      al publicar el repo o al exponer los polígonos por una API pública —
      ninguna de las dos es hoy. Revisar antes de que lo sean. **(—)**

- [ ] **T7.9.C2** — 🔴 Crear `backend/test/unit/generate-geo-zones-seed.spec.ts`:
      (a) `generate(legacyInput) === readFileSync('0003_seed_geo_zones.generated.sql')`
      byte-a-byte (guarda de estabilidad del checksum registrado de 0003);
      (b) el UUID de cada parroquia generada por `uuidV5(code, NS_GEO_ZONE)`
      tiene el nibble de versión `5` en el tercer grupo (prueba estructural
      de no-colisión contra los literales existentes `...-4c1f-...`, que
      llevan nibble `4`); (c) el código generado sigue el patrón
      `EC-24-<canton>-<parish>`; (d) cada polígono `Polygon` de entrada se
      envuelve en `ST_Multi(...)` en el SQL emitido. Debe fallar (el modo
      parroquia no existe todavía). Depende del artefacto de T7.9.C1 para un
      fixture realista. **(1.5h)**

- [ ] **T7.9.C3** — Extender `database/seeds/generate-geo-zones-seed.js` a
      modo arity-driven (design.md D3): 1 argumento → ruta legacy sin
      cambios, salida byte-idéntica a la comprometida; 2 argumentos → modo
      parroquia, lee `santa-elena-parroquias.geojson`, valida que el código
      de cantón implícito de cada parroquia existe en `ZONE_IDS`, emite
      `database/seeds/0004_seed_parroquias.generated.sql`. Añadir el helper
      local `uuidV5(name, ns)` (sólo `node:crypto`, namespace congelado
      `NS_GEO_ZONE = '3f2b1a90-7c6d-5e48-9b21-0a1d4e7c88f1'`) y el código
      `EC-24-<canton>-<parish>` (D2), preservando el `municipality_code` de
      OSM (formato `PP-CC-XX`) como comentario SQL
      `-- municipality_code 24-01-54` (cruzable con el código DPA histórico
      240154). Pone en verde T7.9.C2. **(3h)**

- [ ] **T7.9.C4** — 🔴 Crear `backend/test/e2e/t7-geography-orgs-seed.e2e-spec.ts`
      con R21.0–R21.5 (spec.md): backfill de `code` precede a las parroquias
      (R21.0); ≥1 parroquia por cantón con `code`/`polygon`/`parent_id` no
      nulos (R21.1); jerarquía parroquia→cantón→provincia sin ciclos (R21.2);
      `ST_Within(ST_PointOnSurface(parroquia.polygon), canton.polygon)`
      verdadero en todos los pares — binario, sin tolerancia, es la prueba de
      emparentamiento correcto — y además
      `ST_Area(ST_Intersection(parroquia, canton)) / ST_Area(parroquia) >=
      OVERLAP_MIN`, con `OVERLAP_MIN = 0.75` ya medido el 2026-08-25 (mínimo
      observado 0.8058 en Anconcito; tabla completa en
      `database/data/README.md`). Nota: `strict_within` dio `false` en las 11
      parroquias — la formulación vieja habría fallado en todas; ver design.md D5,
      sin editar ninguna geometría para forzarlo (R21.3); la organización
      `CTE - Santa Elena` existe una sola
      vez, con `zone_id` → `code='EC-24-01'` y `parent_id` NULL (R21.4);
      re-aplicar 0041 no cambia los conteos de `geo_zones` ni `organizations`
      (R21.5). Corre contra Postgres real vía `TestEnvironment` (cadena de
      migraciones completa, nunca fixtures `ST_MakeEnvelope`). Debe fallar
      (0041 no existe todavía). **(2.5h)**

- [ ] **T7.9.C5** — Escribir `database/migrations/0041_geography_organizations_seed.sql`
      en el orden exacto de design.md D4 (es load-bearing): (1) backfill de
      `code` en las 4 `geo_zones` preexistentes emparejado por **UUID
      literal**, nunca por nombre (0013 ya enseñó que "Santa Elena
      (Provincia)" y "Santa Elena (Cantón)" comparten prefijo); (2)
      `INSERT INTO geo_zones ... SELECT ... FROM geo_zones p WHERE p.code='EC-24-0X'
      ON CONFLICT (id) DO NOTHING` embebiendo el SQL emitido por T7.9.C3
      (INSERT…SELECT da cero filas si falta el padre, no un error de FK);
      (3) `INSERT INTO organizations ... SELECT ... FROM geo_zones z WHERE
      z.code='EC-24-01' AND NOT EXISTS (SELECT 1 FROM organizations o WHERE
      o.name='CTE - Santa Elena')` — `name` lleva la forma corta
      `CTE - Santa Elena` (el nombre legal completo va en un comentario de
      cabecera), `parent_id` NULL, `incident_category_id` NULL,
      `max_active_claims` 5, `created_at`/`updated_at` explícitos. Pone en
      verde T7.9.C4. **(2.5h)**

- [ ] **T7.9.C6** — Escribir `database/rollback/0041_geography_organizations_seed.DOWN.sql`
      en orden inverso, una transacción, guarda ruidosa en vez de cascada
      silenciosa (design.md D6): `DO $$ ... RAISE EXCEPTION $$` si algún
      `users.organization_id` sigue referenciando la organización; luego
      `DELETE FROM organizations WHERE name='CTE - Santa Elena'`; luego
      `DELETE FROM geo_zones WHERE level='parroquia' AND code LIKE
      'EC-24-__-__'` (patrón ajustado — `'EC-24-%'` también matchearía los
      cantones); luego `UPDATE geo_zones SET code=NULL WHERE code IN
      ('EC-24','EC-24-01','EC-24-02','EC-24-03')`. **No** toca
      `roles.permissions` (esos grants son de 0039, con su propio DOWN).
      **(1.5h)**

- [ ] **T7.9.C7** — Verificar el ciclo completo contra Postgres real: 0041
      aplica limpio sobre 0040, re-aplicar es no-op (R21.5), el DOWN
      restaura el estado previo sin dejar residuos, y la suite completa de
      T7.9.C4 queda en verde.
      La medición de design.md D5 **ya se corrió el 2026-08-25** y su tabla
      está en `database/data/README.md`: `parent_ok` true en las 11,
      `overlap_ratio` entre 0.8058 y 0.9993, `OVERLAP_MIN` fijado en 0.75.
      Aquí sólo hay que **re-confirmarla dentro del ciclo real de migraciones**
      (la medición se hizo cargando 0003 + las parroquias en un contenedor
      aparte, no aplicando 0041). Si algún `parent_ok` da `false`, es una
      parroquia mal emparentada — no se toca el umbral. **(0.5h)**

---

## D7.9.D — Pipeline de siembra (independiente de T7.9.C1 — ejecutable ahora)

> Ubicación: `database/seeds/` (R22.2). JS plano + `pg`, sin Nest/TypeORM.
> La geografía y la organización llegan siempre por 0041, nunca por un
> script de esta sección (R22.1) — ver design.md D12.

- [ ] **T7.9.D1** — 🔴 Crear `backend/test/e2e/t7-seeding-pipeline.e2e-spec.ts`
      con las mitades estáticas de R22 que no requieren datos sembrados:
      R22.1 — ningún archivo de `database/migrations/` contiene
      `INSERT INTO incidents`; R22.2 — los generadores de incidentes de demo
      y volumen viven bajo `database/seeds/`, no bajo `database/migrations/`.
      Debe fallar hasta que los generadores existan en la ruta correcta.
      **(1h)**

- [ ] **T7.9.D2** — 🔴 Crear (en el mismo archivo o en
      `backend/test/e2e/t7-users-seed.e2e-spec.ts`) R22.5–R22.6: sobre una
      base limpia con 0041 aplicada, ejecutar `database/seeds/users.js`
      produce exactamente 6 usuarios (1 `master`, 1 `operador_sistema`, 2
      `admin_org`, 2 `operador_org`), los 4 `admin_org`/`operador_org` con
      `organization_id` = CTE - Santa Elena; re-ejecutar no duplica ningún
      email y el conteo permanece en 6. Debe fallar (`users.js` no existe).
      **(1.5h)**

- [ ] **T7.9.D3** — Crear `database/seeds/lib/deps.js` (design.md D7): usar
      `createRequire(path.resolve(__dirname,'../../../backend/package.json'))`
      para reexportar `pg.Client` y `bcrypt` desde `backend/node_modules`
      (no hay `package.json` raíz; `require()` resuelve desde el directorio
      del archivo que importa, así que un `require('pg')` directo en
      `database/seeds/*.js` falla sin esto). Crear
      `database/seeds/lib/guard.js` (D11): abortar si `NODE_ENV==='production'`
      (`--force` solo no basta — exige además `SEED_ALLOW_PRODUCTION=1`,
      doble compuerta independiente); abortar si el host resuelto de
      `DATABASE_URL`/`DB_HOST` no matchea
      `localhost|127.*|::1|0.0.0.0|*.local|host.docker.internal`, salvo
      `--force`; imprimir el host resuelto y salir con código 1 al abortar.
      **(1.5h)**

- [ ] **T7.9.D4** — Implementar `database/seeds/users.js`: hashea
      `SEED_PASSWORD` con `bcrypt` (vía `deps.js`) a `BCRYPT_COST` (default
      12, igual que `AuthConfig.bcryptCost`); setea `email`,
      `password_hash`, `is_active=true`, `deleted_at IS NULL`, y tanto
      `role_id` (FK, nombres post-0040) como la columna legacy `role` varchar
      al mismo string; los 4 usuarios `admin_org`/`operador_org` resuelven
      `organization_id` por `name='CTE - Santa Elena'`; `ON CONFLICT (email)
      DO NOTHING`. Pone en verde T7.9.D2. **(2h)**

- [ ] **T7.9.D5** — Crear `database/seeds/lib/rand.js`: `mulberry32(0x20260825)`
      inline (design.md D8) — sin `Math.random`, sin `Date.now`, sin
      `gen_random_uuid()`; timestamps como offsets desde un `EPOCH`
      congelado; IDs de fila reutilizando `uuidV5('demo/incident/'+i, NS_SEED)`
      / `uuidV5('vol/incident/'+i, NS_SEED)` de T7.9.C3. **(1h)**

- [ ] **T7.9.D6** — 🔴 Extender `t7-seeding-pipeline.e2e-spec.ts` con R22.3
      (ejecutar `db:seed` dos veces sobre datos de demo ya cargados no
      cambia el conteo de incidentes/usuarios/notificaciones) y R22.4 (tras
      `rebuild-feed.ts`, el feed de Redis devuelve los mismos incidentes
      activos que Postgres). Debe fallar (`demo-incidents.js` y
      `rebuild-feed.ts` no existen). **(1.5h)**

- [ ] **T7.9.D7** — Implementar `database/seeds/demo-incidents.js`: ~25
      incidentes realistas repartidos en los 3 cantones de Santa Elena,
      PRNG determinista de T7.9.D5, idempotente por prefijo de título
      `[DEMO]` + chequeo de existencia (equivalente a
      `SantaElenaIncidentSeeder`). **(2.5h)**

- [ ] **T7.9.D8** — Implementar `backend/scripts/rebuild-feed.ts`:
      `NestFactory.createApplicationContext(AppModule)` (no `create` — no
      abre puerto HTTP) → `app.get(FeedRecoveryService).rebuildFeed(limit)`
      (default `LIMIT 200`) → `await app.close()` (libera Redis/TypeORM para
      que el proceso salga con código 0). Ejecutar vía `ts-node`, igual que
      `db:migrate`. Pone en verde la mitad R22.4 de T7.9.D6. **(1.5h)**

- [ ] **T7.9.D9** — 🔴 Crear `backend/test/e2e/t7-volume-seed.e2e-spec.ts`:
      1000 incidentes con ciclo de vida completo — `zone_id`/`organization_id`/
      `geofence_matched` resueltos por `ST_Contains` (parroquia → cantón →
      provincia); una fila de `status_history` por transición válida
      (`pending`→`in_progress`→`resolved`); exactamente una fila en
      `assignments` por incidente asignado; `approved_by+approved_at` XOR
      `rejected_by+rejected_at+rejection_reason`; `resolution_date` sólo si
      `status` ∈ {resolved, closed}; `notifications.type` sólo con los 5
      valores permitidos por el CHECK 0022; comentarios con profundidad ≤ 2.
      **Además, un assert explícito de que la transición de aprobación a
      `closed` NO escribe fila en `status_history`** — ver nota de
      T7.9.D10. Debe fallar (`volume-incidents.js` no existe). **(2h)**

- [ ] **T7.9.D10** — Implementar `database/seeds/volume-incidents.js`
      (design.md D9): lotes de 250, INSERT multi-fila. Escribe a mano todo
      lo que un `bulk INSERT` se salta al no pasar por los listeners de la
      app: `status_history` por transición (`event_id = vol/<i>/<n>`),
      `assignments` + `claimed_by`/`claimed_at`/`assigned_to`, aprobación/
      rechazo, `resolution_date`, `notifications`, `comments` con el tope de
      profundidad 2 impuesto en JS (no hay constraint de DB para eso).
      Auto-skip si la base ya tiene ese volumen.
      ⚠️ **Nota — no "arreglar" esto**: el seeder **NO** debe escribir una
      fila de `status_history` para el paso de aprobación a `closed`. Motivo:
      `chk_status_history_new_status` (migración 0014) sólo admite
      `pending`/`in_progress`/`resolved` como `new_status` — nunca recibió
      `'closed'` aunque 0020 lo agregó al CHECK de `incidents.status` — y en
      producción `IncidentApprovalService.approve` tampoco emite un evento
      de cambio de estado para ese paso. Omitir la fila es fiel al
      comportamiento real, no un atajo del seeder. Arreglar ese hueco de
      auditoría real queda **fuera de alcance** de este change. Pone en
      verde T7.9.D9. **(3.5h)**

- [ ] **T7.9.D11** — Añadir a `backend/package.json` (design.md D12,
      `cwd=backend/`): `db:seed` = `node ../database/seeds/users.js &&
      node ../database/seeds/demo-incidents.js && ts-node
      scripts/rebuild-feed.ts`; `db:seed:mass` = `npm run db:seed && node
      ../database/seeds/volume-incidents.js && ts-node
      scripts/rebuild-feed.ts`. Correr ambos localmente de punta a punta:
      `db:seed` desde base limpia produce 6 usuarios + ~25 incidentes de
      demo + feed no vacío, y una segunda corrida no cambia ninguna fila;
      `db:seed:mass` produce 1000 incidentes dentro de un presupuesto de
      tiempo razonable. Confirmar T7.9.D1, D2, D6 y D9 en verde. **(1.5h)**

---

## Cierre

> Z2 no depende de T7.9.C1 y puede hacerse en paralelo con D7.9.D. Z1, Z4 y
> Z5 requieren 0041 escrita (fin de D7.9.C).

- [ ] **T7.9.Z1** — Añadir la fila `0041` a `database/MIGRATION_LOG.md`:
      nombre `geography_organizations_seed`, descripción (backfill de
      `code`, parroquias de Santa Elena, organización `CTE - Santa Elena`),
      estado `⏳ Pending` hasta que el operador la aplique manualmente en
      Supabase, entorno `supabase`. **(30min)**

- [ ] **T7.9.Z2** — Re-anclar R21 en
      `openspec/changes/infra/t7-database-schema-parity/tasks.md` (líneas
      T7.9.C1–C6, hoy referencian 0039) y en
      `openspec/specs/database-schema/spec.md` (si ancla R21 a 0039), para
      que apunten a la migración real `0041_geography_organizations_seed.sql`
      de este change. Puede hacerse ya — es un cambio de texto, no depende
      de T7.9.C1. **(45min)**

- [ ] **T7.9.Z3** — Revisar `docs/tasks/3-DATABASE-SCHEMA.md` (rango de
      migraciones documentado como 0001–0039/0040) y actualizarlo a
      0001–0041 si sigue mencionando un rango cerrado. **(30min)**

- [ ] **T7.9.Z4** — Correr la suite completa (`npm test && npm run
      test:e2e`), `npm run lint`, `npm run typecheck` y `npm run build`
      desde `backend/`. Cero errores. Bloqueada hasta que D7.9.C y D7.9.D
      estén ambas completas. **(1h)**

- [ ] **T7.9.Z5** — Redactar el bloque de aplicación manual para el
      operador: pegar `0041_geography_organizations_seed.sql` en el editor
      SQL de Supabase tras confirmar que 0040 está registrada en
      `schema_migrations`, con el checkpoint a verificar (conteo de
      parroquias por cantón, existencia de la organización). Actualizar la
      fila 0041 de `MIGRATION_LOG.md` a `✅ Applied` una vez ejecutado.
      **(45min)**

---

## Resumen

| Grupo | Tareas | Migración | Estimado | Bloqueo |
|-------|--------|-----------|----------|---------|
| D7.9.C | 7 | 0041 | ~14h | 🚧 C1 bloqueada (operador); C2–C7 dependen de C1 |
| D7.9.D | 11 | — (seeds) | ~19.5h | Ninguno — ejecutable ahora |
| Cierre | 5 | — | ~4.25h | Z1/Z4/Z5 dependen de D7.9.C; Z2/Z3 no |
| **Total** | **23** | **1** | **~37.75h** | |

**Ejecutable hoy sin esperar al operador**: D7.9.D1–D11 (19.5h) +
D7.9.Z2/Z3 (1.25h) = **~20.75h** de trabajo desbloqueado.

**Bloqueado en T7.9.C1** (operador): D7.9.C2–C7 (~11.5h) + D7.9.Z1/Z4/Z5
(~2.25h) = **~13.75h** que no pueden empezar hasta que se resuelva el
criterio legal de ODbL 1.0 (share-alike) para el dataset OSM — la
disponibilidad del dataset en sí ya está verificada (ver design.md D0).
