import { Test, TestingModule } from '@nestjs/testing';
import { IncidentSocialService } from './incident-social.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentFollower } from './entities/incident-follower.entity';
import { IncidentCorroboration } from './entities/incident-corroboration.entity';
import { IncidentsService } from '../incidents/incidents.service';
import { ConflictException } from '@nestjs/common';

describe('IncidentSocialService', () => {
  let service: IncidentSocialService;
  let followerRepo: { save: jest.Mock; delete: jest.Mock; count: jest.Mock };
  let corroborationRepo: { save: jest.Mock; count: jest.Mock; findOne: jest.Mock };
  let incidentsService: { findOne: jest.Mock };

  beforeEach(async () => {
    followerRepo = { save: jest.fn(), delete: jest.fn(), count: jest.fn() };
    corroborationRepo = { save: jest.fn(), count: jest.fn(), findOne: jest.fn() };
    incidentsService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentSocialService,
        { provide: getRepositoryToken(IncidentFollower), useValue: followerRepo },
        { provide: getRepositoryToken(IncidentCorroboration), useValue: corroborationRepo },
        { provide: IncidentsService, useValue: incidentsService },
      ],
    }).compile();

    service = module.get<IncidentSocialService>(IncidentSocialService);
  });

  describe('follow', () => {
    it('should be idempotent (A.3.1)', async () => {
        followerRepo.save.mockRejectedValue({ code: '23505' }); // Unique violation
        await expect(service.follow('inc-1', 'user-1')).resolves.not.toThrow();
    });
  });

  describe('unfollow', () => {
    it('should succeed even if not followed (A.3.1)', async () => {
        followerRepo.delete.mockResolvedValue({ affected: 0 });
        await expect(service.unfollow('inc-1', 'user-1')).resolves.not.toThrow();
    });
  });

  describe('corroborate', () => {
    it('should throw 409 if corroborated twice (A.3.1)', async () => {
        incidentsService.findOne.mockResolvedValue({ id: 'inc-1', citizen_id: 'other-user' });
        corroborationRepo.save.mockRejectedValue({ code: '23505' });
        await expect(service.corroborate('inc-1', 'user-1', null)).rejects.toBeInstanceOf(ConflictException);
    });

    it('should throw 409 if author corroborates own incident (A.3.1)', async () => {
        incidentsService.findOne.mockResolvedValue({ id: 'inc-1', citizen_id: 'user-1' });
        await expect(service.corroborate('inc-1', 'user-1', null)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
