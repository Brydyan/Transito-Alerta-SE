# Tasks: F6 Perfil Redesign

- [ ] **P.1.1** Create folder `frontend/src/app/features/catalogs/profile/`
- [ ] **P.1.2** Generate ProfileComponent
- [ ] **P.1.3** Generate ProfilePhotoUploaderComponent
- [ ] **P.1.4** Generate ProfileFormComponent (or inline in main)
- [ ] **P.1.5** Generate ProfileActionCardsComponent

- [ ] **P.2.1** Create `models/profile.model.ts` (UserProfile type)
- [ ] **P.2.2** Update UserService:
  - `getCurrentUser()` (if not exists)
  - `updateProfile(data)` → PATCH `/users/me`
  - `uploadProfileImage(file)` → POST `/users/me/profile-image`
- [ ] **P.2.3** Unit test service

- [ ] **P.3.1** Implement ProfilePhotoUploaderComponent:
  - Avatar display (circular, 128×128)
  - File input (accept .jpg, .png, .webp)
  - Preview on select
  - Error for file size > 0.78 MB
  - Button: "Subir nueva foto"
  - Output: fileSelected(File)

- [ ] **P.4.1** Implement ProfileFormComponent (ReactiveForm):
  - Validators:
    - firstName: required, min 2 chars
    - lastName: required, min 2 chars
    - phone: optional, tel format (ngx-mask or custom)
    - email: readonly
  - On submit: UserService.updateProfile() + UserService.uploadProfileImage() if file selected
  - Error handling: toast on 500
  - Success: toast "Perfil actualizado"
  - Update lastUpdatedAt timestamp

- [ ] **P.5.1** Implement ProfileActionCardsComponent:
  - 3 cards (1/3 width each)
  - Each card: Icon + title + description + link
  - No functionality (links to future features)

- [ ] **P.6.1** Main ProfileComponent:
  - Load current user on init
  - Pre-populate form fields
  - Compose photo uploader + form + action cards
  - Handle submit (photo + form data)

- [ ] **P.7.1** Create `frontend/e2e/profile.e2e.ts`:
  - S1: Profile loads, fields pre-populated
  - S2: Edit name, save, verify update
  - S3: Validation (name required)
  - S4: Phone format (auto-applied)
  - S5: Upload photo (select file, preview)
  - S6: Error handling (500)
  - S7: Email readonly (cannot edit)

- [ ] **P.8.1** Unit tests:
  - `profile.component.spec.ts` (form submit, validation)
  - `profile-photo-uploader.component.spec.ts` (file select, size validation)

- [ ] **P.9.1** Lint, build, test
- [ ] **P.9.2** Verify no regression (D1)

**Total Story Points**: ~16 pts
