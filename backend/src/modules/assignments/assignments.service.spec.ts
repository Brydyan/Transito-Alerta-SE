import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import { AssignmentsService } from './assignments.service';
import { AssignmentEntity } from './entities/assignment.entity';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { IncidentWorkflowService } from '../incidents/incident-workflow.service';
import { AuthContext, SubjectScope } from '../../shared/authz/subject-scope';
import { CLAIM_LIMIT_REACHED } from '../incidents/incident-workflow.errors';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    permissions: ['ASSIGN assignments'],
    organizationId: 'org-A',
    roleName: 'admin_org',
    scope: ORG_A_SCOPE,
    sessionId: null,
    isAnonymous: false,
    ...overrides,
  };
}

function masterAuth(): AuthContext {
  return auth({
    userId: 'master-1',
    roleName: 'master',
    organizationId: null,
    scope: GLOBAL_SCOPE,
  });
}

/**
 * Round 2 (F7 W4) — operator lookup now goes through
 * `workflow.findUserOrganizationId(operatorId)` instead of reaching
 * into the workflow's private `dataSource`. The mock below
 * replaces the old `dataSource.query` mock.
 */
function operatorIn(orgId: string | null) {
  return jest.fn().mockResolvedValue(orgId);
}

describe('AssignmentsService', () => {
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let redis: { xadd: jest.Mock };
  let incidentsRepository: { findOne: jest.Mock };
  let workflow: {
    getMaxActiveClaimsFor: jest.Mock;
    getActiveClaimCount: jest.Mock;
    findUserOrganizationId: jest.Mock;
  };
  let service: AssignmentsService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'a-1', ...x })),
      find: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    redis = { xadd: jest.fn() };
    incidentsRepository = { findOne: jest.fn() };
    workflow = {
      getMaxActiveClaimsFor: jest.fn().mockResolvedValue(3),
      getActiveClaimCount: jest.fn().mockResolvedValue(0),
      findUserOrganizationId: jest.fn().mockImplementation(operatorIn('org-A')),
    };
    service = new AssignmentsService(
      repo as unknown as jest.Mocked<Repository<AssignmentEntity>>,
      eventEmitter as unknown as jest.Mocked<EventEmitter2>,
      redis as unknown as jest.Mocked<Redis>,
      incidentsRepository as unknown as IncidentsRepository,
      workflow as unknown as IncidentWorkflowService,
    );
  });

  describe('assign — happy path + D1 (parity with claim)', () => {
    it('creates an assignment when the operator is under cap', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'medium',
      });

      repo.findOne.mockResolvedValue(null);
      workflow.getActiveClaimCount.mockResolvedValue(0);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);

      const result = await service.assign('inc-1', 'op-1', 'primary', auth());

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: 'inc-1',
          operatorId: 'op-1',
          role: 'primary',
          capOverrideReason: null,
          capOverrideBy: null,
        }),
      );
      expect(result.id).toBe('a-1');
    });
  });

  describe('A.2 / D1 — cap parity with the claim path', () => {
    it('rejects assign with 429 CLAIM_LIMIT_REACHED when the operator is at cap and no override is given', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'high',
      });
      repo.findOne.mockResolvedValue(null);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);
      workflow.getActiveClaimCount.mockResolvedValue(3);

      await expect(
        service.assign('inc-1', 'op-1', 'primary', auth()),
      ).rejects.toBeInstanceOf(HttpException);

      try {
        await service.assign('inc-1', 'op-1', 'primary', auth());
        fail('expected 429');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(429);
        expect((err as HttpException).getResponse()).toEqual(CLAIM_LIMIT_REACHED);
      }
    });
  });

  describe('A.3 / D2/D3 — cap override', () => {
    it('persists cap_override_reason and cap_override_by when override_cap+reason are set on a critical incident', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'critical',
      });
      repo.findOne.mockResolvedValue(null);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);
      workflow.getActiveClaimCount.mockResolvedValue(3);

      await service.assign('inc-1', 'op-1', 'primary', auth(), {
        overrideCap: true,
        overrideReason: 'flood on main street, only operator on shift',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          capOverrideReason: 'flood on main street, only operator on shift',
          capOverrideBy: 'admin-1',
        }),
      );
    });

    it('rejects override_cap with 422 when no reason is provided', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'critical',
      });
      repo.findOne.mockResolvedValue(null);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);
      workflow.getActiveClaimCount.mockResolvedValue(3);

      await expect(
        service.assign('inc-1', 'op-1', 'primary', auth(), { overrideCap: true }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects override_cap with 422 on a non-critical incident (D2)', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'high',
      });
      repo.findOne.mockResolvedValue(null);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);
      workflow.getActiveClaimCount.mockResolvedValue(3);

      await expect(
        service.assign('inc-1', 'op-1', 'primary', auth(), {
          overrideCap: true,
          overrideReason: 'reason',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('A.5 / D12 — scope match', () => {
    it('rejects with 403 when an admin_org of org A tries to assign an operator of org B', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'medium',
      });
      workflow.findUserOrganizationId.mockResolvedValue('org-B');

      await expect(
        service.assign('inc-1', 'op-1', 'primary', auth()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects with 404 (parent-invisible) when an admin_org of org A tries to assign on an incident of org B', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assign('inc-1', 'op-1', 'primary', auth()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('master keeps global scope — assign succeeds across orgs', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'medium',
      });
      workflow.findUserOrganizationId.mockResolvedValue('org-B');
      repo.findOne.mockResolvedValue(null);
      workflow.getActiveClaimCount.mockResolvedValue(0);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);

      const result = await service.assign('inc-1', 'op-1', 'primary', masterAuth());

      expect(result.id).toBe('a-1');
    });

    it('rejects release with 403 when the parent incident belongs to a different org', async () => {
      repo.findOne.mockResolvedValue({
        id: 'a-1',
        incidentId: 'inc-1',
        operatorId: 'op-1',
      });
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(service.release('a-1', auth())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('A.1 — pre-existing behavior preserved', () => {
    it('rejects a second claim on an already-assigned incident with 409', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'low',
      });
      repo.findOne.mockResolvedValue({ id: 'a-existing', incidentId: 'inc-1' });

      await expect(
        service.assign('inc-1', 'op-1', 'primary', auth()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('publishes incident.assigned to the incidents:events Redis Stream', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'low',
      });
      repo.findOne.mockResolvedValue(null);
      workflow.getActiveClaimCount.mockResolvedValue(0);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);

      await service.assign('inc-1', 'op-1', 'primary', auth());

      expect(redis.xadd).toHaveBeenCalledWith(
        'incidents:events',
        '*',
        'type',
        'incident.assigned',
        'data',
        expect.stringContaining('"incidentId":"inc-1"'),
      );
    });

    it('emits incident.assigned via EventEmitter2 with capOverrideReason (D11)', async () => {
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'critical',
      });
      repo.findOne.mockResolvedValue(null);
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);
      workflow.getActiveClaimCount.mockResolvedValue(3);

      await service.assign('inc-1', 'op-1', 'primary', auth(), {
        overrideCap: true,
        overrideReason: 'all others at cap',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'incident.assigned',
        expect.objectContaining({ capOverrideReason: 'all others at cap' }),
      );
    });
  });

  describe('update', () => {
    it('throws BadRequestException when neither operator_id nor role is provided', async () => {
      repo.findOne.mockResolvedValue({ id: 'a-1', incidentId: 'inc-1' });

      await expect(service.update('a-1', {}, auth())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('re-checks the cap on operator change', async () => {
      repo.findOne.mockResolvedValue({
        id: 'a-1',
        incidentId: 'inc-1',
        operatorId: 'op-1',
      });
      incidentsRepository.findOne.mockResolvedValue({
        id: 'inc-1',
        organization_id: 'org-A',
        priority: 'medium',
      });
      workflow.findUserOrganizationId.mockResolvedValue('org-A');
      workflow.getMaxActiveClaimsFor.mockResolvedValue(3);
      workflow.getActiveClaimCount.mockResolvedValue(3);

      await expect(
        service.update('a-1', { operator_id: 'op-2' }, auth()),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('list', () => {
    it('returns assignments when the parent incident is visible under scope', async () => {
      incidentsRepository.findOne.mockResolvedValue({ id: 'inc-1' });
      const rows = [{ id: 'a-1' }];
      repo.find.mockResolvedValue(rows);

      const result = await service.list('inc-1', GLOBAL_SCOPE);

      expect(incidentsRepository.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(result).toEqual(rows);
    });

    it('throws 404 when the parent incident is invisible under scope', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(service.list('inc-1', ORG_A_SCOPE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
