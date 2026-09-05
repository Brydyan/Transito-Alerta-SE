// Existing model + additions for `2026-08-28-sc-203-auth-comments-backend-integration`.
// The backend uses `content` (not `text`) and `user_id` (not `author_id`),
// matching the `comments` table columns (T1.4 migration 0005).

// F3 (sc-303) — F3.1.5 revalidación contra el wire real.
//
// `CommentImage` se alinea con `CommentImageDto` del backend
// (`backend/src/modules/comments/dto/comment-image.dto.ts`) tras
// `SnakeCaseResponseInterceptor`:
//   - `fileSize` (TS) → `file_size` (wire). Antes el modelo declaraba
//     `size_bytes`, que NO existe en la respuesta — el bug original de
//     SC-209 fue justo la confusión `size_bytes` vs `file_size`.
//   - `comment_id` se quita: la respuesta de `POST /comments/:id/images`
//     no repite el id del comentario padre (ya se conoce por la URL).
//     Si un consumidor necesita agrupar, lo hace desde el comentario.
export interface Comment {
  id: string;
  content: string;
  incident_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCommentDto {
  content: string;
  incident_id: string;
}

export interface UpdateCommentDto {
  content?: string;
}

export interface CommentImage {
  id: string;
  url: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}
