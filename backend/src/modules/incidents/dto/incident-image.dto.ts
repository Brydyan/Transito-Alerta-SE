export class IncidentImageDto {
  id!: string;
  // 2026-10-06-incident-images-read-path (D3) — `url` removed from the
  // DTO. The metadata endpoint is now URL-free; the frontend ALWAYS
  // fetches the bytes via `GET /incidents/:id/images/:imageId/file`.
  mime_type!: string;
  file_size!: number;
  created_at!: Date;
}
