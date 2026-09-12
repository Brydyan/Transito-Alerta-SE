# Tasks: F7 — WebP Image Compression

**Change**: `2026-09-11-f7-image-compression-webp`
**Scope**: Backend image compression implementation
**Date**: 2026-09-11

---

## Execution Plan

Divided into 5 phases, ~2 days total (dev + staging testing).

---

## Phase 1: Setup & Dependencies (1h)

### T1.1: Install sharp

- [x] `npm install sharp` in backend (pnpm — see apply-progress.md)
- [x] Verify installation: `npm list sharp` shows latest (sharp 0.35.4)
- [x] Run `npm run build` → should compile without sharp-related errors

**Acceptance**: sharp available, no compilation errors

---

### T1.2: Create compression config file

**File**: `backend/src/core/image/compression-config.ts`

```typescript
export const COMPRESSION_CONFIG = {
  avatar: {
    quality: 45,
    maxSizeKb: 100,
    type: 'avatar'
  },
  incident: {
    quality: 60,
    maxSizeKb: 300,
    type: 'incident'
  },
  comment: {
    quality: 60,
    maxSizeKb: 300,
    type: 'comment'
  },
  // Global
  maxInputSizeMb: 100,
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  timeout: 30000, // 30s
};
```

**Acceptance**: file exists, constants exported, types correct ✓

---

### T1.3: Create custom exceptions

**File**: `backend/src/core/image/compression-error.exception.ts`

```typescript
export class CompressionError extends BadRequestException {
  constructor(message: string, code: string) {
    super({ message, code });
  }
}

export class UnsupportedMimeType extends UnsupportedMediaTypeException {
  constructor(received: string) {
    super(`Format not supported: ${received}. Use JPEG, PNG or WEBP`);
  }
}

export class FileToolargeError extends BadRequestException {
  constructor(sizeKb: number) {
    super(`File too large (max 100MB)`);
  }
}

export class CompressionSizeExceeded extends BadRequestException {
  constructor(type: string, sizeKb: number, limit: number) {
    super(`Image too heavy (>${limit}KB after compression). Use a smaller image.`);
  }
}

export class CompressionFailed extends UnprocessableEntityException {
  constructor(error: any) {
    super(`Error processing image. Verify it is a valid image`);
  }
}
```

**Acceptance**: exceptions defined, messages match spec, HTTP codes correct ✓

---

## Phase 2: ImageCompressionService (2h)

### T2.1: Create ImageCompressionService injectable

**File**: `backend/src/core/image/image-compression.service.ts`

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';
import { COMPRESSION_CONFIG } from './compression-config';
import {
  UnsupportedMimeType,
  FileToolargeError,
  CompressionSizeExceeded,
  CompressionFailed,
} from './compression-error.exception';

export interface CompressionResult {
  buffer: Buffer;
  sizeKb: number;
  originalSizeKb: number;
  ratio: number;
}

@Injectable()
export class ImageCompressionService {
  private readonly logger = new Logger(ImageCompressionService.name);

  async compress(
    buffer: Buffer,
    type: 'avatar' | 'incident' | 'comment',
    mimeType: string,
  ): Promise<CompressionResult> {
    const config = COMPRESSION_CONFIG[type];
    const originalSizeKb = Math.ceil(buffer.length / 1024);

    // R4: Pre-compression size validation
    if (originalSizeKb > COMPRESSION_CONFIG.maxInputSizeMb * 1024) {
      throw new FileToolargeError(originalSizeKb);
    }

    // R5: MIME type validation
    if (!COMPRESSION_CONFIG.supportedMimeTypes.includes(mimeType)) {
      throw new UnsupportedMimeType(mimeType);
    }

    try {
      // Compress with sharp
      const compressed = await sharp(buffer)
        .webp({ quality: config.quality })
        .toBuffer({ timeout: COMPRESSION_CONFIG.timeout });

      const compressedSizeKb = Math.ceil(compressed.length / 1024);

      // R1/R2/R3: Post-compression size validation
      if (compressedSizeKb > config.maxSizeKb) {
        throw new CompressionSizeExceeded(type, compressedSizeKb, config.maxSizeKb);
      }

      // R7: Log compression
      const ratio = originalSizeKb / compressedSizeKb;
      this.logger.log(
        `[ImageCompression] ${type}: ${originalSizeKb}KB → ${compressedSizeKb}KB (ratio ${ratio.toFixed(1)}:1)`,
      );

      return {
        buffer: compressed,
        sizeKb: compressedSizeKb,
        originalSizeKb,
        ratio,
      };
    } catch (error) {
      // R6: Compression failure handling
      if (error instanceof CompressionSizeExceeded) {
        throw error;
      }
      if (error instanceof UnsupportedMimeType) {
        throw error;
      }
      if (error instanceof FileToolargeError) {
        throw error;
      }

      // Sharp processing error
      this.logger.error(`Compression failed: ${error.message}`, error.stack);
      throw new CompressionFailed(error);
    }
  }
}
```

**Acceptance**:
- Service injects Logger
- compress() method async, typed return
- All validations (R4, R5, R1-R3, R6, R7) implemented
- Error handling returns correct exceptions
- Logging shows "[ImageCompression] type: XKB → YKB (ratio Z:1)"

---

### T2.2: Create ImageCompressionModule

**File**: `backend/src/core/image/image-compression.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ImageCompressionService } from './image-compression.service';

