import { Module } from '@nestjs/common';

import { GeofencingModule } from '../geofencing/geofencing.module';
import { GeoZonesController } from './geo-zones.controller';
import { GeoZonesRepository } from './geo-zones.repository';
import { GeoZonesService } from './geo-zones.service';

/**
 * GeoZonesModule (T3.8 design D1) — admin CRUD write-side for `geo_zones`.
 * Imports GeofencingModule (already exports GeofencingService — design D9)
 * for cache invalidation only. No cycle: GeofencingModule knows nothing
 * about GeoZonesModule.
 */
@Module({
  imports: [GeofencingModule],
  controllers: [GeoZonesController],
  providers: [GeoZonesService, GeoZonesRepository],
  exports: [GeoZonesService],
})
export class GeoZonesModule {}
