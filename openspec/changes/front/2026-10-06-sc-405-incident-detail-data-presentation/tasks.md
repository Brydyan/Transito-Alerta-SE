# Tareas de Implementación

- [x] **T1 — [DB] Migración 0066: Permiso `status-history`**
  - **Contexto:** `database/migrations/0066_status_history_permission.sql` (nuevo).
  - **Acción:** Insertar `('status-history', 'READ')` en la tabla `permissions` (`ON CONFLICT DO NOTHING`). Identificar roles que poseen `('incidents', 'READ')` y concatenar el nuevo permiso. Denormalizar vía `UPDATE` en la tabla `users` para propagar el array a los usuarios de esos roles y sumar `+ 1` a su `permission_version`.
  - **Verificación:** Aplicar migración sin errores. Ejecutar suite de pruebas de backend y validar build. Cubre: Requisito "Detalle de incidencia - Historial".

- [x] **T2 — [Frontend] Detalle: Resolución de identidad y zona**
  - **Contexto:** `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` y `.html`.
  - **Acción:** Mostrar en la vista los atributos de negocio reales devueltos por la API (ej. `citizen.full_name`, `geo_zone.name`) sustituyendo los UUIDs técnicos. Proveer texto fallback ("Ciudadano no disponible") si el dato es nulo.
  - **Verificación:** Test unitario validando el renderizado correcto de nombres o sus fallbacks. Cubre: Requisito "Detalle de incidencia - Carga".

- [x] **T3 — [Frontend] Detalle: Ubicación legible y condicional**
  - **Contexto:** `frontend/src/app/features/incidents/incident-detail/incident-detail.component.html`.
  - **Acción:** Otorgar jerarquía visual al nombre de la zona, dejando las coordenadas (lat/lng) en rol secundario (tooltip/atenuado). Condicionar toda la sección de ubicación mediante `@if` para omitirla (sin dejar caja vacía) si no hay coordenadas.
  - **Verificación:** Test unitario verificando la total ausencia del contenedor en el DOM si no existen coordenadas. Cubre: Requisito "Detalle de incidencia - Sin coordenadas".

- [x] **T4 — [Frontend] Detalle: Mini-mapa Leaflet**
  - **Contexto:** `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` y `.html`.
  - **Acción:** Instanciar el mapa Leaflet en el componente sólo al disponer de coordenadas válidas. Asegurar que la referencia del mapa se destruya adecuadamente en el hook `OnDestroy`.
  - **Verificación:** Test unitario probando la correcta inicialización y limpieza de la instancia para evitar memory leaks. Cubre: Requisito "Detalle de incidencia - Ubicación".

- [x] **T5 — [Frontend] Detalle: Galería de imágenes**
  - **Contexto:** `frontend/src/app/features/incidents/incident-detail/incident-detail.component.html`.
  - **Acción:** Reutilizar el componente `<app-incident-images [incidentId]="incident.id">` insertándolo en el layout para resolver la previsualización y apertura de imágenes.
  - **Verificación:** Test unitario asegurando el renderizado de la galería y la inyección del ID adecuado. Cubre: Requisito "Detalle de incidencia - Galería".

- [x] **T6 — [Frontend] Detalle: Comentarios sin bloqueos**
  - **Contexto:** `frontend/src/app/features/incidents/components/comment-thread/comment-thread.component.ts`.
  - **Acción:** Auditar/afinar la inserción local para que un nuevo comentario transicione el UI localmente por *signals* en vez de requerir una recarga global de datos, asumiendo que el grant 403 ya queda destrabado por la T1.
  - **Verificación:** Test unitario validando la publicación del comentario mediante un update puramente reactivo del hilo. Cubre: Requisito "Hilo de comentarios - Publicar".

## Verificación final de la Change
- **Frontend:** ✅ `pnpm test` → 104 suites / 877 tests PASS; `pnpm run build` → exit 0 (verificado dos veces por el orquestador, no solo por el agente).
- **Backend:** ✅ `pnpm test` → 124 suites / 1283 PASS (11 skipped); `pnpm run build` → exit 0 (idem, verificado dos veces).
- **BD:** ⏳ Migración `0066_status_history_permission.sql` creada y revisada (patrón 0052/0055/0056, columnas `deleted_at`/`is_active` verificadas contra el esquema), pero **PENDIENTE de aplicar en la base** — no se ejecuta desde esta sesión.

### Notas de desviación respecto al plan original
- **T2 requirió cambios en backend:** el spec asumía que el backend ya devolvía identidad/zona, pero `GET /incidents/:id` solo traía columnas planas. Se extendió `findOne` (subconsultas `json_build_object`, sin romper el `RETURNING` de `create`) para devolver `geo_zone.name` y `citizen.{full_name,email}`.
- **Regla de anonimato agregada (AUD sc-327):** si `is_anonymous=true`, la respuesta omite `citizen` por completo y el template muestra «Autor anónimo». El spec no cubría esto; exponer el nombre rompería el sello de anonimato.
- **Seguridad del nuevo `GET /incidents/:id/images`:** quedó con `PermissionGuard` + `@RequirePermission('READ')` y parent-lookup org-scoped (`NotFoundException` fuera de scope), siguiendo el patrón D1 de status-history.
