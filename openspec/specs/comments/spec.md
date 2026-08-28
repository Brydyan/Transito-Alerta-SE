# Specification: Comment Backend Integration

**Capability**: `comments-backend` (CRUD comments, image upload stubs)

---

## R1 — Fetch Comments

### R1.1 Fetch Comments for Incident

**Given** incident ID and logged-in user  
**When** calling `commentService.getComments(incidentId)`  
**Then**:
- HTTP `GET /comments/incident/:incidentId` called (backend endpoint, not `/incidents/:id/comments`)
- Backend returns `{ id, incident_id, author_id, text, created_at, updated_at, deleted_at?, images?: [...] }`
- Comments array stored in local cache (if using cache)
- Promise resolves with comments array
- Observer gets next(comments), complete()

### R1.2 No Comments

**Given** incident exists but has 0 comments  
**When** calling `commentService.getComments(incidentId)`  
**Then**:
- HTTP `GET /comments/incident/:incidentId` called
- Backend returns empty array `[]`
- Promise resolves with `[]`
- Component renders "No comments yet" state

### R1.3 Incident Not Found

**Given** incident ID doesn't exist  
**When** calling `commentService.getComments(invalidId)`  
**Then**:
- HTTP `GET /comments/incident/:invalidId` called
- Backend returns 404: `{ message: 'Incident not found' }`
- Error caught by `error.interceptor`
- Promise rejects with 404 error
- Component shows toast: "Incident not found"

---

## R2 — Create Comment

### R2.1 Successful Comment Creation

**Given** logged-in user, incident ID, comment text  
**When** calling `commentService.createComment(incidentId, { text, author_id })`  
**Then**:
- HTTP `POST /comments` called (backend path: `/comments`, not nested under `/incidents`)
- Body: `{ incident_id: incidentId, text: '...', author_id: currentUser.id }`
- Backend returns 201: `{ id, incident_id, author_id, text, created_at, images: [] }`
- New comment added to local cache at top
- Promise resolves with created comment
- Component shows comment in list (optimistic update)

### R2.2 Empty Comment Rejected

**Given** comment text is empty or whitespace-only  
**When** calling `commentService.createComment(incidentId, { text: '   ' })`  
**Then**:
- Frontend validation should catch this (optional, backend is authoritative)
- If submitted: backend returns 422: `{ message: 'Text is required' }`
- Promise rejects
- Component disables submit button for empty text

### R2.3 Unauthorized (Not Logged In)

**Given** no auth token  
**When** calling `commentService.createComment(...)`  
**Then**:
- HTTP `POST /comments` called WITHOUT `Authorization` header
- Backend returns 401: `{ message: 'Unauthorized' }`
- Auth interceptor redirects to `/auth/login`
- Promise rejects
- Component never shows comment form (route guard + guard prevents this)

---

## R3 — Update Comment (Optional in P0)

### R3.1 Update Comment Text

**Given** logged-in user is comment author, comment ID  
**When** calling `commentService.updateComment(id, { text: 'new text' })`  
**Then**:
- HTTP `PATCH /comments/:id` called
- Body: `{ text: 'new text' }`
- Backend checks authorization (author only)
- Backend returns 200: `{ id, text: 'new text', updated_at, ... }`
- Local cache updated
- Promise resolves
- Component shows "Edited" timestamp

### R3.2 Not the Author

**Given** logged-in user is NOT comment author  
**When** calling `commentService.updateComment(id, { text: 'hack' })`  
**Then**:
- HTTP `PATCH /comments/:id` called
- Backend returns 403: `{ message: 'Forbidden: not the author' }`
- Promise rejects
- Component disables edit button for non-authors

---

## R4 — Delete Comment

### R4.1 Delete Own Comment

**Given** logged-in user is comment author  
**When** calling `commentService.deleteComment(id)`  
**Then**:
- HTTP `DELETE /comments/:id` called
- Backend soft-deletes (sets deleted_at timestamp)
- Backend returns 200 or 204
- Local cache updated: comment removed from array
- Promise resolves
- Component removes comment from view

