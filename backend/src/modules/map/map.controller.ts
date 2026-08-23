import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MapFiltersResponseDto } from './dto/map-filters-response.dto';
import { MapSupportService } from './map-support.service';

/**
 * T5.4 — MapController.
 * Mirrors GeoReporta's MapFilterController. Auth-only (no permission
 * gate) because the catalog is global and the endpoint is consumed by
 * every authenticated citizen, not just admins.
 */
@Controller('map')
@UseGuards(JwtAuthGuard)
export class MapController {
  constructor(private readonly mapSupport: MapSupportService) {}

  @Get('filters')
  getFilters(): Promise<MapFiltersResponseDto> {
    return this.mapSupport.getMapFilters();
  }
}
