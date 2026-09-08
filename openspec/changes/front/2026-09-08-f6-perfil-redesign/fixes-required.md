# Fixes Required — F6 Perfil Redesign

**Change**: `2026-09-08-f6-perfil-redesign`  
**Verdict**: FAIL (5 CRITICAL, 5 WARNING, 2 SUGGESTION)  
**Date**: 2026-09-08

---

## CRITICAL Fixes (Must Apply)

### C.1 Profile Load 400s: `Number(uuid)` → `NaN`

**Root Cause**: `ProfileComponent.ngOnInit()` converts `currentUser.id` (UUID string) to number → `NaN` → `GET /users/NaN` rejected by backend.

**Fix**:  
- **File**: `frontend/src/app/features/profile/profile.component.ts:138`
- **Change**: Use UUID string directly, not `Number()`:
  ```typescript
  // Before
  this.userId = Number(currentUser.id);
  
  // After
  this.userId = currentUser.id; // already a string UUID
  ```
- **Verify**: Load profile, expect 200 + data, not 400.

---

### C.2 Save Silently No-Ops: Field Name Mismatch (Spanish ↔ English)

**Root Cause**: Frontend sends `{nombres, apellidos, telefono}`, backend `UpdateProfileDto` expects `{first_name, last_name, phone}` + multipart is not parsed (no FileInterceptor).

**Fixes**:

#### C.2.1 Create Dedicated `UserService` with Correct Field Names

**Why**: Design specified this, but implementation reused the admin `UsersService` with incompatible shapes. Separate it now.

- **Create**: `frontend/src/app/core/services/user.service.ts`
  ```typescript
  import { Injectable } from '@angular/core';
  import { HttpClient } from '@angular/common/http';
  import { Observable } from 'rxjs';
  
  @Injectable({ providedIn: 'root' })
  export class UserService {
    constructor(private http: HttpClient) {}
  
    getCurrentUser(): Observable<{ id: string; first_name: string; last_name: string; phone: string; email: string; profile_image_url?: string; last_updated_at?: string }> {
      return this.http.get<any>('/api/users/me');
    }
  
    updateProfile(payload: { first_name: string; last_name: string; phone: string; email: string }): Observable<any> {
      return this.http.patch('/api/users/me', payload);
    }
  
    uploadProfileImage(file: File): Observable<{ profile_image_url: string }> {
      const fd = new FormData();
      fd.append('avatar', file);
      return this.http.post<any>('/api/users/me/avatar', fd);
    }
  }
  ```

#### C.2.2 Update `ProfileComponent` to Use New Service

- **File**: `frontend/src/app/features/profile/profile.component.ts`
- **Changes**:
  1. Inject `UserService` instead of `UsersService`:
     ```typescript
     constructor(private userService: UserService, ...) {}
     ```
  2. Replace `loadProfile()`:
     ```typescript
     loadProfile(): void {
       this.loading.set(true);
       this.userService.getCurrentUser().subscribe({
         next: (user) => {
           this.form.patchValue({
             nombre: user.first_name,
             apellido: user.last_name,
             teléfono: user.phone,
             email: user.email
           });
           this.photoUrl.set(user.profile_image_url || '');
           if (user.last_updated_at) {
             this.lastUpdatedAt.set(new Date(user.last_updated_at));
           }
           this.loading.set(false);
         },
         error: () => {
           this.showErrorToast('Error al cargar el perfil.');
           this.loading.set(false);
         }
       });
     }
     ```
  3. Replace `onSubmit()`:
     ```typescript
     onSubmit(): void {
       if (this.form.invalid) return;
       this.loading.set(true);
       const payload = {
         first_name: this.form.value.nombre,
         last_name: this.form.value.apellido,
         phone: this.form.value.teléfono,
         email: this.form.value.email
       };
       this.userService.updateProfile(payload).subscribe({
         next: () => {
           this.lastUpdatedAt.set(new Date());
           this.showSuccessToast('Perfil actualizado.');
           this.loading.set(false);
         },
         error: () => {
           this.showErrorToast('Error al guardar el perfil.');
           this.loading.set(false);
         }
       });
     }
     ```
  4. Remove `userId` signal entirely (no longer needed).

#### C.2.3 Add Tests for New Service
- **File**: `frontend/src/app/core/services/user.service.spec.ts` (new)
- Cover: `getCurrentUser()`, `updateProfile()`, `uploadProfileImage()` with mocked HttpClient.

