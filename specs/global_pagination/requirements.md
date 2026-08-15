# Requirements - Global Pagination

## Goal
Añadir soporte global de paginación en todos los módulos de la aplicación, tanto en el frontend como en el backend, permitiendo navegar grandes volúmenes de datos con botones de "Siguiente" y "Anterior".

## Current State
1. Algunos endpoints del backend devuelven toda la colección con `get()`, lo cual causa problemas de memoria y lentitud con muchos registros.
2. El componente `app-data-table` en el frontend ya tiene la estructura UI (botones Next/Prev) y lógica interna para soportar `simplePaginate` y `cursorPaginate`, pero no está siendo utilizada correctamente en la mayoría de listados.
3. Algunos servicios del frontend (ej: `user.service.js`) no soportan pasar parámetros dinámicos de paginación (`page` o `cursor`) correctamente.

## Functional Requirements
- **R1:** El backend debe devolver respuestas paginadas (`simplePaginate($perPage)`) para los endpoints `index` de Usuarios, Roles, Permisos, Instituciones, Categorías de Incidencia, Ubicaciones (Territorios, Direcciones). La variable `$perPage` debe ser leída del request (ej: `?per_page=15`).
- **R2:** Los servicios VanillaJS del frontend deben ser actualizados para aceptar los parámetros `(page = 1, perPage = 15, cursor = null)` y adjuntarlos a la URL de la API.
- **R3:** Todos los listados del frontend basados en `app-data-table` deben integrar y mostrar controles de navegación funcionales, así como un combobox/select para que el usuario pueda elegir el número de registros (5, 10, 15) en tiempo real.
- **R4:** El frontend debe conservar el uso de `load(() => Service.getAll(params))` que delega el control de página al componente de tabla.

## Non-Functional Requirements
- **NFR1:** Mantener consistencia en el tamaño de página (`per_page = 15`) en todos los listados.
- **NFR2:** Asegurar que si ocurre un fallo en los parámetros de la URL, se maneje de forma segura.
