import { ConflictException, NotFoundException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

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
    service = new AssignmentsService(repo as Partial<typeof repo>, eventEmitter as Partial<typeof eventEmitter>, redis as Partial<typeof redis>);
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

  describe('list', () => {
    it('returns assignments for the given incident', async () => {
      const rows = [{ id: 'a-1' }];
      repo.find.mockResolvedValue(rows);

      const result = await service.list('inc-1');

      expect(repo.find).toHaveBeenCalledWith({ where: { incidentId: 'inc-1' } });
      expect(result).toEqual(rows);
    });
  });
});
