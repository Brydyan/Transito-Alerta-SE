import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsUUID()
  incident_id!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  /** T7.4.A5 — reply target. Same-incident + max-depth-2 validated in CommentsService.create. */
  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
