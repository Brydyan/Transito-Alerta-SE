# Tasks - Persistencia Offline (IndexedDB + PWA)

- [x] T1 — Ejecutar `ng add @angular/pwa` para configurar el Service Worker, `manifest.webmanifest`, íconos y reglas en `angular.json`. Cubre: R1.
- [x] T2 — Instalar la dependencia `dexie` (`pnpm add dexie`). Cubre: R2.
- [x] T3 — Crear el servicio de base de datos local `DatabaseService` en `src/app/core/services/database.service.ts` definiendo la tabla de `syncQueue`. Cubre: R2.
- [x] T4 — Crear `OfflineInterceptor` en `src/app/core/interceptors/offline.interceptor.ts`. Este interceptor debe atrapar errores `status === 0` o `status === 504` en métodos POST/PUT, y guardar la petición en el `DatabaseService`. Cubre: R3.
- [x] T5 — Registrar el `OfflineInterceptor` en `src/app/app.config.ts`. Cubre: R3.
- [x] T6 — Crear `SyncService` en `src/app/core/services/sync.service.ts` que escuche los eventos `online` del navegador, extraiga los registros pendientes de IndexedDB y los re-intente contra el servidor. Cubre: R4, R5.
- [x] T7 — Escribir pruebas unitarias para el interceptor y los servicios, garantizando la trazabilidad. Cubre: R1, R2, R3, R4, R5.
