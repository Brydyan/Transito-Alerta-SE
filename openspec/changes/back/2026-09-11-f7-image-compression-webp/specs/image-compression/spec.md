# Specification: F7 — WebP Image Compression

**Change**: `2026-09-11-f7-image-compression-webp`
**Scope**: Image upload pipeline compression
**Date**: 2026-09-11

---

## Overview

Cuando usuario sube imagen (avatar, incident, comment), procesar en backend con sharp:
1. Validar MIME type (JPEG, PNG, WEBP)
2. Validar tamaño pre-compresión (<100MB)
3. Convertir a WebP con calidad específica
4. Validar tamaño post-compresión contra límite
5. Almacenar SOLO WebP comprimido, descartar original
6. Loguear compresión para auditoría

---

## Requirements

### R1: Avatar Compression

**Acceptance**:
- Upload avatar (any JPEG/PNG/WEBP) → procesa con sharp calidad 45
- Resultado DEBE estar <100KB
- Si resultado ≥100KB → rechaza con 413 "Imagen demasiado pesada (>100KB después de compresión)"
- Supabase recibe SOLO buffer WebP, filename termina en `.webp`
- Key en storage: `avatars/{userId}/{uuid}.webp` (no original extension)

### R2: Incident Image Compression

**Acceptance**:
- Upload incident image → procesa con sharp calidad 60
- Resultado DEBE estar <300KB
- Si resultado ≥300KB → rechaza con 413 "Imagen demasiado pesada (>300KB después de compresión)"
- Supabase recibe buffer WebP, filename termina en `.webp`
- Key: `incidents/{incidentId}/{uuid}.webp`

### R3: Comment Image Compression

**Acceptance**:
- Upload comment image → procesa con sharp calidad 60 (same as incidents)
- Resultado DEBE estar <300KB
- Si resultado ≥300KB → rechaza con 413
- Supabase recibe buffer WebP, filename termina en `.webp`
- Key: `comments/{commentId}/{uuid}.webp`

### R4: Pre-Compression Size Validation

**Acceptance**:
- Upload >100MB archivo → rechaza CON 413 "Archivo demasiado grande (máximo 100MB)"
- Validación ocurre ANTES de sharp (evita OOM)
- Mensaje claro en BadRequestException con código `FILE_TOO_LARGE`

### R5: MIME Type Validation

**Acceptance**:
- Aceptar: `image/jpeg`, `image/png`, `image/webp`
- Rechazar BMP, GIF, SVG, TIFF, etc. con 415 "Formato de imagen no soportado. Usa JPEG, PNG o WEBP"
- Validación ocurre ANTES de sharp

### R6: Compression Failure Handling

**Acceptance**:
- Si sharp.toBuffer() falla (imagen corrupta, etc.) → rechaza con 422 "Error al procesar imagen. Verifica que sea una imagen válida"
- NO fallback a original
- Error loguea full stack trace en logger (no expone al usuario)

### R7: Compression Logging

**Acceptance**:
- Cada upload exitoso loguea: `[ImageCompression] Avatar: 35000KB → 85KB (ratio 412:1)`
- Formato: `[ImageCompression] {type}: {originalSizeKB}KB → {compressedSizeKB}KB (ratio {ratio}:1)`
- Logger es `Logger` inyectado o NestJS logger estándar

### R8: MIME Type Output

**Acceptance**:
- Todos los uploads llaman `client.upload(key, webpBuffer, 'image/webp')`
- `file.mimetype` originaln es descartado, solo output es `image/webp`
- Storage metadata/Content-Type en Supabase es `image/webp`

---

## Scenarios

### Scenario 1: Avatar Upload 35MB JPEG

```
Given usuario sube archivo JPEG 35000KB de avatar
When AvatarStorageService.upload() es llamado
Then sharp procesa con calidad 45
And resultado < 100KB (ej: 85KB)
And client.upload() recibe (key='avatars/{userId}/{uuid}.webp', buffer=85KB, mimetype='image/webp')
And logger muestra "[ImageCompression] Avatar: 35000KB → 85KB (ratio 412:1)"
And signed URL en frontend retorna WEBP válido
```

