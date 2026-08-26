import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { SubjectScope } from '../../common/authz/subject-scope';
import { StatusHistoryEntity } from '../../entities/status-history.entity';
import { StatusHistoryRepository } from './status-history.repository';
import { StatusHistoryService } from './status-history.service';

describe('StatusHistoryService', () => {
  let dataSource: { query: jest.Mock };
  let statusHistoryRepository: { findByIncident: jest.Mock };
  let service: StatusHistoryService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    statusHistoryRepository = { findByIncident: jest.fn() };
    service = new StatusHistoryService(
      dataSource as unknown as DataSource,
      statusHistoryRepository as unknown as StatusHistoryRepository,
    );
  });

  const globalScope: SubjectScope = { kind: 'global' };

  it('throws NotFoundException when the incident does not exist (global scope)', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(service.findByIncident('missing-id', globalScope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(statusHistoryRepository.findByIncident).not.toHaveBeenCalled();
  });

  it('returns {items, total} ordered created_at ASC, id ASC when the incident exists', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    const rows = [
      { id: 'a', createdAt: new Date('2026-01-01') },
      { id: 'b', createdAt: new Date('2026-01-02') },
    ] as StatusHistoryEntity[];
    statusHistoryRepository.findByIncident.mockResolvedValue(rows);

    const result = await service.findByIncident('incident-1', globalScope);

    expect(statusHistoryRepository.findByIncident).toHaveBeenCalledWith('incident-1');
    expect(result).toEqual({ items: rows, total: 2 });
  });

  it('returns {items: [], total: 0} when the incident exists but has no rows yet', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    statusHistoryRepository.findByIncident.mockResolvedValue([]);

    const result = await service.findByIncident('incident-1', globalScope);

    expect(result).toEqual({ items: [], total: 0 });
  });

  // Cross-tenant leak closure -------------------------------------------------

  it('org scope: existence check is filtered by organization_id (query shape regression guard)', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    statusHistoryRepository.findByIncident.mockResolvedValue([]);

    const scope: SubjectScope = { kind: 'org', organizationId: 'org-1' };
    await service.findByIncident('incident-1', scope);

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('FROM incidents');
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual(['incident-1', 'org-1']);
  });

  it('org scope: an out-of-scope incident (belongs to another org) 404s, not 403', async () => {
    // The scoped query returns zero rows because the org filter excludes it,
    // even though the incident exists in the DB — indistinguishable from a
    // truly missing incident (D11: never confirm existence across orgs).
    dataSource.query.mockResolvedValue([]);

    const scope: SubjectScope = { kind: 'org', organizationId: 'org-1' };

    await expect(service.findByIncident('other-org-incident', scope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(statusHistoryRepository.findByIncident).not.toHaveBeenCalled();
  });

  it('org_assigned scope: existence check includes the assignment EXISTS subquery referencing incidents.id', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    statusHistoryRepository.findByIncident.mockResolvedValue([]);

    const scope: SubjectScope = { kind: 'org_assigned', organizationId: 'org-1', userId: 'user-1' };
    await service.findByIncident('incident-1', scope);

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('incidents.id');
    expect(params).toEqual(['incident-1', 'org-1', 'user-1']);
  });

  it('org_assigned scope: unassigned incident in the same org 404s', async () => {
    dataSource.query.mockResolvedValue([]);

    const scope: SubjectScope = { kind: 'org_assigned', organizationId: 'org-1', userId: 'user-1' };

    await expect(service.findByIncident('unassigned-incident', scope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deny scope: always 404s, never queries status history', async () => {
    dataSource.query.mockResolvedValue([]);

    const scope: SubjectScope = { kind: 'deny', reason: 'staff_without_organization' };

    await expect(service.findByIncident('incident-1', scope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('FALSE');
    expect(statusHistoryRepository.findByIncident).not.toHaveBeenCalled();
  });

  it('public scope: behaves like global (no filter) for the existence check', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    statusHistoryRepository.findByIncident.mockResolvedValue([]);

    const scope: SubjectScope = { kind: 'public' };
    await service.findByIncident('incident-1', scope);

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('TRUE');
    expect(params).toEqual(['incident-1']);
  });
});