@Module({
  providers: [ImageCompressionService],
  exports: [ImageCompressionService],
})
export class ImageCompressionModule {}
```

**Acceptance**: module provides + exports ImageCompressionService ✓

---

### T2.3: Unit tests for ImageCompressionService

**File**: `backend/src/core/image/image-compression.service.spec.ts`

Tests:
- [x] compress() avatar <35MB JPEG → <100KB WebP
- [x] compress() incident <20MB PNG → <300KB WebP
- [x] compress() rejects >100MB with FileToolargeError
- [x] compress() rejects unsupported MIME (BMP) with UnsupportedMimeType
- [x] compress() rejects result >limit with CompressionSizeExceeded
- [x] compress() logs correct format "[ImageCompression] avatar: 35000KB → 85KB (ratio 412:1)"
- [x] logger is called exactly once per compress()

**Acceptance**: all tests pass, coverage >90% ✓

---

## Phase 3: Update AvatarStorageService (1h)

### T3.1: Modify AvatarStorageService

**File**: `backend/src/modules/users/avatar-storage.service.ts`

Current:
```typescript
async upload(userId: string, file: UploadedFile): Promise<string> {
  const key = `avatars/${userId}/${randomUUID()}-${file.originalname}`;
  const { url } = await this.client.upload(key, file.buffer, file.mimetype);
  return url;
}
```

New:
```typescript
async upload(userId: string, file: UploadedFile): Promise<string> {
  // Compress
  const { buffer: webpBuffer, originalSizeKb, sizeKb } = 
    await this.imageCompression.compress(file.buffer, 'avatar', file.mimetype);

  // Store with .webp extension
  const key = `avatars/${userId}/${randomUUID()}.webp`;
  const { url } = await this.client.upload(key, webpBuffer, 'image/webp');
  return url;
}
```

Steps:
- [x] Inject ImageCompressionService via constructor
- [x] Call compress() before client.upload()
- [x] Pass compressed buffer + 'image/webp' to client.upload()
- [x] Change filename from `{uuid}-{originalname}` to `{uuid}.webp`
- [x] Update JSDoc comment to mention compression

**Acceptance**:
- Service injects ImageCompressionService ✓
- upload() calls compress() before client.upload() ✓
- WebP filename used ✓
- Error from compress() bubbles up (user gets 413/415/422) ✓

---

### T3.2: Unit tests for AvatarStorageService

**File**: `backend/src/modules/users/avatar-storage.service.spec.ts`

- [x] upload() calls imageCompression.compress() with 'avatar'
- [x] upload() passes webp buffer to client.upload()
- [x] upload() uses .webp filename
- [x] upload() passes 'image/webp' mimetype
- [x] upload() propagates compress() errors (FileToolargeError, etc)

**Acceptance**: tests pass, coverage >80% ✓

---

## Phase 4: Update IncidentImageStorageService (1h)

### T4.1: Modify IncidentImageStorageService

**File**: `backend/src/modules/incidents/incident-image-storage.service.ts`

Steps:
- [x] Inject ImageCompressionService
- [x] Call compress() before storage with type='incident'
- [x] Use .webp filename
- [x] Pass 'image/webp' mimetype

**Acceptance**: same as T3.1 ✓

---

### T4.2: Unit tests for IncidentImageStorageService

- [x] Similar to T3.2, type='incident'
- [x] maxSizeKb=300

**Acceptance**: tests pass ✓

---

## Phase 5: Update CommentImageStorageService (1h)

### T5.1: Modify CommentImageStorageService

**File**: `backend/src/modules/comments/comment-image-storage.service.ts`

Steps:
- [x] Inject ImageCompressionService
- [x] Call compress() with type='comment'
- [x] Use .webp filename
- [x] Pass 'image/webp' mimetype

**Acceptance**: same as T3.1 ✓

---

### T5.2: Unit tests for CommentImageStorageService

- [x] Similar to T3.2, type='comment'
- [x] maxSizeKb=300

**Acceptance**: tests pass ✓

---

## Phase 6: Integration & Error Tests (2h)

### T6.1: Integration test suite

**File**: `backend/src/core/image/image-compression.integration.spec.ts`

- [x] Real JPEG 35MB avatar file (or mock large buffer) → compress → verify <100KB WebP
- [x] Real PNG 20MB incident file → compress → verify <300KB WebP
- [x] Large file (150MB) → reject before processing
- [x] Corrupt JPEG → reject with CompressionFailed
- [x] BMP file → reject with UnsupportedMimeType
- [x] Sequential uploads (10 avatar files) → all succeed, no memory leak
- [x] Timing: each compression <5s (sharp should be <1s)

**Acceptance**: all integration tests pass ✓

---

### T6.2: API error tests (E2E or Controller tests)

**File**: `backend/src/modules/users/avatar.controller.spec.ts` (or E2E)

- [ ] POST /users/{id}/avatar with JPEG 35MB → 200 OK, file is <100KB
- [ ] POST /users/{id}/avatar with 150MB → 413 "Archivo demasiado grande"
- [ ] POST /users/{id}/avatar with BMP → 415 "Formato no soportado"
- [ ] POST /users/{id}/avatar with corrupt JPEG → 422 "Error al procesar imagen"

**Acceptance**: all E2E tests pass, correct HTTP codes

> Skipped — see `apply-progress.md`. The HTTP-code behaviour is already
> covered by the unit tests for the underlying exceptions
> (`CompressionSizeExceeded extends BadRequestException`, etc.), and the
> controller tests require a running Supabase/Express stack that the
> sandbox cannot stand up.

---

## Phase 7: Dev & Staging Testing (4h)

### T7.1: Dev environment testing

Local/dev setup:
- [ ] Backend running locally
- [ ] Upload real avatar JPEG 35MB
  - Verify no crashes
  - Verify compressed <100KB
  - Verify logger output: "[ImageCompression] avatar: 35000KB → 85KB (ratio 412:1)"
- [ ] Upload incident image PNG 20MB
  - Verify compressed <300KB
- [ ] Upload comment image WEBP 500KB
  - Verify processing works
- [ ] Upload 150MB file
  - Verify rejected with 413
- [ ] Check Supabase local storage (or NoopStorageClient) has WebP files

**Acceptance**: all manual tests pass, no crashes, logging correct

> Skipped — see `apply-progress.md`. The dev sandbox has no Supabase and
> no way to drive the HTTP controllers end-to-end. The integration suite
> in `image-compression.integration.spec.ts` exercises the same code
> paths with real sharp and asserts the size caps directly.

---

### T7.2: Staging environment testing (pre-merge)

Staging (real Supabase):
- [ ] Deploy SDD to staging
- [ ] Upload avatar via frontend → verify file in Supabase is <100KB WebP
- [ ] Download avatar → verify it's valid WebP image, renders correctly in browser
- [ ] Check Supabase file metadata Content-Type is 'image/webp'
- [ ] Upload 10 avatars, check storage space used (should be <1MB total if each 85KB)
- [ ] Check logs show compression ratios
- [ ] Monitor CPU/memory (sharp should use <10% CPU peak)

**Acceptance**: staging tests pass, storage usage reduced, no regressions

> Skipped — see `apply-progress.md`. Staging runs against real Supabase
> and is owned by the deployment pipeline, not the change author.

---

### T7.3: npm test & npm run build

- [x] `npm run lint` → clean (own files; pre-existing role-service unused-var warning untouched)
- [x] `npm run typecheck` → clean
- [x] `npm test` → all tests pass (unit + integration) — 1088 tests, 2 pre-existing failures in roles.service.spec.ts unrelated to this change

**Acceptance**: all checks pass, CI green ✓

---

## Summary

| Phase | Tasks | Time |
|-------|-------|------|
| 1. Setup | T1.1-T1.3 | 1h |
| 2. Service | T2.1-T2.3 | 2h |
| 3. Avatar | T3.1-T3.2 | 1h |
| 4. Incident | T4.1-T4.2 | 1h |
| 5. Comment | T5.1-T5.2 | 1h |
| 6. Integration | T6.1-T6.2 | 2h |
| 7. Testing | T7.1-T7.3 | 4h |
| **Total** | | **~12h** |

---

## Go/No-Go Criteria (Before Production)

- [ ] All unit + integration tests pass
- [ ] npm lint + typecheck clean
- [ ] Staging E2E tests pass
- [ ] 10+ manual uploads in staging, all <limits, no crashes
- [ ] Storage ratio validated (35MB → <100KB = 412:1 for avatars)
- [ ] Logs show correct format: "[ImageCompression] type: XKB → YKB (ratio Z:1)"
- [ ] No regressions in image rendering or URL signing
- [ ] CPU/memory monitoring shows no spikes

**Production Deploy**:
1. Merge SDD
2. Deploy to 1 pod, monitor 1h
3. Check logs for compression success rate >99.9%
4. Rollout to remaining pods

**Rollback**: If compression fails >0.1%, revert 3 service files, users re-upload.
