# Proposal: F7 — WebP Image Compression (Backend)

**Change**: `2026-09-11-f7-image-compression-webp`
**Scope**: Backend (NestJS image upload services)
**Date**: 2026-09-11
**Depends on**: None (standalone feature; no migrations required)

---

## Intent

Comprimir todas las imágenes subidas (avatares, imágenes de incidencias, imágenes de comentarios) a WebP antes de almacenar en Supabase. Objetivo: reducir almacenamiento de 35+ MB a <100KB (avatares) y <300KB (incidencias/comentarios), rechazando si la compresión no alcanza el objetivo.

---

## Scope

### In Scope

- Inyectar procesamiento sharp en `AvatarStorageService.upload()` antes de llamar a `client.upload()`
- Inyectar procesamiento sharp en `IncidentImageStorageService.upload()` antes de almacenamiento
- Inyectar procesamiento sharp en `CommentImageStorageService.upload()` antes de almacenamiento
- Validar tamaño pre-compresión (máximo 100MB entrada)
- Validar tamaño post-compresión contra límites por tipo:
  - Avatares: <100KB, calidad WebP 45
  - Incidencias/Comentarios: <300KB, calidad WebP 60
- Rechazar upload si compresión falla o resultado excede límite
- Loguear size original, size comprimido, ratio para auditoría

### Out of Scope

- Almacenar versión original (solo WebP final)
- Implementar re-procesamiento de imágenes existentes
- Crear tabla de metadatos de compresión (logueo en console/logger existente)
- Conversión en frontend (browser no hace compresión pre-upload)

---

## Dependencies

**Blocking**:
- Librería `sharp` instalada en backend (`npm install sharp`)

**Non-blocking**:
- Ninguno

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `backend/src/core/image/image-compression.service.ts` | create | Nueva clase injectable para sharp wrapper |
| `backend/src/modules/users/avatar-storage.service.ts` | modify | Inyectar compresión antes de `client.upload()` |
| `backend/src/modules/incidents/incident-image-storage.service.ts` | modify | Inyectar compresión antes de almacenamiento |
| `backend/src/modules/comments/comment-image-storage.service.ts` | modify | Inyectar compresión antes de almacenamiento |
| `backend/src/core/image/compression-error.exception.ts` | create | Custom exception para fallos de compresión |
| `backend/src/core/image/compression-config.ts` | create | Constantes de calidad y límites |

---

## Test Coverage

- Unit: ImageCompressionService (mock sharp, test quality settings, tamaño final)
- Integration: avatar upload (file 35MB → <100KB), incident upload (file 20MB → <300KB)
- Error: simulate compression failure, verify rejection
- Manual: upload JPEG real 35MB avatar, verificar WebP <100KB en Supabase

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| sharp compilation fail en prod | Medium | Test en CI/CD antes de merge; sharp tiene binarios precompilados |
| Imagen se ve pixelada (calidad 45 muy baja) | Low | Avatares pequeños, calidad 45 es aceptable; incidents calidad 60 balancea |
| Compresión lenta (timeout) | Low | sharp es muy rápido (<1s por imagen típica); timeout a 30s cubre outliers |
| OOM durante compresión de gigantes | Low | Validación pre-compresión rechaza >100MB entrada |

---

## Success Criteria

- [ ] `npm install sharp` agrega librería sin error
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test` green (unit + integration tests para compresión)
- [ ] Upload avatar 35MB JPEG → Supabase contiene WebP <100KB
- [ ] Upload incident image 20MB PNG → Supabase contiene WebP <300KB
- [ ] Upload >100MB archivo → rechaza con error claro "Archivo demasiado grande"
- [ ] Upload con formato inválido (BMP) → rechaza con error "Formato no soportado"
- [ ] Compresión falla (corrupt JPEG) → rechaza con error "Error al procesar imagen"
- [ ] Logs muestran: "Comprimido: 35000KB → 85KB (ratio 412:1)"
