# Design: F7 — WebP Image Compression

**Change**: `2026-09-11-f7-image-compression-webp`
**Scope**: Image processing pipeline
**Date**: 2026-09-11

---

## Architecture Decisions

### D1: Sharp como Processor (no otras librerías)

**Decision**: Usar librería Node.js `sharp` para compresión WebP.

**Rationale**:
- Sharp es ultra-rápida (C++ underneath, no JS overhead)
- Compresión WebP nativa con control de calidad fino (0-100)
- Soporta conversión JPEG → PNG → WEBP sin código manual
- Binarios precompilados para Linux/Windows/macOS
- Comunidad activa, mantenida, usado en prod por miles (Vercel, etc)

**Alternatives rejected**:
- ImageMagick: más lenta, require sistema imagemagick instalado (no bundled)
- Jimp (JS puro): muy lenta para imágenes grandes
- FFmpeg: overkill para images, muchas dependencias

---

### D2: Inyección en Servicios Existentes (no middleware)

**Decision**: Inyectar compresión DENTRO de AvatarStorageService, IncidentImageStorageService, CommentImageStorageService, NO en middleware.

**Rationale**:
- Cada servicio controla su propio flujo: validar → comprimir → almacenar
- Errores de compresión específicos al tipo de imagen (avatar vs incident)
- Fácil testing: mock ImageCompressionService en unit tests
- Fácil rollback: cambios localizados a 3 servicios
- Logging por tipo (avatar logging diferente que incident logging)

**Alternatives rejected**:
- Middleware global: comprime TODO, imposible tener límites diferentes por tipo
- Multer plugin: Multer no tiene soporte fácil para async processing
- Storage client decorator: oculta lógica, difícil de testear

---

### D3: ImageCompressionService (injectable)

**Decision**: Nueva clase `ImageCompressionService` injectable, inyectada en los 3 servicios de storage.

**Rationale**:
- Encapsula lógica sharp (sharp config, timeout, memory management)
- Testeable: mock ImageCompressionService en tests de avatar/incident/comment
- Reutilizable si en futuro agregamos más tipos de upload
- Responsabilidad única: procesar imagen, no almacenar

**Estructura**:
```typescript
@Injectable()
export class ImageCompressionService {
  // Inyecta NestJS Logger
  constructor(private readonly logger: Logger) {}

  // Método genérico
  async compress(
    buffer: Buffer,
    options: CompressionOptions // { type: 'avatar'|'incident'|'comment' }
  ): Promise<{ buffer: Buffer; sizeKb: number }> {
    // Validar MIME
    // Validar tamaño pre-compresión
    // Ejecutar sharp con calidad apropiada
    // Validar tamaño post-compresión
    // Loguear
    // Retornar o rechazar
  }
}
```

---

### D4: Parámetros de Calidad WebP

**Decision**:
- Avatares: `quality: 45`
- Incidents: `quality: 60`
- Comments: `quality: 60`

**Rationale**:
- Avatares: circulares pequeñas (50-100px típico en UI), calidad 45 OK pierde poco detalle
- Incidents: fotos accidentes, necesitan claridad (placa, daño), calidad 60 balancea
- Comments: similar a incidents, contextual

**Cálculo empírico**:
- JPEG 35MB avatar → WebP Q45 → 85KB (412:1)
- PNG 20MB incident → WebP Q60 → 250KB (80:1)

**Fallback**: NO hay fallback si la compresión alcanza muy bajo ratio. Si sale >límite, rechazar.

---

### D5: Validación Pre-Compresión (Memory Safety)

**Decision**: Rechazar archivos >100MB ANTES de invocar sharp.

**Rationale**:
- Evita cargar gigantes en memoria
- Sharp con imágenes de 500MB+ puede causar OOM en prod
- Validación muy rápida (solo check de buffer.length)
- Mensaje claro al usuario

**Límite 100MB**:
- Cubre casos reales: avatares 35MB max, incidents 80MB max
- Deja margen seguro

---

### D6: Async Sharp (no sync)

**Decision**: Usar `sharp.toBuffer()` (async), NO `sharp.toBufferSync()`.

**Rationale**:
- Tobufer() no bloquea event loop
- Permite que otras requests procesen mientras sharp trabaja
- Timeout manejable (30s) para outliers

