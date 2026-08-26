# Design - Persistencia Offline (IndexedDB + PWA)

## Arquitectura y Decisiones Técnicas

### 1. PWA y Service Worker
**Decisión:** Se utilizará `@angular/pwa` para el registro automático e instalación del Service Worker (`ngsw-worker.js`).
**Justificación:** Angular CLI provee una integración oficial y robusta para el caché de archivos estáticos (HTML, JS, CSS, assets). 
**Alternativa descartada:** Escribir un Service Worker personalizado desde cero con Workbox. Descartado porque rompe el ecosistema de actualización de Angular y requiere mantenimiento adicional del pipeline de build.

### 2. Intercepción de peticiones Offline
**Decisión:** En lugar de depender de la API de *Background Sync* directamente en el Service Worker, se implementará un `OfflineInterceptor` (HttpInterceptor en Angular).
**Justificación:** El Service Worker generado por Angular (`ngsw`) no soporta encolamiento nativo de peticiones POST/PUT. Modificar `ngsw-worker.js` es un antipatrón en Angular. Al interceptar los errores de red (status `0` o `504`) en la capa de Angular, podemos guardar el payload en una base de datos local de forma segura y garantizada.
**Alternativa descartada:** Usar Background Sync de Workbox, ya que requeriría expulsar la configuración de Angular PWA (`ng add @angular/pwa`) y usar `@angular-builders/custom-webpack` para inyectar Workbox.

### 3. Motor de Base de Datos Local
**Decisión:** Se utilizará la librería `dexie` (un wrapper ligero de IndexedDB).
**Justificación:** IndexedDB nativo usa callbacks antiguos y es difícil de manejar. `dexie` provee una API basada en Promesas, excelente tipado de TypeScript y permite consultas complejas si en el futuro queremos guardar los reportes cacheados.
**Esquema Propuesto:**
- Tabla `syncQueue`: `{ id: autoIncrement, url: string, method: string, body: any, headers: any, createdAt: timestamp, status: 'pending' | 'failed' }`

### 4. Sincronización Automática
**Decisión:** Se creará un `SyncService` que escuche los eventos globales del navegador `window.addEventListener('online')`. Cuando se detecte conexión, el servicio iterará sobre la tabla `syncQueue` reenviando las peticiones a través del `HttpClient`. Si la respuesta es 2xx, se elimina el registro de IndexedDB.

## Archivos a Crear / Modificar
- `[NEW] src/app/core/interceptors/offline.interceptor.ts`: Atrapa fallos de red.
- `[NEW] src/app/core/services/database.service.ts`: Wrapper de Dexie para IndexedDB.
- `[NEW] src/app/core/services/sync.service.ts`: Escucha conexión y vacía la cola.
- `[MOD] angular.json` y `package.json`: Afectados por `ng add @angular/pwa` y la instalación de `dexie`.
- `[MOD] src/app/app.config.ts`: Para registrar el nuevo interceptor y la inicialización de los servicios.