### R4.2 Not the Author

**Given** user is NOT comment author  
**When** calling `commentService.deleteComment(id)`  
**Then**:
- HTTP `DELETE /comments/:id` called
- Backend returns 403: `{ message: 'Forbidden' }`
- Promise rejects
- Component disables delete button for non-authors

---

## R5 — Comment Images (Stub for P0)

### R5.1 Image Upload Stubs Prepared

**Given** create comment form with image input  
**When** image selected (not yet implemented)  
**Then**:
- `commentService.uploadCommentImage(commentId, file)` skeleton exists
- Calls `POST /comments/:id/images` (stub, no implementation yet)
- Returns Observable<Image>
- Full implementation deferred to Priority 2

### R5.2 Image Compression Service

**Given** image from file input (max 5MB)  
**When** user selects image before upload (stub)  
**Then**:
- `imageCompressorService.compressImage(file, quality=0.7)` prepares file
- Converts to WebP, max size ~200KB
- Returns Blob ready for upload
- Full integration deferred to Priority 2

---

## R6 — Offline Handling

### R6.1 Comment Create While Offline

**Given** user offline, creates comment  
**When** offline sync service picks it up  
**Then**:
- Comment queued in IndexedDB (incident:123:comment:draft:1)
- Component shows "Syncing..." indicator
- When online: retry `POST /comments` automatically
- Deduplicate on server (prevent double comments if retry fires)
- Comment appears in list once synced

### R6.2 Comment Fetch While Offline

**Given** user offline, opens incident detail  
**When** `commentService.getComments(id)` called  
**Then**:
- HTTP `GET /comments/incident/:id` fails (no network)
- Error interceptor checks offline status
- If offline queue has cached version, return from cache (optional)
- Otherwise, error handled: "Cannot load comments while offline"
- Comment section shows cached data or "offline mode" message

---

## R7 — Reactive Updates

### R7.1 Comments Observable

**Given** multiple components subscribe to `commentService.getComments$()`  
**When** comment added/updated/deleted  
**Then**:
- Internal `comments$` BehaviorSubject updated
- All subscribers get new array immediately
- No need to manually refresh component
- List view reactive via `.subscribe()` or async pipe

### R7.2 Comment Cache Invalidation

**Given** user switches between incidents  
**When** new incident opened  
**Then**:
- Previous comments cache discarded
- New `GET /comments/incident/NEW_ID` called
- New cache populated
- Old comments NOT shown (prevents mixing)

---

## Integration with Components

- **IncidentDetailComponent** — calls `getComments()`, renders list, handles delete/edit
- **CommentFormComponent** — calls `createComment()`, shows submit button, handles errors
- **CommentItemComponent** — displays single comment, shows author avatar, timestamps
- **OfflineSyncService** — queues creates, retries on reconnect, deduplicates
- **AuthInterceptor** — adds JWT to all comment calls
- **ErrorInterceptor** — handles 401/403/404/422, shows toasts

---

## Endpoint Alignment

**Frontend BEFORE** (wrong):
```
GET  /incidents/:id/comments       ❌ (doesn't exist)
POST /incidents/:id/comments       ❌
```

**Backend ACTUAL** (correct):
```
GET  /comments/incident/:id        ✅ backend/modules/comments/comments.controller.ts:L20
POST /comments                     ✅ backend/modules/comments/comments.controller.ts:L26
PATCH /comments/:id                ✅ backend/modules/comments/comments.controller.ts:L35
DELETE /comments/:id               ✅ backend/modules/comments/comments.controller.ts:L39
POST /comments/:id/images          ✅ backend/modules/comments/comment-images.controller.ts:L8
```

**Frontend AFTER** (corrected):
```
GET  /comments/incident/:id        ✅
POST /comments                     ✅
PATCH /comments/:id                ✅
DELETE /comments/:id               ✅
POST /comments/:id/images          ✅ (stub)
```
