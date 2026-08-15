import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsUUID()
  incident_id!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
