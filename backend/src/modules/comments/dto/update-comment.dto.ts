import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — body for `PATCH /api/comments/:id`. Re-sanitises the same
 * way `create` does (script tags stripped, angle brackets escaped).
 * The ownership check (only the author can edit) lives in
 * `CommentsService.update` — D6 in the design.
 */
export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
