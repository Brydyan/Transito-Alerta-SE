# Tasks: Refactor Relación Incidencia-Institución a N:M (Apoyo)

- [ ] T1 — Crear migración de la tabla pivote `incidencia_institucion_apoyo` (incidencia_id, institucion_id). Cubre: R1.
- [ ] T2 — Agregar relación `institucionesApoyo()` al modelo `Incidencia`. Cubre: R1.
- [ ] T3 — Refactorizar filtrado en `buildIncidenciaQuery` (`IncidenciaController.php`) para incluir `orWhereHas('institucionesApoyo')`. Cubre: R5.
- [ ] T4 — Refactorizar `checkAccess` (`IncidenciaController.php`) para conceder acceso si es institución de apoyo. Cubre: R5.
- [ ] T5 — Agregar validación para array `instituciones_apoyo` en `IncidenciasRequest.php`. Cubre: R2.
- [ ] T6 — Modificar `IncidenciaService.php` (`create` y `update`) para sincronizar `institucionesApoyo` usando el array recibido (filtrando la principal). Cubre: R2.
- [ ] T7 — Frontend: Diseñar e implementar modal/selector de instituciones de apoyo en la pantalla de registro para Ciudadanos. Cubre: R3.
- [ ] T8 — Frontend: Diseñar e implementar selector/control de instituciones de apoyo en la pantalla de detalle de incidencia para Administradores y Supervisores. Cubre: R4.
- [ ] T9 — Actualizar/Crear Tests Feature para garantizar que un rol Institucion solo vea sus incidencias principales y de apoyo, y probar la sincronización al crear. Cubre: R1, R5.
