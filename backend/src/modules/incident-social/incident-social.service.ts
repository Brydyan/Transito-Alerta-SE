import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentFollower } from './entities/incident-follower.entity';
import { IncidentCorroboration } from './entities/incident-corroboration.entity';
import { IncidentsService } from '../incidents/incidents.service';

@Injectable()
export class IncidentSocialService {
    constructor(
        @InjectRepository(IncidentFollower)
        private followerRepo: Repository<IncidentFollower>,
        @InjectRepository(IncidentCorroboration)
        private corroborationRepo: Repository<IncidentCorroboration>,
        private incidentsService: IncidentsService
    ) {}

    async follow(incidentId: string, userId: string): Promise<void> {
        try {
            await this.followerRepo.save({ incident: { id: incidentId }, user: { id: userId } });
        } catch (e) {
            if (e.code !== '23505') throw e;
            // Idempotent: ignore unique violation
        }
    }

    async unfollow(incidentId: string, userId: string): Promise<void> {
        await this.followerRepo.delete({ incident: { id: incidentId }, user: { id: userId } });
    }

    async corroborate(incidentId: string, userId: string, comment: string | null): Promise<void> {
        const incident = await this.incidentsService.findOne(incidentId, { kind: 'global' }); // Need to check scope?
        if (!incident) throw new NotFoundException('Incident not found');
        
        if (incident.citizen_id === userId) {
            throw new ConflictException('Author cannot corroborate own incident');
        }

        try {
            await this.corroborationRepo.save({ 
                incident: { id: incidentId }, 
                user: { id: userId }, 
                comment: comment || '' // Ensure comment is string
            });
        } catch (e) {
            if (e.code === '23505') throw new ConflictException('Already corroborated');
            throw e;
        }
    }
}
