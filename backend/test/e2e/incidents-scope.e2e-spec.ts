import { randomUUID } from 'crypto';

import { IncidentsRepository } from '../../src/modules/incidents/incidents.repository';
import { SubjectScope } from '../../src/common/authz/subject-scope';
import { TestEnvironment } from '../support/test-environment';

/**
 * IncidentsRepository scope integration (T3.2 tasks 5.1/5.2, design D3).
 * Real Postgres (Testcontainers) — proves `scopeToSql` actually filters
 * rows, not just that it string-builds correctly (that's the unit-level
 * coverage in scope-sql.spec.ts).
 */
describe('IncidentsRepository — scope filtering (T3.2)', () => {
  let env: TestEnvironment;
  let repo: IncidentsRepository;

  let orgAId: string;
  let orgBId: string;
  let userA: string; // operator assigned to the org-A incident
  let userOther: string;

  let incidentOrgAAssigned: string; // org A, assigned to userA
  let incidentOrgAUnassigned: string; // org A, no assignment
  let incidentOrgB: string;
  let incidentNoOrg: string; // organization_id IS NULL

  beforeAll(async () => {
    env = await TestEnvironment.start();
    repo = env.app.get(IncidentsRepository);
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();

    orgAId = randomUUID();
    orgBId = randomUUID();
    await env.pg.query('INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4)', [
      orgAId,
      'Org A',
      orgBId,
      'Org B',
    ]);

    const citizen = await env.provisionUser(['CREATE incidents']);
    const operatorA = await env.provisionUser(['READ incidents']);
    userA = operatorA.userId;
    const operatorOther = await env.provisionUser(['READ incidents']);
    userOther = operatorOther.userId;

    async function createIncident(orgId: string | null): Promise<string> {
      const rows = await env.pg.query<{ id: string }>(
        `INSERT INTO incidents (title, location, citizen_id, organization_id)
         VALUES ($1, ST_SetSRID(ST_Point(-80.5, -2.2), 4326), $2, $3)
         RETURNING id`,
        ['Test incident', citizen.userId, orgId],
      );
      return rows.rows[0].id;
    }

    incidentOrgAAssigned = await createIncident(orgAId);
    incidentOrgAUnassigned = await createIncident(orgAId);
    incidentOrgB = await createIncident(orgBId);
    incidentNoOrg = await createIncident(null);

    await env.pg.query(
      `INSERT INTO assignments (incident_id, operator_id, role) VALUES ($1, $2, 'primary')`,
      [incidentOrgAAssigned, userA],
    );
  });

  function ids(rows: { id: string }[]): string[] {
    return rows.map((r) => r.id).sort();
  }

  it('global scope sees every incident, regardless of organization', async () => {
    const scope: SubjectScope = { kind: 'global' };
    const result = await repo.findAll({}, scope);
    const rows = (result as any).items ?? result;
    expect(ids(rows)).toEqual(
      ids([
        { id: incidentOrgAAssigned },
        { id: incidentOrgAUnassigned },
        { id: incidentOrgB },
        { id: incidentNoOrg },
      ]),
    );
    // pagination envelope carries total
    expect((result as any).total).toBe(4);
  });

  it('public scope sees every incident (unchanged from today)', async () => {
    const scope: SubjectScope = { kind: 'public' };
    const result = await repo.findAll({}, scope);
    const rows = (result as any).items ?? result;
    expect(rows.length).toBe(4);
  });

  it('org scope sees only that organization\'s incidents', async () => {
    const scope: SubjectScope = { kind: 'org', organizationId: orgAId };
    const result = await repo.findAll({}, scope);
    const rows = (result as any).items ?? result;
    expect(ids(rows)).toEqual(ids([{ id: incidentOrgAAssigned }, { id: incidentOrgAUnassigned }]));
  });

  it('org_assigned scope sees only own-org incidents assigned to that user', async () => {
    const scope: SubjectScope = { kind: 'org_assigned', organizationId: orgAId, userId: userA };
    const result = await repo.findAll({}, scope);
    const rows = (result as any).items ?? result;
    expect(ids(rows)).toEqual(ids([{ id: incidentOrgAAssigned }]));
  });

  it('org_assigned scope for a different user in the same org sees nothing', async () => {
    const scope: SubjectScope = {
      kind: 'org_assigned',
      organizationId: orgAId,
      userId: userOther,
    };
    const result = await repo.findAll({}, scope);
    const rows = (result as any).items ?? result;
    expect(rows).toEqual([]);
  });

  it('deny scope sees nothing', async () => {
    const scope: SubjectScope = { kind: 'deny', reason: 'staff_without_organization' };
    const result = await repo.findAll({}, scope);
    const rows = (result as any).items ?? result;
    expect(rows).toEqual([]);
  });

  describe('findOne', () => {
    it('org scope can read its own incident', async () => {
      const scope: SubjectScope = { kind: 'org', organizationId: orgAId };
      const row = await repo.findOne(incidentOrgAAssigned, scope);
      expect(row?.id).toBe(incidentOrgAAssigned);
    });

    it('org scope cannot read another org\'s incident (404, not 403 — service layer)', async () => {
      const scope: SubjectScope = { kind: 'org', organizationId: orgAId };
      const row = await repo.findOne(incidentOrgB, scope);
      expect(row).toBeNull();
    });

    it('org_assigned scope cannot read an unassigned incident in its own org', async () => {
      const scope: SubjectScope = { kind: 'org_assigned', organizationId: orgAId, userId: userA };
      const row = await repo.findOne(incidentOrgAUnassigned, scope);
      expect(row).toBeNull();
    });
  });

  describe('pagination', () => {
    it('returns envelope with items and total respecting page/limit', async () => {
      const scope: SubjectScope = { kind: 'global' };
      const page1 = await repo.findAll({}, scope, undefined, 1, 2);
      const page2 = await repo.findAll({}, scope, undefined, 2, 2);
      const all = await repo.findAll({}, scope, undefined, 1, 100);
      const p1 = (page1 as any).items ?? page1;
      const p2 = (page2 as any).items ?? page2;
      const tall = (all as any).items ?? all;
      expect((page1 as any).total).toBe(4);
      expect(p1.length).toBe(2);
      expect(p2.length).toBe(2);
      expect(tall.length).toBe(4);
      // distinct pages do not overlap
      const ids1 = p1.map((r: any) => r.id);
      const ids2 = p2.map((r: any) => r.id);
      expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
    });
  });
});
