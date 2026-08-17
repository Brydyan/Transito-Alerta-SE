import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { AssignmentsService } from './assignments.service';
import { AssignmentEntity } from '../../entities/assignment.entity';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { SubjectScope } from '../../common/authz/subject-scope';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };

describe('AssignmentsService', () => {
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let redis: { xadd: jest.Mock };
  let incidentsRepository: { findOne: jest.Mock };
  let service: AssignmentsService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'a-1', ...x })),
      find: jest.fn(),
      delete: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    redis = { xadd: jest.fn() };
    incidentsRepository = { findOne: jest.fn() };
    service = new AssignmentsService(
      repo as unknown as jest.Mocked<Repository<AssignmentEntity>>,
      eventEmitter as unknown as jest.Mocked<EventEmitter2>,
      redis as unknown as jest.Mocked<Redis>,
      incidentsRepository as unknown as IncidentsRepository,
    );
  });

  describe('assign', () => {
    it('creates an assignment when the incident has no existing active assignment', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.assign('inc-1', 'op-1');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ incidentId: 'inc-1', operatorId: 'op-1', role: 'primary' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('incident.assigned', expect.any(Object));
      expect(result.operatorId).toBe('op-1');
    });

    // Regression: assign() previously only emitted a local EventEmitter2 event
    // (in-process only) and never XADDed to `incidents:events`, so a claim
    // was invisible to RealtimeStreamsConsumer and every other API instance —
    // silently breaking CC4 for this one event type while incident.created
    // and status_changed worked fine. Found while writing the T4.1a
    // assignment e2e flow.
    it('publishes incident.assigned to the incidents:events Redis Stream, not only the local EventEmitter2 (CC4)', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.assign('inc-1', 'op-1');

      expect(redis.xadd).toHaveBeenCalledWith(
        'incidents:events',
        '*',
        'type',
        'incident.assigned',
        'data',
        expect.stringContaining('"incidentId":"inc-1"'),
      );
    });

    it('does NOT publish to the stream when the claim is rejected as a conflict', async () => {
      repo.findOne.mockResolvedValue({ id: 'a-1', incidentId: 'inc-1', operatorId: 'op-1' });

      await expect(service.assign('inc-1', 'op-2')).rejects.toBeInstanceOf(ConflictException);
      expect(redis.xadd).not.toHaveBeenCalled();
    });

    it('rejects a second claim on an already-assigned incident with a conflict (R5)', async () => {
      repo.findOne.mockResolvedValue({ id: 'a-1', incidentId: 'inc-1', operatorId: 'op-1' });

      await expect(service.assign('inc-1', 'op-2')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('deletes the assignment when found', async () => {
      repo.findOne.mockResolvedValue({ id: 'a-1', incidentId: 'inc-1', operatorId: 'op-1' });

      await service.release('a-1');

      expect(repo.delete).toHaveBeenCalledWith('a-1');
    });

    it('throws NotFoundException when the assignment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.release('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list (T3.2 D3 — parent-incident scope check)', () => {
    it('returns assignments when the parent incident is visible under scope', async () => {
      incidentsRepository.findOne.mockResolvedValue({ id: 'inc-1' });
      const rows = [{ id: 'a-1' }];
      repo.find.mockResolvedValue(rows);

      const result = await service.list('inc-1', GLOBAL_SCOPE);

      expect(incidentsRepository.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(repo.find).toHaveBeenCalledWith({ where: { incidentId: 'inc-1' } });
      expect(result).toEqual(rows);
    });

    it('throws 404 when the parent incident is invisible under scope', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(service.list('inc-1', ORG_A_SCOPE)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });
});
