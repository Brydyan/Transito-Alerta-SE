# Tasks: F6 Perfil Redesign

- [x] **P.1.1** Create folder `frontend/src/app/features/profile/` *(corrected path — W.4; not `catalogs/profile/`)*
- [x] **P.1.2** Generate ProfileComponent
- [x] **P.1.3** Generate ProfilePhotoUploaderComponent
- [x] **P.1.4** Generate ProfileFormComponent (inline in `ProfileComponent`, per "or inline in main")
- [x] **P.1.5** Generate ProfileActionCardsComponent

- [x] **P.2.1** ~~Create `models/profile.model.ts`~~ — *revised: `UserProfile`/`UpdateProfilePayload` interfaces live in `core/services/user.service.ts` (co-located with the service that owns the wire contract), not a separate model file.*
- [x] **P.2.2** Create dedicated `UserService` (`core/services/user.service.ts`) *(revised — fixes-required.md C.2.1: separate from admin `UsersService`, not an update to it)*:
  - `getCurrentUser()` → GET `/users/me`
  - `updateProfile(data)` → PATCH `/users/me` (`{first_name, last_name, phone}`)
  - `uploadProfileImage(file)` → POST `/users/me/avatar` *(corrected endpoint — design.md said `/profile-image`, real backend route is `/avatar`, field `avatar`)*
- [x] **P.2.3** Unit test service — `user.service.spec.ts` (HttpClientTestingModule, asserts method/URL/body/multipart field)

- [x] **P.3.1** Implement ProfilePhotoUploaderComponent:
  - Avatar display (circular, 128×128)
  - File input (accept .jpg, .png, .webp)
  - Preview on select
  - Error for file size > 0.78 MB → toast (C.3/W.2)
  - Button: "Subir nueva foto"
  - Output: `photoUploaded(url: string)` *(revised — C.3: component uploads directly via `UserService.uploadProfileImage()` on selection, instead of emitting the raw `File` for the parent to upload later)*

- [x] **P.4.1** Implement Profile form (ReactiveForm, inline in `ProfileComponent`):
  - Validators:
    - nombres (firstName): required, min 2 chars
    - apellidos (lastName): required, min 2 chars
    - telefono (phone): required, `ecuadorPhoneValidator` (custom, not ngx-mask — see P.9 below)
    - email: readonly
  - On submit: `UserService.updateProfile()` only *(revised — avatar upload no longer bundled into submit; see P.3.1)*
  - Error handling: toast on 500
  - Success: toast "Perfil actualizado correctamente."
  - Update `lastUpdatedAt` timestamp (client-side only — see W.3 note in apply-progress.md)

- [x] **P.5.1** Implement ProfileActionCardsComponent:
  - 3 cards (1/3 width each)
  - Each card: Icon + title + description + link
  - No functionality (links to future features)

- [x] **P.6.1** Main ProfileComponent:
  - Load current user on init via `UserService.getCurrentUser()` *(C.1: no `Number(uuid)`, no id needed — `/users/me` resolves from JWT)*
  - Pre-populate form fields (`first_name`/`last_name`/`phone` → `nombres`/`apellidos`/`telefono`)
  - Compose photo uploader + form + action cards
  - Handle submit (form data only; photo uploads independently — P.3.1)

- [ ] **P.7.1** Create `frontend/e2e/profile.e2e.ts` — **deferred**, same as original round (no `BASE_URL`/`E2E_PASSWORD` locally; expected to run on CI). Not part of this fixes-required.md round (C.1–C.5 scope).

- [x] **P.8.1** Unit tests:
  - `profile.component.spec.ts` (form submit, validation) — rewritten for `UserService` contract
  - `profile-photo-uploader.component.spec.ts` (file select, size validation, direct upload, error toasts) — rewritten for `UserService`/`ToastService` injection

- [x] **P.9.1** Lint, build, test — `pnpm test`: 509/509 passed; `pnpm run lint`: 0 errors (65 pre-existing warnings, none new)
- [x] **P.9.2** Verify no regression (D1) — full suite green, no other spec files touched or broken

- [ ] **P.9.3 (new — W.1)** Phone auto-format mask (auto-format as user types "593" → "(+593) 99 999 9999", per spec S4) — **deferred to a follow-up issue**. Current `ecuadorPhoneValidator` validates format on submit/blur but does not live-mask input. Out of scope for the `fixes-required.md` C.1–C.5 round.

**Total Story Points**: ~16 pts (P.7.1 e2e and P.9.3 phone mask carried over as deferred, not blocking this round's CRITICAL fixes)
