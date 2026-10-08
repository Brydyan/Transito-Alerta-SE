# Proposal: MinIO Object Storage Integration for Staging & Local Environments

**Historia/Ticket**: Epic 192 («⚠️ GeoReporta», workspace `upse`)  
**Scope**: `infra/2026-10-07-minio-object-storage`  
**Autor**: Arquitecto SDD  
**Fecha**: 2026-10-07  

---

## Intent

Actualmente, el sistema admite dos proveedores de almacenamiento de objetos (`STORAGE_PROVIDER` en `backend/src/config/storage.config.ts`):
1. `'supabase'`: Integración con Supabase Storage (requiere credenciales en la nube y cuenta activa con cuotas limitadas).
2. `'noop'`: Implementación local de pruebas (`NoopStorageClient`), que escribe en disco y retorna URLs con esquema `file:///app/.storage/...`.

### Problema
En el servidor de **Staging** (que corre sobre Docker):
- Al usar `STORAGE_PROVIDER=noop`, los navegadores web bloquean las imágenes porque no permiten cargar recursos con el protocolo `file://` (`Not allowed to load local resource`). Además, la ruta local del contenedor no es accesible desde el cliente.
- Depender de una cuenta gratuita de Supabase para staging resulta problemático por los límites estrictos de cuota, ancho de banda y almacenamiento de la capa gratuita, así como por la dependencia de conectividad a la nube.
- La base de datos guarda URLs firmadas de Supabase que expiran en 1 hora (`3600s`), dejando enlaces rotos con error 403 a los 60 minutos.

### Propósito
Integrar **MinIO** como un servicio de almacenamiento de objetos compatible con la API de Amazon S3 dentro de `compose.yaml` para el perfil de staging y desarrollo local. MinIO almacenará los archivos directamente en el disco del host mediante volúmenes Docker, proporcionando URLs HTTP públicas persistentes (sin expiración), un panel web de administración visual (puerto 9001), y eliminando cualquier cuota o costo de terceros en staging.

---

## Scope

### In Scope

1. **Infraestructura Docker (`compose.yaml`)**:
   - Agregar el servicio `minio` (puerto 9000 para API S3 y 9001 para consola web administrativa).
   - Agregar volumen persistente `minio-data` en `compose.yaml`.
   - Agregar contenedor inicializador `minio-init` con `minio/mc` para crear el bucket `uploads` y configurar política de descarga pública anónima en el bucket.
   - Configurar variables de entorno en `.env` y `.env.example`.

2. **Backend NestJS (`backend/`)**:
   - Instalar `@aws-sdk/client-s3` en `backend/package.json`.
   - Extender `StorageConfig` en `backend/src/config/storage.config.ts` para admitir `provider: 'minio' | 'supabase' | 'noop'` junto con sus variables de conexión (`endpoint`, `publicUrl`, `accessKey`, `secretKey`, `bucket`, `forcePathStyle`).
   - Implementar `MinioStorageClient` cumpliendo la interfaz `IStorageClient` (`upload`, `getSignedUrl`, `delete`).
   - Actualizar `storage-provider.factory.ts` para resolver `MinioStorageClient` cuando `STORAGE_PROVIDER=minio`.
   - Tests unitarios y de integración para `MinioStorageClient` y la fábrica de proveedores.

3. **Nginx Frontend Reverse Proxy (`frontend/nginx.conf`)**:
   - Exponer la ruta proxy `/storage/` en Nginx dirigida a `http://minio:9000/uploads/` para que las imágenes se sirvan por el mismo puerto y host del frontend, eliminando problemas de CORS o puertos adicionales.

### Out of Scope

- Modificar los servicios de negocio (`IncidentImagesService`, `CommentImagesService`, `AvatarStorageService`): la interfaz `IStorageClient` se mantiene intacta.
- Modificar el flujo de compresión de imágenes (`ImageCompressionService`): Sharp sigue procesando WebP con las mismas cotas de calidad y tamaño.
- Implementar la galería en el detalle de incidencia (pertenece a la tarea de UI del frontend SC-305 / F3.6).
- Migrar archivos existentes en bases de datos anteriores.

---

## Capabilities

### New Capabilities
- `minio-storage`: Provee almacenamiento local de objetos compatible con S3 mediante MinIO en Docker y el cliente `MinioStorageClient` en NestJS, sirviendo URLs HTTP públicas directas o a través de Nginx.

### Modified Capabilities
- `object-storage`: El contrato de selección de proveedores en `storage.config.ts` y `storage-provider.factory.ts` ahora incluye `'minio'` como opción válida junto a `'supabase'` y `'noop'`.

---

## Approach

1. **Aislamiento de la Interfaz**:
   Se reutiliza estrictamente `IStorageClient` de `backend/src/core/storage/storage-client.interface.ts`. Los consumidores no conocen si el almacenamiento es MinIO o Supabase.

2. **URLs Públicas sin Expiración**:
   A diferencia de Supabase (que usa URLs firmadas de 1 hora), MinIO configura el bucket `uploads` con política de lectura pública para visualización (`mc anonymous set download local/uploads`). La URL devuelta es permanente:
   `http://<PUBLIC_HOST>:<PORT>/storage/incidents/<id>/<uuid>.webp` o `http://<MINIO_HOST>:9000/uploads/...`.

3. **Doble resolución de URLs (Interna vs Pública)**:
   El backend se comunica con MinIO dentro de la red Docker (`http://minio:9000`), pero el navegador del usuario debe acceder a la URL pública (`STORAGE_MINIO_PUBLIC_URL` o Nginx proxy `/storage/`). `MinioStorageClient` construye la URL pública accesible por el cliente externo.

---

## Affected Areas

| Área | Archivos | Impacto |
|---|---|---|
| Infraestructura | `compose.yaml`, `.env`, `backend/.env.example` | Nuevo servicio `minio` + `minio-init` + volumen `minio-data` |
| Configuración | `backend/src/config/storage.config.ts` | Nuevas variables de configuración `minio` |
| Core Storage | `backend/src/core/storage/minio-storage.client.ts` (NUEVO)<br/>`backend/src/core/storage/minio-storage.client.spec.ts` (NUEVO)<br/>`backend/src/core/storage/storage-provider.factory.ts`<br/>`backend/src/core/storage/storage-provider.factory.spec.ts` | Implementación del cliente S3/MinIO y selección en la fábrica |
| Dependencias | `backend/package.json`, `backend/pnpm-lock.yaml` | Añadir `@aws-sdk/client-s3` |
| Frontend Nginx | `frontend/nginx.conf` | Location `/storage/` como reverse proxy a MinIO |
