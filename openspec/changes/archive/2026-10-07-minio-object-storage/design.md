# Technical Design: MinIO Object Storage Integration

**Change**: `infra/2026-10-07-minio-object-storage`  
**Status**: DRAFT  
**Author**: Arquitecto SDD  

---

## Architectural Context

El sistema ya posee una costura de abstracción en `backend/src/core/storage/storage-client.interface.ts`:
```typescript
export interface StorageUploadResult {
  key: string;
  url: string;
}

export interface IStorageClient {
  upload(key: string, buffer: Buffer, mimetype: string): Promise<StorageUploadResult>;
  getSignedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
```

Esta separación garantiza que cambiar o añadir un backend de almacenamiento no genera *churn* en los controladores ni en los servicios de negocio (`IncidentImagesService`, `CommentImagesService`, `AvatarStorageService`).

---

## Decisions

### D1: MinIO como Proveedor de Almacenamiento Local en Docker
* **Decisión**: Incorporar MinIO como servicio en `compose.yaml` para persistir objetos en un volumen Docker local (`minio-data`).
* **Alternativa rechazada**: Almacenar imágenes en una base de datos NoSQL (MongoDB / GridFS).
  * *Motivo de rechazo*: Una BD NoSQL consume cientos de megabytes de RAM innecesariamente, satura el pool de conexiones de Node.js al transferir streams binarios y no ofrece streaming de alto rendimiento a nivel de kernel (`sendfile`) ni cabeceras HTTP de caché nativas (`ETag`, `Cache-Control`, `Range requests`).
* **Alternativa rechazada**: Continuar con `NoopStorageClient` devolviendo `file://`.
  * *Motivo de rechazo*: Los navegadores web bloquean `file://` por política de seguridad y la ruta interna de Docker no existe en los clientes remotos.

### D2: Uso de `@aws-sdk/client-s3` como SDK Cliente
* **Decisión**: Usar el SDK oficial modular de AWS v3 (`@aws-sdk/client-s3`).
* **Alternativa rechazada**: Usar la librería npm `minio`.
  * *Motivo de rechazo*: `@aws-sdk/client-s3` es el estándar universal de la industria para S3-compatible APIs. Es compatible con MinIO, AWS S3, Cloudflare R2, Wasabi y LocalStack. MinIO implementa fielmente la API S3 de AWS, lo que evita atar el código a una librería propietaria de MinIO.

### D3: Política de Descarga Pública Permanente para `uploads` en Staging
* **Decisión**: Configurar el bucket `uploads` en MinIO con política de lectura pública anónima (`mc anonymous set download local/uploads`). El método `getSignedUrl(key)` devolverá la URL pública directa sin firma temporal ni expiración.
* **Alternativa rechazada**: Generar URLs firmadas con expiración de 1 hora (TTL 3600s).
  * *Motivo de rechazo*: Como se comprobó en la auditoría técnica, la base de datos persiste la URL generada al momento del upload. Si la URL vence a los 60 minutos, las imágenes quedan rotas de forma permanente en la base de datos. Una política pública para imágenes de incidencias ciudadanas y avatares resuelve este problema de raíz.

### D4: Reverse Proxy en Nginx (`/storage/`)
* **Decisión**: Agregar en `frontend/nginx.conf` una directiva `location /storage/` que actúe como proxy inverso hacia `http://minio:9000/uploads/`.
* **Alternativa rechazada**: Exponer directamente el puerto `9000` de MinIO a los navegadores clientes.
  * *Motivo de rechazo*: Exponer puertos directos genera problemas de CORS, requiere abrir puertos extra en el firewall del servidor y complica el uso de HTTPS con certificados SSL en staging. El proxy en Nginx permite que las imágenes se sirvan por el mismo dominio y puerto del frontend (`http://servidor:8083/storage/...`).

### D5: Separación de Endpoints Interno vs Público
* **Decisión**: En `StorageConfig` se definen dos endpoints:
  1. `minioEndpoint`: Endpoint interno de red Docker que usa NestJS para subir y borrar archivos (`http://minio:9000`).
  2. `minioPublicUrl`: URL base que ven los clientes externos en el navegador (por ej. `http://servidor:8083/storage` o `http://localhost:9000/uploads`).