### Scenario 2: Incident Image 20MB PNG

```
Given usuario sube imagen incidencia PNG 20000KB
When IncidentImageStorageService.upload() es llamado
Then sharp procesa con calidad 60
And resultado < 300KB (ej: 250KB)
And client.upload() recibe WEBP 250KB
And logger muestra "[ImageCompression] Incident: 20000KB → 250KB (ratio 80:1)"
```

### Scenario 3: Comment Image Already WEBP

```
Given usuario sube comentario con imagen WEBP 500KB ya comprimida
When CommentImageStorageService.upload() es llamado
Then sharp re-procesa (quality 60) para normalizar
And resultado < 300KB (ej: 480KB si ya estaba optimizado)
And almacena WebP normalizado
```

### Scenario 4: Avatar Excede Límite Post-Compresión

```
Given usuario sube avatar ultra-HD PNG 50000KB (foto de 8K)
When AvatarStorageService comprime con calidad 45
And resultado es 150KB (excede límite 100KB)
Then rechaza con 413 BadRequestException
And mensaje: "Imagen demasiado pesada (>100KB después de compresión). Usa una imagen más pequeña"
And Supabase no recibe nada
And logger loguea intento fallido
```

### Scenario 5: File >100MB (Pre-Compression)

```
Given usuario intenta subir avatar 150MB
When AvatarStorageService valida tamaño
Then rechaza INMEDIATAMENTE con 413 "Archivo demasiado grande (máximo 100MB)"
And sharp nunca es invocado (protege OOM)
And no se consume CPU
```

### Scenario 6: Formato No Soportado (BMP)

```
Given usuario sube imagen BMP
When AvatarStorageService valida MIME type
Then rechaza con 415 UnsupportedMediaTypeException
And mensaje: "Formato de imagen no soportado. Usa JPEG, PNG o WEBP"
And sharp nunca es invocado
```

### Scenario 7: Imagen Corrupta

```
Given usuario sube archivo JPEG corrupto/truncado
When sharp.toBuffer() intenta procesar
And sharp lanza error
Then rechaza con 422 UnprocessableEntityException
And mensaje: "Error al procesar imagen. Verifica que sea una imagen válida"
And error interno loguea: `Error: Input image is corrupt or truncated: ...`
```

### Scenario 8: Incident Image Excede 300KB

```
Given usuario sube incident image ultra-HD TIFF 80000KB
When validación MIME rechaza TIFF con 415
OR si fuera PNG y sharp comprime a 350KB
Then rechaza con 413 "Imagen demasiado pesada (>300KB después de compresión)"
And feedback: "La imagen de la incidencia es muy detallada. Usa una foto más simple o más pequeña"
```

### Scenario 9: Sequential Uploads No Leak Memory

```
Given usuario sube 10 avatares consecutivamente (10 × 35MB)
When cada upload procesa y almacena
Then memoria se libera después de cada upload
And proceso completa en ~10s total (~1s cada uno)
And sharp buffers no persisten entre uploads
```

### Scenario 10: Compression Quality Trade-off

```
Given avatar JPEG 35MB de cara clara
When compresión con calidad 45
Then resultado 85KB se ve claro (avatares pequeñas, OK pixelated)

Given incident image PNG 20MB de accidente vial
When compresión con calidad 60
Then resultado 250KB mantiene detalles suficientes (rosca, placa, daño visible)
```

---

## Out of Scope

- Re-procesar imágenes antiguas (solo futuras uploads)
- Tabla de auditoría de compresión (logging console es suficiente)
- Configuración dinámica de calidad (hardcoded por tipo)
- Frontend compression (browser no decide)
- CDN/caching (Supabase signed URLs ya caschean)
