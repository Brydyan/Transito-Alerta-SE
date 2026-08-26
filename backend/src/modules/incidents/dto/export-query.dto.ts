import { IsIn, IsOptional } from 'class-validator';

import { StatsQueryDto } from './stats-query.dto';

export class ExportQueryDto extends StatsQueryDto {
  /**
   * Export format — 'csv' (default) or 'xlsx'.
   * Whitelisted here so that ValidationPipe (forbidNonWhitelisted) does not
   * reject requests that include ?format= in the query string.
   */
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: string;
}
