import { Module } from '@nestjs/common';

import { GeofencingRepository } from './geofencing.repository';
import { GeofencingService } from './geofencing.service';

/**
 * GeofencingModule (design D4/D-DAG: "Geofencing -> (none — owns geo_zones)").
 * Owns geo_zones; other modules (Incidents) inject GeofencingService rather
 * than querying geo_zones directly.
 */
@Module({
  providers: [GeofencingRepository, GeofencingService],
  exports: [GeofencingService],
})
export class GeofencingModule {}