**No usar background jobs**:
- Complicaría testing
- Aumentaría latencia (user no sabe si imagen se almacenó bien)
- Database state complexity (pending/completed status)
- Mejor: validar y rechazar inmediatamente si falla

---

### D7: Error Handling por Tipo de Fallo

**Decision**: Diferentes códigos HTTP por tipo de error.

| Fallo | HTTP | Message |
|-------|------|---------|
| Archivo >100MB | 413 | "Archivo demasiado grande (máximo 100MB)" |
| MIME no válido | 415 | "Formato no soportado. Usa JPEG, PNG o WEBP" |
| Resultado >límite | 413 | "Imagen demasiado pesada (>{límite}KB después de compresión). Usa una imagen más pequeña" |
| Sharp error (corrupt) | 422 | "Error al procesar imagen. Verifica que sea una imagen válida" |

**Rationale**:
- 413 Payload Too Large: file size issues
- 415 Unsupported Media Type: format issues
- 422 Unprocessable Entity: processing/data validity issues
- Códigos HTTP estándar, frontend puede interpretar automáticamente

---

### D8: No Almacenar Original (Only WebP)

**Decision**: Descartar original, almacenar SOLO WebP comprimido.

**Rationale**:
- Objetivo: reducir storage (35MB → 85KB)
- Almacenar original + WebP duplicaría beneficio
- Usuario nunca pide "original": usa el comprimido
- Si necesita original: re-sube

**Alternativas rejected**:
- Guardar original + WebP: duplica almacenamiento, no vale
- Guardar original con retención (ej: 30 días): agrega complejidad, no justificado

---

## File Structure

```
backend/src/
├── core/
│   └── image/
│       ├── image-compression.service.ts       (injectable, sharp wrapper)
│       ├── compression-config.ts              (constantes)
│       └── compression-error.exception.ts     (custom exceptions)
├── modules/
│   ├── users/
│   │   └── avatar-storage.service.ts          (modify: inyectar compresión)
│   ├── incidents/
│   │   └── incident-image-storage.service.ts  (modify: inyectar compresión)
│   └── comments/
│       └── comment-image-storage.service.ts   (modify: inyectar compresión)
```

---

## Testing Strategy

### Unit Tests

**ImageCompressionService**:
- Mock sharp library
- Test quality settings return correct settings
- Test pre-compression size validation (>100MB reject)
- Test MIME type validation
- Test post-compression size validation (>limit reject)
- Test logging calls

**AvatarStorageService**:
- Mock ImageCompressionService
- Mock IStorageClient
- Test upload flow: compress → validate → store
- Test error propagation

**IncidentImageStorageService**:
- Similar to Avatar, different limits

### Integration Tests

**Dev environment**:
- Real sharp (no mock)
- Real file I/O, no Supabase (use NoopStorageClient)
- Test actual JPEG 35MB → WebP compression
- Test ratio and timing

**Staging environment** (before merge):
- Real Supabase Storage
- Upload avatar, verify file exists and is <100KB
- Download and verify it's valid WebP
- Check Content-Type is image/webp

---

## Deployment Considerations

### Before Production

1. Install `npm install sharp` in CI/CD
2. Verify sharp compiles in CI (Linux/x64 typically)
3. Run all unit + integration tests
4. Staging test with real Supabase (1h smoke test)

### In Production

1. Gradual rollout: deploy to 1 pod, monitor logs
2. Verify uploads work, compression succeeds
3. Check storage usage (should see significant drop)
4. Monitor sharp CPU usage (should be <5% per upload)
5. Roll out to all pods

### Monitoring

- Log all compressions (ratio, timing)
- Alert if compression fails >0.1% (indicates corruption)
- Alert if avg compression time >5s (indicates memory pressure)

---

## Constraints

- Sharp binary compatibility with prod OS (Linux x64 typically)
- Memory: single image <100MB, typical 35MB takes ~500MB temp memory during processing
- CPU: sharp single-threaded per request, but Node event loop handles concurrency

---

## Rollback Plan

If compression causes issues:
1. Revert 3 service files to original (no compresión)
2. Users re-upload images → stored original format again
3. Existing WebP images in storage stay (no migration needed)
