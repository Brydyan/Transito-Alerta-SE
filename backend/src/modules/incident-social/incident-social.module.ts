import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentFollower } from './entities/incident-follower.entity';
import { IncidentCorroboration } from './entities/incident-corroboration.entity';
import { IncidentSocialService } from './incident-social.service';
import { IncidentSocialController } from './incident-social.controller';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([IncidentFollower, IncidentCorroboration]),
        IncidentsModule
    ],
    providers: [IncidentSocialService],
    controllers: [IncidentSocialController],
    exports: [IncidentSocialService]
})
export class IncidentSocialModule {}