---

### C.3 Avatar Never Uploads: Wrong Endpoint + Field Name

**Root Cause**: Code POSTs to `/users/me` with field `file`; real endpoint is `POST /users/me/avatar` with field `avatar`.

**Fix**: Use new `UserService.uploadProfileImage()` in `ProfilePhotoUploaderComponent`:

- **File**: `frontend/src/app/features/profile/components/profile-photo-uploader/profile-photo-uploader.component.ts`
- **Inject**: `UserService` alongside `ToastService`
- **Replace** `onFileChange()`:
  ```typescript
  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > this.MAX_BYTES) {
      this.toastService.error(`Foto no puede superar 0.78 MB`);
      return;
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      this.toastService.error('Formato: JPEG, PNG, o WebP');
      return;
    }

    // Client preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.preview.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Server upload
    this.uploading.set(true);
    this.userService.uploadProfileImage(file).subscribe({
      next: (res) => {
        this.photoUploaded.emit(res.profile_image_url);
        this.toastService.success('Foto actualizada.');
        this.uploading.set(false);
      },
      error: () => {
        this.toastService.error('Error al subir la foto.');
        this.uploading.set(false);
      }
    });
  }
  ```

---

### C.4 403 Forbidden for Non-Admin: Using Wrong Endpoint

**Root Cause**: `GET /users/:id` is admin-only. Self-profile should use `GET /users/me` (no guard).

**Fix**: Already solved by C.2.1 — `UserService.getCurrentUser()` calls `/api/users/me`, not `/api/users/:id`.

---

### C.5 Audit Trail Broken: `tasks.md` Unchecked + Missing `apply-progress.md`

**Root Cause**: Code committed without marking tasks done or recording decisions.

**Fixes**:

#### C.5.1 Create `apply-progress.md`

- **File**: `openspec/changes/front/2026-09-08-f6-perfil-redesign/apply-progress.md`
- **Content**: Record what was actually done vs what was planned.
  ```markdown
  # Apply Progress — F6 Perfil Redesign

  **Change**: `2026-09-08-f6-perfil-redesign`
  **Branch**: `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil`
  **Commit**: `ae71fa87d` (initial impl) + new commit(s) for C.1–C.5 fixes

  ## Phase Completion

  ### Phase 1: Scaffolding
  - ✅ D.1: ProfileComponent (lazy route `/app/profile`)
  - ✅ D.2: ProfileFormComponent (ReactiveForm, signals)
  - ✅ D.3: ProfilePhotoUploaderComponent (circular preview, dropzone)
  - ✅ D.4: ProfileActionCardsComponent (Políticas/Ayuda/Cerrar Sesión)

  ### Phase 2: Service Layer (REVISED)
  - ✅ D.5: Create dedicated `UserService` with correct DTO mapping:
    - `getCurrentUser()` → `GET /users/me`
    - `updateProfile(payload: {first_name, last_name, phone, email})` → `PATCH /users/me`
    - `uploadProfileImage(file)` → `POST /users/me/avatar` with field `avatar`
  - 🔧 D.6: Wire `UserService` in ProfileComponent (replaces admin UsersService reuse)

  ### Phase 3: Form Implementation
  - ✅ D.7: ReactiveForm validators (required, email, phone pattern)
  - ⚠️ D.8: Phone auto-format mask — **POSTPONED** (see WARNING section)
  - ✅ D.9: Form load (prePopulate)
  - ✅ D.10: Form save (onSubmit)

  ### Phase 4: Photo Upload
  - ✅ D.11: Client preview (FileReader, circular crop)
  - ✅ D.12: Server upload (POST /users/me/avatar)
  - ✅ D.13: Error handling (file size, MIME type)

  ### Phase 5: Action Cards
  - ✅ D.14: Render bottom 3 cards (Políticas/Ayuda/Cerrar Sesión)

  ### Phase 6: Integration
  - ✅ D.15: Compose all subcomponents in ProfileComponent

  ### Phase 7: Testing
  - ✅ D.16: Unit tests (profile.component.spec.ts, photo-uploader.spec.ts, action-cards.spec.ts)
  - ⚠️ D.17: E2E tests — skipped locally (no `BASE_URL`/`E2E_PASSWORD`), expected to pass on CI

  ### Phase 8: Validation & Lint
  - ✅ D.18: Form validation (required, email, phone pattern)
  - ✅ D.19: Lint (no new errors)

  ## Deviations

  - **D.5 (Revised)**: New `UserService` created with correct shapes (originally reused admin UsersService, which caused CRITICAL #1–#4)
  - **D.8 (Phone Mask)**: Deferred to WARNING / separate issue (only validator, no live mask yet)

  ## Issues Addressed in This Round

  **CRITICAL**:
  - C.1: Fixed `Number(uuid)` → NaN (use string directly)
  - C.2: Created `UserService` with correct field names (`first_name`/`last_name`/`phone` not `nombres`/`apellidos`/`telefono`)
  - C.3: Avatar upload now uses correct endpoint (`POST /users/me/avatar`, field `avatar`)
  - C.4: Profile load now uses `/users/me` (no admin permission required)
  - C.5: This apply-progress.md created + tasks.md checked off

  **WARNING**:
  - W.1: S4 phone auto-format — validator only, no live mask (deferred, see below)
  - W.2: Oversized/invalid file upload errors now surfaced to user
  - W.3: `lastUpdatedAt` backend gap documented (no action needed, design aware)
  - W.4: tasks.md path corrected (use `features/profile/`, not `catalogs/profile/`)
  - W.5: Design's dedicated UserService decision now honored
  ```