* **Alternativa rechazada**: Usar una sola variable de URL.
  * *Motivo de rechazo*: El contenedor del backend resuelve `minio` a través del DNS interno de Docker, mientras que el navegador del usuario en internet o red local no conoce el host `minio`.

---

## Technical Specifications & Schemas

### 1. Extensión de `StorageConfig` (`backend/src/config/storage.config.ts`)

```typescript
export interface StorageConfig {
  provider: 'supabase' | 'minio' | 'noop';
  // Supabase
  supabaseUrl: string | undefined;
  supabaseServiceKey: string | undefined;
  supabaseBucket: string;
  // MinIO / S3
  minioEndpoint: string | undefined;
  minioPublicUrl: string | undefined;
  minioAccessKey: string | undefined;
  minioSecretKey: string | undefined;
  minioBucket: string;
  minioForcePathStyle: boolean;
}
```

### 2. Estructura de `MinioStorageClient`

```typescript
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { StorageConfig } from '../../config/storage.config';
import { IStorageClient, StorageUploadResult } from './storage-client.interface';

@Injectable()
export class MinioStorageClient implements IStorageClient {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(conf: StorageConfig) {
    if (!conf.minioEndpoint) {
      throw new Error('STORAGE_MINIO_ENDPOINT is required when STORAGE_PROVIDER=minio');
    }
    if (!conf.minioAccessKey) {
      throw new Error('STORAGE_MINIO_ACCESS_KEY is required when STORAGE_PROVIDER=minio');
    }
    if (!conf.minioSecretKey) {
      throw new Error('STORAGE_MINIO_SECRET_KEY is required when STORAGE_PROVIDER=minio');
    }

    this.bucket = conf.minioBucket || 'uploads';
    this.publicUrl = (conf.minioPublicUrl || `${conf.minioEndpoint}/${this.bucket}`).replace(/\/$/, '');

    this.client = new S3Client({
      endpoint: conf.minioEndpoint,
      region: 'us-east-1', // MinIO acepta cualquier región
      credentials: {
        accessKeyId: conf.minioAccessKey,
        secretAccessKey: conf.minioSecretKey,
      },
      forcePathStyle: true, // Requerido para MinIO (path-style: http://endpoint/bucket/key)
    });
  }

  async upload(key: string, buffer: Buffer, mimetype: string): Promise<StorageUploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    const url = `${this.publicUrl}/${key}`;
    return { key, url };
  }

  async getSignedUrl(key: string): Promise<string> {
    // Al ser bucket con política pública de descarga, retorna la URL directa permanente
    return `${this.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      // Idempotente: no propagar error si el objeto ya no existe
    }
  }
}
```

### 3. Docker Compose (`compose.yaml`)

```yaml
  # ── MinIO (Almacenamiento de Objetos Staging/Local) ───────────────────────────
  minio:
    image: minio/minio:latest
    container_name: tase-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    ports:
      - '${MINIO_PORT:-9000}:9000'
      - '${MINIO_CONSOLE_PORT:-9001}:9001'
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin123}
    volumes:
      - minio-data:/data
    healthcheck:
      test: ['CMD', 'mc', 'ready', 'local']
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      until /usr/bin/mc alias set local http://minio:9000 ${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-minioadmin123}; do
        echo 'Esperando a MinIO...';
        sleep 2;
      done;
      /usr/bin/mc mb --ignore-existing local/${STORAGE_MINIO_BUCKET:-uploads};
      /usr/bin/mc anonymous set download local/${STORAGE_MINIO_BUCKET:-uploads};
      echo 'Bucket de MinIO configurado con éxito.';
      exit 0;
      "

volumes:
  postgres-data:
  redis-data:
  minio-data:
```

### 4. Nginx Reverse Proxy (`frontend/nginx.conf`)

```nginx
location /storage/ {
    proxy_pass http://minio:9000/uploads/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Cache de imágenes en cliente
    expires 30d;
    add_header Cache-Control "public, no-transform";
}
```
