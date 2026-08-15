# Design - Global Pagination

## Architecture Overview
La arquitectura de paginación aprovecha las funcionalidades existentes de Laravel (`simplePaginate` o `cursorPaginate`) para optimizar el rendimiento del servidor. En el cliente, el componente genérico `app-data-table` intercepta la meta-información de paginación y actualiza sus botones automáticamente, orquestando las llamadas a los servicios inyectados.

## 1. Backend Controllers Modifications
Actualizar el método `index` de los siguientes controladores para usar `simplePaginate($request->input('per_page', 15))` en lugar de `get()`:
- `CategoriaIncidenciaController`
- `InstitucionController`
- `RoleController`
- `PermisoController` (o como esté nombrado)
- `TerritorioController`, `DireccionController` (si aplican)
- `MenuOptionController`

## 2. Frontend Services Signature Updates
Los archivos `.service.js` correspondientes a las entidades de arriba (ej: `institucion.service.js`, `role.service.js`) deben actualizar la firma de su método principal a:
```javascript
getAll(page = 1, perPage = 15, cursor = null) {
  let url = '/endpoint?';
  if (cursor) {
    url += `cursor=${cursor}&per_page=${perPage}`;
  } else {
    url += `page=${page}&per_page=${perPage}`;
  }
  return apiRequest(url);
}
```
Esto permite soportar ambos métodos de paginación si alguna vez deciden migrar entre cursores o compensar (offset), así como seleccionar la cantidad.

## 3. Frontend Data Binding
El componente UI `app-data-table` en todos los listados ya delega su acción a `load(Service.getAll)`. Al cambiar el servicio y el controlador, la UI automáticamente revelará la paginación gracias a los condicionales existentes en su `load()`:
```javascript
if (response && response.current_page !== undefined) {
    // Show pagination block
}
```

## Risks
1. Si un dropdown/select asíncrono confía en que `index` retorna toda la colección (`get()`) en un arreglo, la paginación podría quebrar ese input devolviendo un objeto con paginación (`data` dentro).
  - *Mitigación:* Revisar componentes que usan listas completas para Dropdowns. De ser necesario, pasar un flag `?all=true` para deshabilitar paginación en endpoints específicos, o mapear al `.data` localmente en el componente.
