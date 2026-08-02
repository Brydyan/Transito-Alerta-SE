# Análisis de Brechas (Gap Analysis) — Proyecto Integrador

Este documento detalla el estado actual del **Sistema Web de Gestión de Incidencias Georreferenciadas** frente a los requisitos establecidos en el archivo de lineamientos: [2026_Proyecto_Estudiantes_TecDesWeb-3.md](file:///home/yan2005dris-afk/Documentos/GitHub/sistema-incidencias-georreferenciadas/docs/2026_Proyecto_Estudiantes_TecDesWeb-3.md).

---

## 📊 Estado de los Requisitos del Sistema

### 1. Gestión de Incidencias (CRUD)
* **Estado**: **Parcialmente Implementado**
* **Detalle**: Las rutas del CRUD básico están en el backend y el frontend maneja creación y edición. Sin embargo, hay cambios locales modificados y archivos borrados en `IncidentController.php` que modificaron el flujo original de confirmación.

### 2. Gestión de Estados con Historial
* **Estado**: **Totalmente Implementado**
* **Detalle**:
  * **Backend**: Existe un trigger en la base de datos (`log_incident_status`) que registra automáticamente las transiciones en `status_history`.
  * **Frontend**: La página de detalles de la incidencia renderiza el historial de manera correcta con formato local de Ecuador (`es-EC`).

### 3. Asignación de Responsables (Múltiple y con Roles)
* **Estado**: **No Implementado (Incumple especificación)**
* **Detalle**: La tabla de asignación múltiple (`assignments`) fue eliminada a nivel de migración en la base de datos (`2026_07_05_000001_drop_assignments_table.php`). En su lugar, se implementó un flujo simplificado de operador único (`claimed_by`). Los roles específicos de "responsable" y "apoyo" no están definidos.

### 4. Sistema de Comentarios / Seguimiento
* **Estado**: **Incompleto**
* **Detalle**: El backend soporta comentarios (rutas, controlador, migración y modelo). Sin embargo, en el frontend **no existe la interfaz** para listarlos o crearlos en la página de detalles de la incidencia.

### 5. Ubicación Normalizada (País, Provincia, Ciudad)
* **Estado**: **Implementado con Diseño Alternativo**
* **Detalle**: Se utiliza una sola tabla recursiva de `locations` con una restricción `CHECK` para los niveles (`country`, `province`, `city`, `neighborhood`). Un trigger de PostGIS (`trg_auto_assign_location`) asigna de manera automática la ubicación según las coordenadas geográficas de la incidencia.

### 6. Clasificación Jerárquica (Tipo -> Subtipo)
* **Estado**: **Parcialmente Implementado**
* **Detalle**: El backend tiene un trigger (`trg_validate_leaf_category`) que impide guardar una incidencia con una categoría padre. No obstante, el frontend carga una lista plana en el selector de categorías, mezclando padres y subtipos. Esto provoca que el sistema falle a nivel de base de datos si el usuario elige una categoría padre.

### 7. Notificaciones del Sistema (Leído / No leído)
* **Estado**: **Incompleto**
* **Detalle**: Implementado en el backend y en la interfaz del Administrador. Sin embargo, en la interfaz del ciudadano (`citizen`), la campana de notificaciones no es funcional (carece de listeners, contador y ruta).

### 8. Prioridad y Control
* **Estado**: **Parcialmente Implementado**
* **Detalle**: Se registran las prioridades y la fecha de resolución (`resolution_date`). Falta calcular y mostrar el tiempo promedio de resolución en el sistema.

### 9. Consultas, Filtros y Métricas (Dashboard)
* **Estado**: **Parcialmente Implementado**
* **Detalle**: Existe un endpoint de estadísticas y un dashboard con KPI y gráfico de torta de estados (C3.js/D3.js). Sin embargo, faltan filtros avanzados en el dashboard y el cálculo del tiempo promedio de resolución por categoría o ubicación.

### 10. Despliegue en Contenedores (Docker)
* **Estado**: **Totalmente Implementado**
* **Detalle**: Configuración completa de 6 contenedores (`frontend`, `backend`, `db` con PostGIS, `redis`, `rustfs` S3-compatible, y túnel `cloudflared`).

### 11. Calidad y Pruebas de Software
* **Estado**: **Parcialmente Implementado**
* **Detalle**: El backend cuenta con 41 pruebas Pest (Unit/Feature) y reporte de errores centralizado. El frontend tiene 19 archivos de prueba con Vitest, pero carece de pruebas para el módulo CRUD y de detalles de incidencias del administrador.

---

## 🛠️ Archivos Clave Afectados
- [IncidentController.php](file:///home/yan2005dris-afk/Documentos/GitHub/sistema-incidencias-georreferenciadas/backend/app/Domains/Incidents/Http/IncidentController.php) — Modificado localmente (endpoints eliminados/cambiados).
- [incidencias.detail.component.html](file:///home/yan2005dris-afk/Documentos/GitHub/sistema-incidencias-georreferenciadas/frontend/app/incidencias/pages/detail/incidencias.detail.component.html) y [feed-detail.component.html](file:///home/yan2005dris-afk/Documentos/GitHub/sistema-incidencias-georreferenciadas/frontend/app/feed/pages/detail/feed-detail.component.html) — Carecen de la UI para comentarios.
- [dashboard.component.js](file:///home/yan2005dris-afk/Documentos/GitHub/sistema-incidencias-georreferenciadas/frontend/app/dashboard/pages/dashboard/dashboard.component.js) — Falta integrar filtros y métricas de resolución.
- [app.js](file:///home/yan2005dris-afk/Documentos/GitHub/sistema-incidencias-georreferenciadas/frontend/app/app.js) — Falta de ruteo/interacción para notificaciones en el layout de ciudadanos.
