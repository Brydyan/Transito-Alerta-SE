# Tasks - Global Pagination

- [ ] 1. Modificar `CategoriaIncidenciaController@index` para aceptar `per_page` dinámico y usar `simplePaginate($perPage)` en vez de `get()`. Permitir flag `?all=true` para no quebrar comboboxes en el frontend.
- [ ] 2. Modificar `InstitucionController@index` para usar `simplePaginate($perPage)` en vez de `get()`. Permitir flag `?all=true`.
- [ ] 3. Modificar `RoleController@index` para usar `simplePaginate($perPage)` en vez de `get()`. Permitir flag `?all=true`.
- [ ] 4. Modificar `PermisoController@index` (si existe index general) o equivalentes de UBICACIONES (`TerritorioController`, `DireccionController`) para retornar `simplePaginate($perPage)`.
- [ ] 5. Actualizar la firma y lógica de paginación de todos los servicios frontend involucrados (`institucion.service.js`, `categoria-incidencia.service.js`, `role.service.js`, `user.service.js`, etc.) para soportar variables `page` y `per_page` (o cursor).
- [ ] 6. Verificar y adaptar cualquier componente select/dropdown del frontend (ej: formularios de creación) para que envíe el parámetro `?all=true` al solicitar data a la API, para garantizar que reciba el listado completo.
- [ ] 7. Modificar la plantilla y clase base de `app-data-table` para incluir un `dropdown/select` (Mostrando 5, 10, 15 registros por página) en el `card-footer` que actualice la tabla en tiempo real invocando a `per_page`.
- [ ] 8. Probar las tablas y pantallas Index en el Frontend para asegurar que los controles Siguiente/Anterior y Selector de Tamaño de Página aparecen y cambian los datos correctamente.
