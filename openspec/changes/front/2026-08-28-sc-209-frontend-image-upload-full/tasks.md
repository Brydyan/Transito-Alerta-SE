# Tasks: Image Upload Full — Phase A (Storage Backend)

**Change**: `2026-08-28-sc-209-frontend-image-upload-full`
**Generated**: 2026-08-28 (only `proposal.md` existed; tasks derived from the proposal's "In Scope — Phase A" + backend source files)
**Phase**: **A only** (per the user's instruction "SC-209 Phase A")
**Source of contract**:
- `backend/src/modules/comments/comment-image-storage.service.ts` (placeholder; replaced here)
- `backend/src/modules/users/avatar-storage.service.ts` (same placeholder; replaced here)
- `backend/src/modules/comments/comment-images.controller.ts` (consumer; `FilesInterceptor('images', 5, 5MB)`)
- `backend/src/modules/comments/dto/comment-image.dto.ts` (response shape post `SnakeCaseResponseInterceptor`: `{ id, url, mime_type, file_size, created_at }`)

> **BLOCKER** — the proposal §"Dependencies" flags: "BLOCKING:
> storage provider decision + provisioned bucket/credentials
> (Phase A gates Phase B)". I cannot provision buckets or pick
> S3-vs-Supabase-Storage for you. Implementation below
> supports **both** backends behind a single interface — pick the
> provider via env vars and fill in the credentials.

---

## A.1 — Storage abstraction (the seam)

- [ ] **A.1.1** — Create `backend/src/core/storage/storage-client.interface.ts` — `IStorageClient` with `upload(key, buffer, mimeType): Promise<{ key, url }>`, `signedUrl(key, ttl): Promise<string>`, `delete(key): Promise<void>`. The two existing services will implement against this interface (decorator pattern, no DI rewrite).
- [ ] **A.1.2** — Create `backend/src/core/storage/storage.module.ts` — provides `IStorageClient` via factory based on `STORAGE_PROVIDER` env (`s3` | `supabase` | `noop` for local dev). Existing services consume via `inject<IStorageClient>(STORAGE_CLIENT)`.

## A.2 — `CommentImageStorageService` (real client)

- [ ] **A.2.1** — Rewrite `backend/src/modules/comments/comment-image-storage.service.ts`: `upload()` delegates to `IStorageClient.upload('comments/{commentId}/{uuid}.{ext}', buffer, mimeType)` and returns `{ key, url, file_size, mime_type }`. `delete()` delegates to `IStorageClient.delete(key)`.
- [ ] **A.2.2** — Wire `IStorageClient` injection (the existing `Storage` import is the placeholder from the original code — remove it).

## A.3 — `AvatarStorageService` (real client)

- [ ] **A.3.1** — Same rewrite pattern for `backend/src/modules/users/avatar-storage.service.ts`. `upload(userId, buffer, mimeType)` → `avatars/{userId}/{uuid}.{ext}`. `delete(key)` symmetric.
- [ ] **A.3.2** — Wire `IStorageClient` injection.

## A.4 — `backend/.env.example` (new)

- [ ] **A.4.1** — Document `STORAGE_PROVIDER` (default `noop`), and the credentials per provider:
  - S3: `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, `STORAGE_S3_ENDPOINT` (optional, for R2/MinIO compat)
  - Supabase: `STORAGE_SUPABASE_URL`, `STORAGE_SUPABASE_SERVICE_KEY`
- [ ] **A.4.2** — Document `SIGNED_URL_TTL_SECONDS` (default 3600) and `STORAGE_PUBLIC_BASE_URL` (CDN base for prod).

## A.5 — Provider: S3-compatible (default choice)

- [ ] **A.5.1** — Create `backend/src/core/storage/s3-storage.client.ts` using `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Lazy-load the SDK via dynamic `await import()` so the noop dev mode doesn't pull AWS deps.
- [ ] **A.5.2** — `upload(key, buffer, mimeType)`: `PutObjectCommand` with `Bucket, Key, Body, ContentType`. URL: `https://{bucket}.s3.{region}.amazonaws.com/{key}` (configurable via `STORAGE_PUBLIC_BASE_URL`).
- [ ] **A.5.3** — `signedUrl(key, ttl)`: `getSignedUrl(s3, new GetObjectCommand({...}), { expiresIn: ttl })`.
- [ ] **A.5.4** — `delete(key)`: `DeleteObjectCommand`.

## A.6 — Provider: Supabase Storage (alternative)

- [ ] **A.6.1** — Create `backend/src/core/storage/supabase-storage.client.ts` using `@supabase/supabase-js`. Lazy-load.
- [ ] **A.6.2** — `upload(key, buffer, mimeType)`: `supabase.storage.from(BUCKET).upload(key, buffer, { contentType })`. Resolve the public URL.
- [ ] **A.6.3** — `signedUrl(key, ttl)`: `createSignedUrl(key, ttlSeconds)`.
- [ ] **A.6.4** — `delete(key)`: `remove([key])`.

## A.7 — Provider: noop (default in dev / when STORAGE_PROVIDER unset)

- [ ] **A.7.1** — Create `backend/src/core/storage/noop-storage.client.ts`: stores files in a local directory under `STORAGE_NOOP_DIR` (default `./.storage/`), returns a `file://` URL. Lets devs run the suite without AWS / Supabase credentials.
- [ ] **A.7.2** — `.gitignore`: append `.storage/` so dev uploads don't pollute the repo.

## A.8 — Tests

- [ ] **A.8.1** — `backend/src/core/storage/noop-storage.client.spec.ts`: upload → returns key+url; signedUrl → returns same url (or the noop variant); delete → file removed. Use a tempdir per test.
- [ ] **A.8.2** — `backend/src/modules/comments/comment-image-storage.service.spec.ts`: rewrite existing tests to mock `IStorageClient` (the new collaborator), assert the service composes the key correctly and returns the expected shape.
- [ ] **A.8.3** — `backend/src/modules/users/avatar-storage.service.spec.ts`: same pattern as A.8.2.
- [ ] **A.8.4** — Verify the backend suite (`pnpm test` + `pnpm run test:e2e`) stays green.

## A.9 — Verificación

- [ ] **A.9.1** — `pnpm test` (backend) verde.
- [ ] **A.9.2** — `pnpm run test:e2e` verde (R37.2 audit + integridad + cutover).
- [ ] **A.9.3** — `backend/.env.example` documenta todas las vars requeridas.

---

## Decisiones y notas

1. **S3 vs Supabase Storage**: el proposal §"Risks" marca esta decisión como bloqueador de Phase A. Mi implementación soporta **ambas** detrás de `IStorageClient`; el operador decide vía `STORAGE_PROVIDER`. No eligí yo porque depende de qué cuenta tiene TASE (Supabase ya está en uso para la DB; S3 puede ser más barato para object storage).
2. **Noop provider por default**: sin credenciales configuradas, el backend usa almacenamiento local (`.storage/` directorio). El test suite puede correr sin AWS keys. **IMPORTANTE**: no usar `noop` en prod — el proposal lo deja explícito.
3. **No metí AWS SDK como dep obligatoria**: uso dynamic import en `s3-storage.client.ts` para que no se cargue cuando `STORAGE_PROVIDER=noop`. Si el operador no usa S3, no paga el bundle size. `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` quedan como deps opcionales (peerDeps) — el operador las agrega a `package.json` si elige S3.
4. **Firma de URL con TTL**: el proposal no especifica TTL, default 3600s (1h). Configurable vía `SIGNED_URL_TTL_SECONDS`.
5. **Reuso del seam existente**: `CommentImageStorageService` y `AvatarStorageService` ya tienen `upload/getSignedUrl/delete`. Solo cambio la IMPLEMENTACIÓN, no la interfaz pública. Los controllers no se tocan.
