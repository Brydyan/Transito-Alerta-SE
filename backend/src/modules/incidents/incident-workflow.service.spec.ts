import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import { IncidentWorkflowService } from './incident-workflow.service';
import {
  CLAIM_LIMIT_REACHED,
  INCIDENT_ALREADY_CLAIMED,
  INCIDENT_NOT_CLAIMED,
  NOT_THE_CLAIMER,
  WRONG_ORGANIZATION,
} from './incident-workflow.errors';

// ---------- helpers ----------------------------------------------------------

function makeDataSource(queryMock: jest.Mock) {
  return { query: queryMock } as unknown as DataSource;
}

function makeOrgRepo(org: Partial<OrganizationEntity> | null) {
  return {
    findOne: jest.fn().mockResolvedValue(org),
  } as unknown as Repository<OrganizationEntity>;
}

const OP_A = { id: 'op-a', organizationId: 'org-X', role: 'operador_org' };
const OP_B = { id: 'op-b', organizationId: 'org-X', role: 'operador_org' };
const ADMIN = { id: 'admin-1', organizationId: 'org-X', role: 'master' };
const OUTSIDER = { id: 'op-z', organizationId: 'org-Y', role: 'operador_org' };

const INCIDENT = {
  id: 'inc-1',
  title: 'Test',
  status: 'pending',
  priority: 'medium',
  claimed_by: null,
  organization_id: 'org-X',
  updated_at: new Date('2026-08-23T00:00:00Z'),
};

// query() is invoked in a known order per call path; we script the answers
// queue-style (shift) so each invocation gets the right mocked row.
function makeQueuedQuery(answers: unknown[]) {
  return jest.fn().mockImplementation(() => {
    if (answers.length === 0) {
      throw new Error('Query queue exhausted — test under-spec');
    }
    return Promise.resolve(answers.shift());
  });
}

async function buildService(
  queryAnswers: unknown[],
  org: Partial<OrganizationEntity> | null = null,
): Promise<IncidentWorkflowService> {
  const module = await Test.createTestingModule({
    providers: [
      IncidentWorkflowService,
      { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(org) },
      { provide: DataSource, useValue: makeDataSource(makeQueuedQuery(queryAnswers)) },
    ],
  }).compile();
  return module.get(IncidentWorkflowService);
}

// ---------- claim -----------------------------------------------------------

describe('IncidentWorkflowService.claim', () => {
  it('throws NotFoundException when the incident does not exist', async () => {
    const svc = await buildService([[]]);
    await expect(svc.claim('missing', OP_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException with WRONG_ORGANIZATION when the operator is not in the same org', async () => {
    const svc = await buildService([[INCIDENT]]);
    const err = await svc.claim('inc-1', OUTSIDER).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toContain(WRONG_ORGANIZATION);
  });

  it('lets a system admin claim across orgs', async () => {
    // 1) loadIncident → [INCIDENT]  2) active-count → 0  3) CAS → [updated]
    const updated = { ...INCIDENT, claimed_by: ADMIN.id };
    const svc = await buildService([
      [INCIDENT],
      [{ count: '0' }],
      [updated],
    ]);
    const res = await svc.claim('inc-1', ADMIN);
    expect(res.claimedBy).toBe(ADMIN.id);
  });

  it('throws HttpException with CLAIM_LIMIT_REACHED when the operator is at the cap', async () => {
    // 1) loadIncident  2) active-count returns 5 (== max=5)
    const svc = await buildService([[INCIDENT], [{ count: '5' }]], {
      id: 'org-X',
      maxActiveClaims: 5,
    } as OrganizationEntity);
    const err = await svc.claim('inc-1', OP_A).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.message).toContain(CLAIM_LIMIT_REACHED);
  });

  it('throws ConflictException with INCIDENT_ALREADY_CLAIMED on CAS miss', async () => {
    // 1) loadIncident  2) active-count = 0  3) CAS returns []
    const svc = await buildService([[INCIDENT], [{ count: '0' }], []]);
    const err = await svc.claim('inc-1', OP_A).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain(INCIDENT_ALREADY_CLAIMED);
  });

  it('returns the updated row on the happy path', async () => {
    const updated = { ...INCIDENT, claimed_by: OP_A.id };
    const svc = await buildService([[INCIDENT], [{ count: '0' }], [updated]]);
    const res = await svc.claim('inc-1', OP_A);
    expect(res.claimedBy).toBe(OP_A.id);
    expect(res.id).toBe('inc-1');
    expect(res.status).toBe('pending');
  });

  it('does not manually write updated_at in the claim UPDATE (trigger handles it)', async () => {
    const updated = { ...INCIDENT, claimed_by: OP_A.id };
    const queryMock = jest.fn();
    queryMock.mockResolvedValueOnce([INCIDENT]); // loadIncident
    queryMock.mockResolvedValueOnce([{ count: '0' }]); // activeClaimCountFor
    queryMock.mockResolvedValueOnce([updated]); // claim UPDATE

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: makeDataSource(queryMock) },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await svc.claim('inc-1', OP_A);

    const claimUpdateCall = queryMock.mock.calls[2]; // third call is the claim UPDATE
    const sql = claimUpdateCall[0];
    expect(sql).not.toContain('updated_at = ');
    expect(sql).toContain('claimed_at = NOW()');
  });
});

