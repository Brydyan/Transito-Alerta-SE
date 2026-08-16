import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateIncidentCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
