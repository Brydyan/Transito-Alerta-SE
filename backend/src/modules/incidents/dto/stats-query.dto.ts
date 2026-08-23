import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class StatsQueryDto {
  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fin?: string;

  @IsOptional()
  @IsUUID()
  tipo_id?: string;

  @IsOptional()
  @IsUUID()
  ciudad_id?: string;

  @IsOptional()
  @IsUUID()
  provincia_id?: string;

  @IsOptional()
  @IsUUID()
  pais_id?: string;
}
