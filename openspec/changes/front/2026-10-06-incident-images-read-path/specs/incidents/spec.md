# Delta for Incidents

## ADDED Requirements

### Requirement: Real Incident Image Storage
The system MUST persist incident images using the injected `STORAGE_CLIENT` and MUST NOT persist fabricated or dummy URLs.
- Scenario: Valid upload — GIVEN a valid image upload request WHEN `IncidentImageStorageService.upload()` is invoked THEN the bytes are written via the storage provider AND the real storage key is persisted.
- Scenario: No fabricated URLs — GIVEN an uploaded image WHEN inspected in the database THEN it contains a `storage_key` and no hardcoded dummy URL.

### Requirement: Dynamic URL Resolution on Read
The system MUST return a freshly resolved signed URL for incident images when reading image metadata, honoring the provider's TTL.
- Scenario: Read image metadata — GIVEN an incident with associated images WHEN `GET /incidents/:id/images` is called THEN the response includes dynamically resolved URLs using the storage client's `getSignedUrl` AND does not return stale persisted URLs.

### Requirement: Incident Image Byte Route
The system MUST expose an HTTP route `GET /incidents/:id/images/:imageId/file` to serve image bytes directly to the browser.
- Scenario: Successful byte read — GIVEN a valid incident ID and associated image ID WHEN a client requests the byte route THEN the image bytes are served (via proxy or fresh redirect) allowing browser rendering.
- Scenario: Missing object — GIVEN an image ID that does not exist in storage WHEN the byte route is requested THEN the system responds with a 404 Not Found error.
- Scenario: Authorization boundary — GIVEN a valid image ID belonging to incident A WHEN requested via the byte route for incident B (`GET /incidents/B/images/A/file`) THEN the system rejects the request to prevent leaking images across incidents.

### Requirement: Frontend Image Rendering States
The frontend MUST render incident images using the dynamically resolved URLs and gracefully handle loading, empty, and error states.
- Scenario: Happy path rendering — GIVEN a list of valid image URLs WHEN the `incident-images.component.ts` renders THEN the images are displayed correctly.
- Scenario: Empty state — GIVEN an incident with no images WHEN the component renders THEN an empty state message is displayed.
- Scenario: Error state — GIVEN an image that fails to load (e.g., expired URL or network error) WHEN the component attempts to render it THEN a fallback error state is shown for that image.
- Scenario: Loading state — GIVEN the image metadata is being fetched WHEN the component is waiting for the response THEN a loading indicator is displayed.

### Requirement: Timeline Status and Actor Presentation
The frontend MUST display status changes using localized Spanish labels and resolve the actor's name instead of displaying raw UUIDs or wire keys.
- Scenario: Status mapping — GIVEN raw status keys (`pending`, `in_progress`, `resolved`, `closed`) WHEN rendered in the timeline THEN they are mapped to Spanish labels (`pendiente`, `en proceso`, `resuelta`, `cerrada`) via a pure function.
- Scenario: Actor name resolution — GIVEN a status history entry with a `changed_by_user_id` WHEN displayed in the timeline THEN the actor's resolved name (`changed_by_name`) is shown.
- Scenario: System actor fallback — GIVEN a status history entry with a null actor WHEN displayed in the timeline THEN a neutral label (e.g., "sistema") is shown.

## Context
Non-functional tasks include SC-209 archiving/reconciliation and a cleanup script for dead `incident_images` rows. These do not affect the runtime behavior specified above.
