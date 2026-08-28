// Existing model + additions for `2026-08-28-sc-203-auth-comments-backend-integration`.
// The backend uses `content` (not `text`) and `user_id` (not `author_id`),
// matching the `comments` table columns (T1.4 migration 0005).

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
  comment_id: string;
  url: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
}
