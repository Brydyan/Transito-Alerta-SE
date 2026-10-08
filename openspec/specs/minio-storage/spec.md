# Specification: MinIO Object Storage Integration

**Capability**: `minio-storage`  
**Parent Change**: `2026-10-07-minio-object-storage`  
**Status**: CANONICAL  
**Date**: 2026-10-08  

---

## Background

El sistema maneja archivos de imágenes para tres dominios: incidencias ciudadanas, comentarios y fotos de perfil de usuarios. La persistencia física delega en `IStorageClient`. Para entornos locales y de staging desplegados mediante Docker, se requiere un proveedor que persista en disco local a través de la API S3 estándar, sin depender de cuentas en la nube y generando URLs HTTP accesibles por el navegador.

---

## Requirements

### R1: Selección de Proveedor MinIO
Cuando la variable de entorno `STORAGE_PROVIDER` está configurada con el valor `'minio'`, el sistema DEBE inicializar `MinioStorageClient` con la configuración provista. Si faltan credenciales requeridas (`STORAGE_MINIO_ENDPOINT`, `STORAGE_MINIO_ACCESS_KEY`, o `STORAGE_MINIO_SECRET_KEY`), el arranque DEBE fallar inmediatamente con un error descriptivo (*fail-fast*).

#### Scenario R1.1: Inicialización exitosa de MinIO
- **Given** una configuración con `STORAGE_PROVIDER=minio`, `STORAGE_MINIO_ENDPOINT=http://minio:9000`, `STORAGE_MINIO_ACCESS_KEY=admin`, `STORAGE_MINIO_SECRET_KEY=secret123`, y `STORAGE_MINIO_BUCKET=uploads`
- **When** se evalúa `resolveStorageClient(conf)`
- **Then** retorna una instancia de `MinioStorageClient`
- **And** el cliente queda listo para operar contra el endpoint configurado

#### Scenario R1.2: Fallo por credenciales faltantes
- **Given** una configuración con `STORAGE_PROVIDER=minio` pero sin `STORAGE_MINIO_ACCESS_KEY`
- **When** se evalúa `resolveStorageClient(conf)`
- **Then** lanza un error explícito indicando que las credenciales de MinIO son obligatorias

---

### R2: Subida de Archivos (Upload)
El método `upload(key, buffer, mimetype)` de `MinioStorageClient` DEBE enviar un comando `PutObject` al bucket configurado con la clave, el buffer binario y el encabezado `ContentType` correspondiente. La respuesta DEBE contener la clave persistida y la URL pública accesible.

#### Scenario R2.1: Subida de imagen WebP a MinIO
- **Given** una clave `incidents/inc-1/photo.webp`, un buffer de imagen y tipo `image/webp`
- **When** se invoca `upload("incidents/inc-1/photo.webp", buffer, "image/webp")`
- **Then** el objeto se persiste en MinIO bajo el bucket `uploads` con Content-Type `image/webp`
- **And** retorna `{ key: "incidents/inc-1/photo.webp", url: "<PUBLIC_URL>/incidents/inc-1/photo.webp" }`

---

### R3: Resolución de URLs Públicas sin Expiración
A diferencia de buckets privados que requieren URLs firmadas temporales, el bucket `uploads` de MinIO en staging tiene política de descarga pública. El método `getSignedUrl(key)` DEBE resolver la URL pública absoluta configurada en `STORAGE_MINIO_PUBLIC_URL` (o Nginx proxy), garantizando que la URL nunca expire después de 1 hora.

#### Scenario R3.1: Generación de URL pública permanente
- **Given** un objeto almacenado con clave `incidents/inc-1/photo.webp`
- **And** una configuración con `STORAGE_MINIO_PUBLIC_URL=http://staging.server:8083/storage`
- **When** se invoca `getSignedUrl("incidents/inc-1/photo.webp")`
- **Then** retorna `http://staging.server:8083/storage/incidents/inc-1/photo.webp`
- **And** la URL no contiene parámetros de expiración ni firmas temporales

---

### R4: Eliminación Idempotente (Delete)
El método `delete(key)` DEBE enviar un comando `DeleteObject` a MinIO para la clave especificada. La operación DEBE ser idempotente: si el objeto no existía previamente o ya fue borrado, la promesa DEBE resolverse satisfactoriamente sin lanzar excepciones no controladas.

#### Scenario R4.1: Eliminación exitosa de objeto existente
- **Given** un objeto existente en MinIO con clave `comments/c-1/uuid.webp`
- **When** se invoca `delete("comments/c-1/uuid.webp")`
- **Then** el objeto es eliminado de MinIO
- **And** la operación finaliza sin errores

#### Scenario R4.2: Eliminación idempotente de objeto inexistente
- **Given** una clave `comments/c-1/inexistente.webp` que no existe en el bucket
- **When** se invoca `delete("comments/c-1/inexistente.webp")`
- **Then** la operación finaliza sin lanzar error

---

### R5: Aprovisionamiento Automático en Docker Compose
El entorno de staging y dev en `compose.yaml` DEBE incluir el servicio `minio` y un contenedor auxiliar `minio-init` que configure automáticamente el bucket `uploads` y su política pública anónima en el arranque inicial.

#### Scenario R5.1: Primer arranque de Docker Compose
- **Given** los contenedores de `compose.yaml` levantados con `docker compose up -d`
- **When** el contenedor `minio-init` finaliza su ejecución
- **Then** el bucket `uploads` existe en MinIO
- **And** la política del bucket permite lectura pública de los objetos almacenados