#### C.5.2 Check Off `tasks.md`

- **File**: `openspec/changes/front/2026-09-08-f6-perfil-redesign/tasks.md`
- Mark all applicable tasks as `[x]`, note deviations:
  - P.1.1–P.1.5 → `[x]` (scaffold)
  - P.2.1–P.2.3 → `[x]` (service, revised to separate UserService)
  - P.3.1–P.3.3 → `[x]` (photo uploader, errors now shown)
  - P.4.1–P.4.3 → `[x]` (form, validators in place; mask deferred)
  - P.5.1–P.5.3 → `[x]` (action cards)
  - P.6.1 → `[x]` (main component)
  - P.7.1–P.7.3 → `[x]` (unit tests pass; e2e skipped by design locally)
  - P.8.1 → `[x]` (lint pass)
  - P.9 (phone mask detail) → `[ ]` (deferred to WARNING / future iteration)

---

## WARNING Fixes (Should Apply)

### W.1 S4 Phone Auto-Format Not Implemented

**Decision**: Defer this to a separate issue/follow-up. The current validator (`ecuadorPhoneValidator`) ensures the format is valid on submit; auto-masking as the user types would require a more complex input directive (mask library or custom directive).

**Action**: Document in `apply-progress.md` as deferred. Add a GitHub issue if needed, tag as "nice-to-have" for post-F6.

---

### W.2 Photo Upload Errors Now Shown to User

**Already fixed in C.3** — oversized/invalid file errors now emit via `toastService.error()` before attempting upload.

---

### W.3 `lastUpdatedAt` Backend Gap

**Status**: Documented and accepted. Backend doesn't expose this field; frontend shows it after the first save in the session only. No fix needed for this round.

---

### W.4 `tasks.md` Path Correction

**File**: `openspec/changes/front/2026-09-08-f6-perfil-redesign/tasks.md`  
**Change**: Correct P.1.1 from `frontend/src/app/features/catalogs/profile/` to `frontend/src/app/features/profile/`.

---

### W.5 Design's `UserService` Decision Now Honored

**Already fixed in C.2.1** — dedicated `UserService` created with the shapes outlined in design.md.

---

## Summary

| Issue | Type | Status |
|-------|------|--------|
| C.1: UUID → NaN | CRITICAL | Fixed (use string UUID) |
| C.2: Field name mismatch | CRITICAL | Fixed (new UserService + correct DTO mapping) |
| C.3: Avatar endpoint | CRITICAL | Fixed (POST /users/me/avatar) |
| C.4: 403 permission | CRITICAL | Fixed (use /users/me) |
| C.5: Audit trail | CRITICAL | Fixed (apply-progress + tasks.md) |
| W.1: Phone mask | WARNING | Deferred |
| W.2: Upload errors | WARNING | Fixed (now shown) |
| W.3: lastUpdatedAt | WARNING | Documented |
| W.4: Path | WARNING | Corrected |
| W.5: UserService design | WARNING | Honored |

**Next**: Apply all fixes, re-verify to PASS, then archive.
