import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GeofencingModule } from '../geofencing/geofencing.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationEntity } from '../../entities/organization.entity';
import { IncidentImageEntity } from '../../entities/incident-image.entity';
// REG (sc-325) — `EmailVerifiedGuard` consulta `email_verified_at`
// directamente del `UserEntity` (no del JWT) para evitar
// depender de un cache de permisos desactualizado. Esto
// requiere que el repositorio de `UserEntity` esté disponible
// en este módulo; lo agregamos vía `TypeOrmModule.forFeature`
// local — importar `AuthModule` o `UsersModule` enteros
// arrastraría su grafo completo (JWT, sessions, storage)
// sólo para conseguir un repositorio.
import { UserEntity } from '../../entities/user.entity';
// AUD (sc-327) — `IncidentReporterEntity` se registra acá
// (no en AuditModule) porque la única operación sobre él
// es la inserción atómica con la creación de la
// incidencia, que vive en `IncidentsService.create`.
// Mantener el repositorio local respeta la regla "los
// grafos de módulos no se cruzan al importar repos".
import { IncidentReporterEntity } from '../../entities/incident-reporters.entity';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import { IncidentWorkflowController } from './incident-workflow.controller';
import { IncidentWorkflowService } from './incident-workflow.service';
import { IncidentAnalyticsService } from './incident-analytics.service';
import { IncidentFeedService } from './incident-feed.service';
import { IncidentExportService } from './incident-export.service';
import { IncidentImagesController } from './incident-images.controller';
import { IncidentImagesService } from './incident-images.service';
import { IncidentImageStorageService } from './incident-image-storage.service';
import { FeedRecoveryService } from './feed-recovery.service';
// AUD (sc-327) — `RevealService` se registra acá (no en
// AuditModule) porque su única inserción en `audit_events`
// es la de REVEAL, que es una operación del módulo de
// incidencias. Mantenerlo local respeta la regla "los
// grafos de módulos no se cruzan al importar repos".
import { RevealService } from './reveal.service';

/**
 * IncidentsModule (design DAG: `Incidents -> Users, IncidentCategories,
 * Geofencing, Locations, Organizations`). Users/IncidentCategories/
 * Locations land in later phases; Geofencing is wired since T2.1.
 * OrganizationsModule (T3.2 design D4; T7.5 design D7) is imported for
 * `OrganizationsService.findNotifiedFor` at create time — the only edge in
 * the module boundary graph; OrganizationsModule imports nothing back.
 *
 * T5.1 — registers IncidentWorkflowController + IncidentWorkflowService
 * for the operator claim/release lifecycle. The workflow service needs the
 * OrganizationEntity repository (for max_active_claims), so it goes through
 * TypeOrmModule.forFeature.
 *
 * T6.6 — registers IncidentImagesController + IncidentImagesService +
 * IncidentImageStorageService for image attachments to incidents.
 */
@Module({
  imports: [
    GeofencingModule,
    OrganizationsModule,
    // AUD (sc-327): el módulo importa `AuditModule` para registrar
    // eventos de auditoría desde la creación de la incidencia y
    // desde la revelación de autoría.
    AuditModule,
    TypeOrmModule.forFeature([
      OrganizationEntity,
      IncidentImageEntity,
      UserEntity,
      IncidentReporterEntity,
    ]),
  ],
  controllers: [IncidentWorkflowController, IncidentsController, IncidentImagesController],
  providers: [IncidentsRepository, IncidentsService, IncidentWorkflowService, IncidentAnalyticsService, IncidentFeedService, IncidentExportService, IncidentImagesService, IncidentImageStorageService, FeedRecoveryService, RevealService],
  // IncidentsRepository is exported too (T3.2 D3) — Comments/Assignments
  // resolve the PARENT incident under the caller's scope before touching
  // their own rows, without importing the whole IncidentsService surface.
  exports: [IncidentsService, IncidentsRepository],
})
export class IncidentsModule {}