// ---------- release ---------------------------------------------------------

describe('IncidentWorkflowService.release', () => {
  it('throws NotFoundException when the incident does not exist', async () => {
    const svc = await buildService([[]]);
    await expect(svc.release('missing', OP_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException with INCIDENT_NOT_CLAIMED when claimed_by is null', async () => {
    const svc = await buildService([[INCIDENT]]);
    const err = await svc.release('inc-1', OP_A).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain(INCIDENT_NOT_CLAIMED);
  });

  it('throws ForbiddenException with NOT_THE_CLAIMER when the caller is not the holder', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    const svc = await buildService([[claimed]]);
    const err = await svc.release('inc-1', OP_B).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toContain(NOT_THE_CLAIMER);
  });

  it('clears claimed_by on the happy path', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    const cleared = { ...claimed, claimed_by: null };
    const svc = await buildService([[claimed], [cleared]]);
    const res = await svc.release('inc-1', OP_A);
    expect(res.claimedBy).toBeNull();
  });

  it('does not manually write updated_at in the release UPDATE (trigger handles it)', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    const cleared = { ...claimed, claimed_by: null };
    const queryMock = jest.fn();
    queryMock.mockResolvedValueOnce([claimed]); // loadIncident
    queryMock.mockResolvedValueOnce([cleared]); // release UPDATE

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: makeDataSource(queryMock) },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await svc.release('inc-1', OP_A);

    const releaseUpdateCall = queryMock.mock.calls[1]; // second call is the release UPDATE
    const sql = releaseUpdateCall[0];
    expect(sql).not.toContain('updated_at = ');
    expect(sql).toContain('claimed_by = NULL');
  });
});

// ---------- availableOperators --------------------------------------------

describe('IncidentWorkflowService.availableOperators', () => {
  it('returns [] when the incident has no organization', async () => {
    const orphan = { ...INCIDENT, organization_id: null };
    const svc = await buildService([[orphan]]);
    expect(await svc.availableOperators('inc-1')).toEqual([]);
  });

  it('returns operators under the cap, excluding the current claimer', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    // 1) loadIncident  2) operator SELECT — only OP_B returned (OP_A excluded, count < max)
    const svc = await buildService(
      [
        [claimed],
        [
          {
            id: OP_B.id,
            name: 'operator-b-device',
            email: 'b@x.test',
            active_count: '2',
          },
        ],
      ],
      { id: 'org-X', maxActiveClaims: 5 } as OrganizationEntity,
    );
    const list = await svc.availableOperators('inc-1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(OP_B.id);
    expect(list[0].activeClaimCount).toBe(2);
  });
});

// ---------- getStatuses ----------------------------------------------------

describe('IncidentWorkflowService.getStatuses', () => {
  it('returns the exact IncidentStatus enum values', async () => {
    const svc = await buildService([]);
    expect(svc.getStatuses()).toEqual(['pending', 'in_progress', 'resolved']);
  });
});
