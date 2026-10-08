# Tasks: MinIO Object Storage Integration

**Change**: `infra/2026-10-07-minio-object-storage`  
**Status**: PENDING  
**Story/Ticket**: Epic 192 («⚠️ GeoReporta»)  

---

## Phase 1: Dependencias y Configuración

- [ ] **T1.1**: Instalar `@aws-sdk/client-s3` en `backend/` usando `pnpm add @aws-sdk/client-s3`.
- [ ] **T1.2**: Extender interfaz `StorageConfig` en `backend/src/config/storage.config.ts` para admitir `'minio'` y campos `minioEndpoint`, `minioPublicUrl`, `minioAccessKey`, `minioSecretKey`, `minioBucket`, `minioForcePathStyle`.
- [ ] **T1.3**: Actualizar variables de ejemplo en `backend/.env.example` y documentar configuración de MinIO para staging.

---

## Phase 2: Implementación de `MinioStorageClient` y Tests Unitarios

- [ ] **T2.1**: Crear `backend/src/core/storage/minio-storage.client.ts` implementando `IStorageClient`:
  - Constructor con validación de credenciales (*fail-fast*).
  - Método `upload(key, buffer, mimetype)` enviando `PutObjectCommand`.
  - Método `getSignedUrl(key)` resolviendo la URL pública permanente.
  - Método `delete(key)` enviando `DeleteObjectCommand` (idempotente).
- [ ] **T2.2**: Crear suite de pruebas unitarias `backend/src/core/storage/minio-storage.client.spec.ts` cubriendo:
  - Error de validación cuando faltan credenciales requeridas.
  - Envío correcto de `PutObjectCommand` con `Key`, `Bucket` y `ContentType`.
  - Retorno de URL pública formateada sin expiración.
  - Envío de `DeleteObjectCommand` y manejo tolerante a errores de eliminación.
- [ ] **T2.3**: Actualizar `backend/src/core/storage/storage-provider.factory.ts` para instanciar `MinioStorageClient` cuando `conf.provider === 'minio'`.
- [ ] **T2.4**: Actualizar `backend/src/core/storage/storage-provider.factory.spec.ts` agregando los casos de prueba para el proveedor `minio`.

---

## Phase 3: Infraestructura Docker y Proxy Nginx

- [ ] **T3.1**: Añadir servicios `minio` y `minio-init` en `compose.yaml` con volumen `minio-data` y configuración de salud (*healthcheck*).
- [ ] **T3.2**: Configurar `minio-init` para crear automáticamente el bucket `uploads` y asignar política anónima de descarga (`mc anonymous set download local/uploads`).
- [ ] **T3.3**: Añadir `location /storage/` en `frontend/nginx.conf` como reverse proxy hacia `http://minio:9000/uploads/` con encabezados de caché y reenvío de host.

---

## Phase 4: Verificación y CI Gates

- [ ] **T4.1**: Ejecutar suite completa de tests del backend (`pnpm test` en `backend/`) y verificar 0 fallos.
- [ ] **T4.2**: Ejecutar build del backend (`pnpm run build` en `backend/`) y verificar compilación limpia (exit 0).
- [ ] **T4.3**: Verificar levantamiento de contenedores con `docker compose config` sin errores de sintaxis.
- [ ] **T4.4**: Redactar `verify-report.md` con matriz de cumplimiento de requisitos R1–R5.
