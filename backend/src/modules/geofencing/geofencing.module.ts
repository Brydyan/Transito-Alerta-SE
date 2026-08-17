import { Module } from '@nestjs/common';

import { GeofencingRepository } from './geofencing.repository';
import { GeofencingService } from './geofencing.service';

/**
 * GeofencingModule (design D4/D-DAG: "Geofencing -> (none — owns geo_zones)").
 * Owns geo_zones reads; other modules (Incidents) inject GeofencingService
 * rather than querying geo_zones directly. GeoZonesModule (T3.8, admin CRUD)
 * owns geo_zones writes and imports this module only for cache invalidation
 * (purgeZoneCache/purgePointCache) after a boundary edit.
 */
@Module({
  providers: [GeofencingRepository, GeofencingService],
  exports: [GeofencingService],
})
export class GeofencingModule {}
