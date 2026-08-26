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
