# Design: F6 Perfil Redesign

## Components

```
ProfileComponent (container, form)
├── ProfilePhotoUploaderComponent (new)
│   ├── Avatar display
│   └── Upload input + file picker
├── ProfileFormComponent (reactive form)
│   ├── Nombre (required)
│   ├── Apellido (required)
│   ├── Teléfono (tel format)
│   └── Correo (readonly)
└── ProfileActionCardsComponent (new)
    ├── PasswordCard
    ├── ZonePreferenceCard
    └── SupportCard
```

## Service Integration

**UserService**:
- `getCurrentUser()` → GET `/users/me` (pre-load at login)
- `updateProfile(data)` → PATCH `/users/me`
- `uploadProfileImage(file)` → POST `/users/me/profile-image` (multipart)

## Data Models

```typescript
interface UserProfile {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  profileImageUrl?: string
  lastUpdatedAt: Date
}
```

## Decisions

| Decision | Rationale |
|----------|-----------|
| **Reactive Form** | Validation + async submit |
| **Phone mask** | Auto-format per region |
| **Upload separate** | Photo + form can be independent operations |
| **Readonly email** | Email is identity; don't allow self-change |
| **No password in this form** | Separate flow (future phase) |

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users/me` | GET | Current user profile |
| `/users/me` | PATCH | Update firstName, lastName, phone |
| `/users/me/profile-image` | POST | Upload new photo (multipart) |

## Testing

### Unit
- `profile.component.spec.ts` (form validation, submit)
- `profile-photo-uploader.component.spec.ts` (file selection, preview)

### E2E
- Load profile, fields pre-populated
- Edit name, save, verify update
- Validation: name required
- Phone format auto-applied
- Upload photo, preview updates
- Error handling (500)

## CSS & Styling

- Form layout: 2-column (photo | fields)
- Card backgrounds: --color-surface (light gray)
- Icons: 1.5rem size, purple color
- Buttons: Primary (purple), Secondary (outline)
- Phone input: border radius, padding 0.5rem
