# Proposal: F5.7 — Mejoras a /app/admin/controles (Gestión dinámica de menús)

## Intent

La pantalla `/app/admin/controles` (F5 — Menús dinámicos administrables) funciona pero presenta limitaciones funcionales y de UX que dificultan la administración completa de la jerarquía de menús:

1. **Endpoints asignados no se cargan** — Al seleccionar una opción de menú, el panel de endpoints no hidrata los asignados porque falta el endpoint `GET /menu-options/:id/endpoints` en el backend.

2. **Matriz de roles poco intuitiva** — Los roles se muestran sin agrupar por ámbito (Plataforma, Organización, Público). Sin filtro visual de lectura/escritura.

3. **Edición de orden impráctica** — El campo `display_order` es un input numérico mantenido a mano. No hay indicación de estrategia (10 en 10 para principales, 1 en 1 para sub-menús).

4. **Árbol de menús estático en presentación** — Las flechas expandibles no son visibles; cuesta identificar qué nodos tienen hijos.

5. **Endpoints sin contexto de módulo** — El catálogo lista todos los endpoints del sistema. No hay forma de filtrar por módulo o ver qué endpoints trabajan con la opción seleccionada.

6. **Borrado sin confirmación** — El usuario puede eliminar una opción de menú sin advertencia.

7. **Panel de endpoints con doble panel incompleto** — El componente `EndpointPickerComponent` usa doble panel (disponibles ↔ asignados) pero no hidrata los asignados.

## Scope

### In Scope
- Backend: Crear endpoint `GET /menu-options/:id/endpoints` para obtener endpoints asignados
- Backend: Crear filtro de endpoints por módulo/ruta (búsqueda por prefijo de ruta)
- Frontend: Mejorar la matriz de roles con agrupación por ámbito (`platform`, `organization`, `public`)
- Frontend: Agregar indicador visual de permisos (lectura/escritura) en la matriz
- Frontend: Indicadores visuales en el árbol para nodos con hijos (flechas, iconos)
- Frontend: Modal de confirmación antes de borrar opciones de menú
- Frontend: Hidratación correcta del panel de endpoints asignados al seleccionar
- Frontend: Estrategia de orden visible — mostrar recomendación (10 en 10 para padres, 1 en 1 para hijos)

### Out of Scope
- Arrastrar y soltar para reordenar (requeriría frontend avanzado y estrategia de pesos)
- Descubrimiento automático de endpoints desde controladores (future phase)
- Permisos de lectura/escritura sobre endpoints específicos (governance de APIs fuera de scope)
- Historial de cambios en menú

## Capabilities

### New Capabilities
- Administración completa e intuitiva de jerarquía de menús con endpoints asociados
- Visualización clara de matriz de acceso por rol y ámbito
- Confirmación de borrado para evitar pérdida accidental de datos

### Modified Capabilities
- `MenuOptionEndpointEntity` — mejor consumida desde frontend
- `RoleMatrix` — mejorada en presentación y filtrado

## Dependencies

- **Depende de**: F5 (Menús dinámicos administrables) — completamente implementada y archivada
- **Bloquea**: nada. Es una mejora de UX/funcionalidad sobre la base.

## Risks

- **R1 — Cambios en API**: Agregar nuevo endpoint `GET /menu-options/:id/endpoints` es aditivo (no rompe compatibilidad), pero debe cachearse igual que F5 (D4 — invalidación de `menu:v1:*`)
- **R2 — Doble panel complejo**: El componente `EndpointPickerComponent` ya existe; hidratar correctamente los asignados requiere coordinar llamadas al backend. Mitigation: llamada secuencial en `menu-options.component.ts`.

## Approach

1. **Backend primero**: Agregar endpoint de lectura de endpoints asignados + filtro por módulo en catálogo
2. **Frontend después**: Mejorar matriz, árbol, panel de endpoints y confirmación de borrado
3. **Validación**: Pruebas unitarias + smoke test manual de la pantalla completa

## Timeline

Sin estimación, pero probablemente 2 sprints (1 backend discovery, 1 frontend UX).
