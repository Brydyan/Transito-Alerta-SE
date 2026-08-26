# Specification: comment-images

## Purpose

Define the behavioral contract for attaching and removing image files from comments.
Scenarios derived from GeoReporta's `CommentImageController` and S3 graceful-degradation behavior.

## Scope Summary

**In scope**: `POST /api/comments/:id/images`, `DELETE /api/comments/:id/images/:imageId`.

**Additive to schema**: new `comment_images` table (migration 0020).

## Requirements

### R1 — Attach Images

Authentication is required.

The caller MUST be the owner of the comment (`comment.userId === caller.id`) OR have
`CREATE comment-images` permission.

A request MAY attach 1 to 5 images per call. More than 5 files MUST return 422.

Accepted MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. Invalid types return 422.

Maximum file size: 5MB per file. Oversized files return 422 (enforced by Multer before the service).

The response MUST be 201 with an array of image objects:
`[{id, url, mime_type, file_size, created_at}]`.

### R2 — Remove Image

Authentication is required.

The caller MUST be the owner of the comment containing the image OR have
`DELETE comment-images` permission.

The image MUST belong to the specified comment — if `comment_images.comment_id != :commentId`,
the response MUST be 404 (not 403 — the image is not visible to this comment context).

On successful deletion:
- DB row in `comment_images` MUST be removed.
- S3 deletion is attempted; on failure: a warning is logged but the DB row is still removed and
  the response MUST be 204 (graceful degradation, same as GeoReporta behavior).

Response on success: 204 No Content.

## Scenarios

### POST /api/comments/:id/images

**Scenario 1: Owner attaches a single image**
```
Given an authenticated user who owns comment C
  And a valid JPEG image file (2MB)
When POST /api/comments/C/images is sent with the image in multipart form field "images"
Then the response status is 201
  And the response body is an array with 1 image object containing id, url, mime_type, file_size
  And a row exists in comment_images with comment_id = C.id
```

**Scenario 2: Owner attaches multiple images**
```
Given an authenticated user who owns comment C
  And 3 valid PNG image files
When POST /api/comments/C/images is sent with all 3 files in field "images"
Then the response status is 201
  And the response body is an array with 3 image objects
  And 3 rows exist in comment_images with comment_id = C.id
```

**Scenario 3: Non-owner without permission gets 403**
```
Given an authenticated user who does NOT own comment C and lacks CREATE comment-images permission
When POST /api/comments/C/images is sent
Then the response status is 403
```

**Scenario 4: More than 5 files returns 422**
```
Given an authenticated user who owns comment C
  And 6 valid image files
When POST /api/comments/C/images is sent with all 6 files
Then the response status is 422
```

**Scenario 5: Invalid MIME type returns 422**
```
Given an authenticated user who owns comment C
  And a file with MIME type application/pdf
When POST /api/comments/C/images is sent with that file
Then the response status is 422
  And the error references the file type validation
```

**Scenario 6: File over 5MB returns 422**
```
Given an authenticated user who owns comment C
  And an image file of 6MB
When POST /api/comments/C/images is sent
Then the response status is 422
```

**Scenario 7: Comment not found returns 404**
```
Given a non-existent comment ID
When POST /api/comments/nonexistent-id/images is sent
Then the response status is 404
```

### DELETE /api/comments/:id/images/:imageId

**Scenario 1: Owner successfully deletes an image**
```
Given an authenticated user who owns comment C
  And image I belongs to comment C
When DELETE /api/comments/C/images/I is sent
Then the response status is 204
  And no row exists for image I in comment_images
```

**Scenario 2: S3 deletion fails but DB row is still removed (graceful degradation)**
```
Given an authenticated user who owns comment C
  And image I belongs to comment C
  And the S3 delete call throws an error
When DELETE /api/comments/C/images/I is sent
Then the response status is 204
  And no row exists for image I in comment_images
  And a warning is logged with the S3 error details
```

**Scenario 3: Image belongs to different comment returns 404**
```
Given image I belongs to comment C2 (not C)
When DELETE /api/comments/C/images/I is sent
Then the response status is 404
```

**Scenario 4: Non-owner without permission gets 403**
```
Given an authenticated user who does NOT own comment C and lacks DELETE comment-images permission
  And image I belongs to comment C
When DELETE /api/comments/C/images/I is sent
Then the response status is 403
  And image I still exists in comment_images
```

**Scenario 5: Unauthenticated request returns 401**
```
Given no Authorization header
When DELETE /api/comments/C/images/I is sent
Then the response status is 401
```
