import { randomUUID } from 'crypto';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * Organizations / tenant-isolation e2e (T3.2). Real HTTP, real Postgres,
 * real Redis, real WebSocket — proves the security boundary end to end:
 * there is no path, HTTP or WebSocket, by which org A observes org B.
 *
 * Two organizations are provisioned per test: Org A tied to the seeded
 * Santa Elena zone (so `POST /incidents` inside it exercises the full D4
 * derivation path), Org B untied to any zone (its incidents are inserted
 * directly, since only the isolation of READS is under test there).
 */
describe('Organizations / tenant isolation e2e (T3.2)', () => {
  let env: TestEnvironment;

  const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
  const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();

    // env.reset() deliberately leaves `organizations` untouched (seed
    // fixtures other suites rely on) — this file is the only one that
    // creates org rows, so it is responsible for cleaning up its own
    // fixtures between tests, particularly the one tied to the seeded
    // Santa Elena zone (uq_organizations_zone is a partial UNIQUE index).
    await env.pg.query(
      `DELETE FROM organizations WHERE zone_id = $1 OR name IN ('Org A (Santa Elena)', 'Org B', 'New Org', 'Renamed Org')`,
      [SANTA_ELENA_ZONE_ID],
    );

    orgAId = randomUUID();
    orgBId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id) VALUES ($1, 'Org A (Santa Elena)', $2)`,
      [orgAId, SANTA_ELENA_ZONE_ID],
    );
    await env.pg.query(`INSERT INTO organizations (id, name, zone_id) VALUES ($1, 'Org B', NULL)`, [
      orgBId,
    ]);
  });

  function auth(user: ProvisionedUser): { Authorization: string } {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  async function insertIncidentForOrg(orgId: string | null, title = 'Org B incident'): Promise<string> {
    const citizen = await env.provisionUser(['CREATE incidents']);
    const rows = await env.pg.query<{ id: string }>(
      `INSERT INTO incidents (title, location, citizen_id, organization_id)
       VALUES ($1, ST_SetSRID(ST_Point(-79.0, -1.0), 4326), $2, $3)
       RETURNING id`,
      [title, citizen.userId, orgId],
    );
    return rows.rows[0].id;
  }

  // ---------------------------------------------------------------------
  // HTTP tenant isolation — incidents
  // ---------------------------------------------------------------------

  describe('incidents', () => {
    it('an admin_organizacion in Org A lists only Org A incidents (R8)', async () => {
      const orgAAdmin = await env.provisionUser(['CREATE incidents', 'READ incidents'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });

      const created = await request(env.httpServer)
        .post('/api/incidents')
        .set(auth(orgAAdmin))
        .send({ title: 'Bache en Santa Elena', ...INSIDE_SANTA_ELENA })
        .expect(201);
      expect(created.body.organization_id).toBe(orgAId);

      await insertIncidentForOrg(orgBId);

      const list = await request(env.httpServer)
        .get('/api/incidents')
        .set(auth(orgAAdmin))
        .expect(200);

      const ids: string[] = list.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(created.body.id);
      expect(ids.every((id: string) => id !== undefined)).toBe(true);
      // Zero Org B incidents leak into Org A's listing.
      const orgIds: (string | null)[] = list.body.map((r: { organization_id: string | null }) => r.organization_id);
      expect(orgIds.every((oid) => oid === orgAId)).toBe(true);
    });

    it('cross-org GET /incidents/:id returns 404, never 403', async () => {
      const orgAAdmin = await env.provisionUser(['READ incidents'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const orgBIncidentId = await insertIncidentForOrg(orgBId);

      await request(env.httpServer)
        .get(`/api/incidents/${orgBIncidentId}`)
        .set(auth(orgAAdmin))
        .expect(404);
    });

    it('operador_organizacion sees only Org A incidents assigned to them', async () => {
      const orgAOperator = await env.provisionUser(['READ incidents'], {
        organizationId: orgAId,
        roleName: 'operador_organizacion',
      });
      const assignedIncidentId = await insertIncidentForOrg(orgAId, 'Assigned to me');
      const unassignedIncidentId = await insertIncidentForOrg(orgAId, 'Not assigned');

      await env.pg.query(
        `INSERT INTO assignments (incident_id, operator_id, role) VALUES ($1, $2, 'primary')`,
        [assignedIncidentId, orgAOperator.userId],
      );

      const list = await request(env.httpServer)
        .get('/api/incidents')
        .set(auth(orgAOperator))
        .expect(200);

      const ids: string[] = list.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(assignedIncidentId);
      expect(ids).not.toContain(unassignedIncidentId);
    });

    it('an admin_organizacion with organization_id=NULL sees zero incidents, not all', async () => {
      const orphanedAdmin = await env.provisionUser(['READ incidents'], { roleName: 'admin_organizacion' });
      await insertIncidentForOrg(orgAId);
      await insertIncidentForOrg(orgBId);
      await insertIncidentForOrg(null);

      const list = await request(env.httpServer)
        .get('/api/incidents')
        .set(auth(orphanedAdmin))
        .expect(200);

      expect(list.body).toEqual([]);
    });

    it('operador_sistema sees incidents from both organizations', async () => {
      const sysOperator = await env.provisionUser(['READ incidents'], { roleName: 'operador_sistema' });
      await insertIncidentForOrg(orgAId);
      await insertIncidentForOrg(orgBId);

      const list = await request(env.httpServer)
        .get('/api/incidents')
        .set(auth(sysOperator))
        .expect(200);

      const orgIds = new Set(list.body.map((r: { organization_id: string | null }) => r.organization_id));
      expect(orgIds.has(orgAId)).toBe(true);
      expect(orgIds.has(orgBId)).toBe(true);
    });

    it('an incident created by an anonymous device inside Org A\'s zone is persisted with organization_id=A (D4 crux)', async () => {
      const login = await request(env.httpServer)
        .post('/api/auth/login')
        .send({ device_uuid: 'anonymous' })
        .expect(200);

      const created = await request(env.httpServer)
        .post('/api/incidents')
        .set({ Authorization: `Bearer ${login.body.access_token}` })
        .send({ title: 'Reporte anonimo', ...INSIDE_SANTA_ELENA })
        .expect(201);

      expect(created.body.organization_id).toBe(orgAId);

      const orgAAdmin = await env.provisionUser(['READ incidents'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const list = await request(env.httpServer)
        .get('/api/incidents')
        .set(auth(orgAAdmin))
        .expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toContain(created.body.id);
    });

    it('an incident created outside every zone is still accepted 201 with organization_id=NULL (R2)', async () => {
      const login = await request(env.httpServer)
        .post('/api/auth/login')
        .send({ device_uuid: 'anonymous' })
        .expect(200);

      const created = await request(env.httpServer)
        .post('/api/incidents')
        .set({ Authorization: `Bearer ${login.body.access_token}` })
        .send({ title: 'Fuera de zona', lat: 0, lng: 0 })
        .expect(201);

      expect(created.body.organization_id).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // HTTP tenant isolation — comments / assignments (parent-incident scope)
  // ---------------------------------------------------------------------

  describe('comments and assignments (parent-incident scope check)', () => {
    it('GET /comments/incident/:id on another org\'s incident returns 404 for an org-scoped caller, even holding READ', async () => {
      const orgAAdmin = await env.provisionUser(['READ comments'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const orgBIncidentId = await insertIncidentForOrg(orgBId);

      await request(env.httpServer)
        .get(`/api/comments/incident/${orgBIncidentId}`)
        .set(auth(orgAAdmin))
        .expect(404);
    });

    it('GET /assignments/incident/:id on another org\'s incident returns 404 for an org-scoped caller, even holding READ', async () => {
      const orgAAdmin = await env.provisionUser(['READ assignments'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const orgBIncidentId = await insertIncidentForOrg(orgBId);

      await request(env.httpServer)
        .get(`/api/assignments/incident/${orgBIncidentId}`)
        .set(auth(orgAAdmin))
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // HTTP tenant isolation — users
  // ---------------------------------------------------------------------

  describe('users', () => {
    it('GET /users returns only same-org users for an org-scoped caller', async () => {
      const orgAAdmin = await env.provisionUser(['READ users'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      await env.provisionUser([], { organizationId: orgAId, roleName: 'operador_organizacion' });
      await env.provisionUser([], { organizationId: orgBId, roleName: 'operador_organizacion' });

      const list = await request(env.httpServer)
        .get('/api/users')
        .set(auth(orgAAdmin))
        .expect(200);

      const orgIds = new Set(list.body.items.map((u: { organization_id: string | null }) => u.organization_id));
      expect(orgIds.has(orgBId)).toBe(false);
      for (const oid of orgIds) {
        expect(oid).toBe(orgAId);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Rank-protection
  // ---------------------------------------------------------------------

  describe('rank protection (D9/D10/D11)', () => {
    it('admin_organizacion calling PATCH /users/:id/organization on an admin_sistema in the same org is rejected 403 INSUFFICIENT_ROLE_RANK', async () => {
      const orgAAdmin = await env.provisionUser(['UPDATE users'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const sysAdminTarget = await env.provisionUser([], {
        organizationId: orgAId,
        roleName: 'admin_sistema',
      });

      const res = await request(env.httpServer)
        .patch(`/api/users/${sysAdminTarget.userId}/organization`)
        .set(auth(orgAAdmin))
        .send({ organization_id: orgBId })
        .expect(403);
      expect(res.body.code ?? res.body.message).toBeDefined();
    });

    it('admin_organizacion calling PATCH /users/:id/organization on a user in another org is rejected 404', async () => {
      const orgAAdmin = await env.provisionUser(['UPDATE users'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const orgBUser = await env.provisionUser([], {
        organizationId: orgBId,
        roleName: 'operador_organizacion',
      });

      await request(env.httpServer)
        .patch(`/api/users/${orgBUser.userId}/organization`)
        .set(auth(orgAAdmin))
        .send({ organization_id: orgAId })
        .expect(404);
    });

    it('admin_sistema cannot move another admin_sistema (equal rank -> 403)', async () => {
      const sysAdminActor = await env.provisionUser(['UPDATE users'], { roleName: 'admin_sistema' });
      const sysAdminTarget = await env.provisionUser([], { roleName: 'admin_sistema' });

      await request(env.httpServer)
        .patch(`/api/users/${sysAdminTarget.userId}/organization`)
        .set(auth(sysAdminActor))
        .send({ organization_id: orgAId })
        .expect(403);
    });

    it('a permitted org admin can move an operator into their own organization', async () => {
      const orgAAdmin = await env.provisionUser(['UPDATE users'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const target = await env.provisionUser([], {
        organizationId: orgAId,
        roleName: 'operador_organizacion',
      });

      const res = await request(env.httpServer)
        .patch(`/api/users/${target.userId}/organization`)
        .set(auth(orgAAdmin))
        .send({ organization_id: null })
        .expect(200);
      expect(res.body.organization_id).toBeNull();
    });

    // security/assign-role-rank-gap: POST /roles/:id/assign rank-checks the
    // target's CURRENT role via assertCanManage, but never rank-checked the
    // role being GRANTED — an admin_organizacion could hand a role-less
    // user (rankOf = MAX_SAFE_INTEGER, always passes) admin_sistema, global
    // scope over every organization. T3.2's verify report (#441) flagged
    // this route as unit-tested but never exercised over real HTTP
    // (WARNING-1); these two close that gap.
    it('admin_organizacion calling POST /roles/:id/assign to grant admin_sistema is rejected 403 INSUFFICIENT_ROLE_RANK', async () => {
      const orgAAdmin = await env.provisionUser(['ASSIGN roles'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const roleLessTarget = await env.provisionUser([], { organizationId: orgAId });
      const { rows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM roles WHERE name = 'admin_sistema'`,
      );
      const adminSistemaRoleId = rows[0].id;

      const res = await request(env.httpServer)
        .post(`/api/roles/${adminSistemaRoleId}/assign`)
        .set(auth(orgAAdmin))
        .send({ user_id: roleLessTarget.userId })
        .expect(403);
      expect(res.body.code ?? res.body.message).toBeDefined();
    });

    it('admin_organizacion calling POST /roles/:id/assign to grant operador_organizacion (a lower rank) succeeds', async () => {
      const orgAAdmin = await env.provisionUser(['ASSIGN roles'], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });
      const roleLessTarget = await env.provisionUser([], { organizationId: orgAId });
      const { rows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM roles WHERE name = 'operador_organizacion'`,
      );
      const operadorOrgRoleId = rows[0].id;

      await request(env.httpServer)
        .post(`/api/roles/${operadorOrgRoleId}/assign`)
        .set(auth(orgAAdmin))
        .send({ user_id: roleLessTarget.userId })
        .expect(201);

      const { rows: userRows } = await env.pg.query<{ role_id: string }>(
        'SELECT role_id FROM users WHERE id = $1',
        [roleLessTarget.userId],
      );
      expect(userRows[0].role_id).toBe(operadorOrgRoleId);
    });
  });

  // ---------------------------------------------------------------------
  // Every organizations route requires the matching permission
  // ---------------------------------------------------------------------

  describe('organizations CRUD permission gating', () => {
    it('is denied 403 without the matching ACTION organizations permission', async () => {
      const noPerms = await env.provisionUser([]);

      await request(env.httpServer).get('/api/organizations').set(auth(noPerms)).expect(403);
      await request(env.httpServer)
        .post('/api/organizations')
        .set(auth(noPerms))
        .send({ name: 'x' })
        .expect(403);
    });

    it('CRUD works end to end for a caller holding the permissions', async () => {
      const sysAdmin = await env.provisionUser([
        'READ organizations',
        'CREATE organizations',
        'UPDATE organizations',
        'DELETE organizations',
      ]);

      const created = await request(env.httpServer)
        .post('/api/organizations')
        .set(auth(sysAdmin))
        .send({ name: 'New Org' })
        .expect(201);

      await request(env.httpServer)
        .patch(`/api/organizations/${created.body.id}`)
        .set(auth(sysAdmin))
        .send({ name: 'Renamed Org' })
        .expect(200);

      await request(env.httpServer)
        .delete(`/api/organizations/${created.body.id}`)
        .set(auth(sysAdmin))
        .expect(204);
    });
  });

  // ---------------------------------------------------------------------
  // WebSocket isolation
  // ---------------------------------------------------------------------

  describe('WebSocket room isolation', () => {
    function connect(token: string): Socket {
      const address = env.httpServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      return ioClient(`http://127.0.0.1:${port}`, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
      });
    }

    function joinWithRetry(
      socket: Socket,
      room: string,
      attemptsLeft = 20,
    ): Promise<{ joined: boolean; room: string }> {
      return new Promise((resolve, reject) => {
        socket.emit('join', { room }, (ack: { joined: boolean; room: string }) => {
          if (ack.joined || attemptsLeft <= 0) {
            resolve(ack);
            return;
          }
          setTimeout(() => {
            joinWithRetry(socket, room, attemptsLeft - 1).then(resolve, reject);
          }, 50);
        });
      });
    }

    it('a socket authenticated as Org A staff calling join {room: "org:<B>"} receives {joined:false} and no broadcast reaches it', async () => {
      const orgAAdmin = await env.provisionUser([], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });

      const socket = connect(orgAAdmin.accessToken);
      try {
        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => resolve());
          socket.on('connect_error', (err) => reject(err));
        });

        const joinAck = await joinWithRetry(socket, `org:${orgBId}`);
        expect(joinAck).toEqual({ joined: false, room: `org:${orgBId}` });

        let received = false;
        socket.on('incident.created', () => {
          received = true;
        });

        // Direct-write an Org B incident and broadcast it via the gateway
        // path — the socket never joined org:B, so it must never see this.
        await insertIncidentForOrg(orgBId);
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(received).toBe(false);
      } finally {
        socket.disconnect();
      }
    }, 30_000);

    it('a socket authenticated as Org A staff CAN join its own org room', async () => {
      const orgAAdmin = await env.provisionUser([], {
        organizationId: orgAId,
        roleName: 'admin_organizacion',
      });

      const socket = connect(orgAAdmin.accessToken);
      try {
        await new Promise<void>((resolve, reject) => {
          socket.on('connect', () => resolve());
          socket.on('connect_error', (err) => reject(err));
        });

        const joinAck = await joinWithRetry(socket, `org:${orgAId}`);
        expect(joinAck).toEqual({ joined: true, room: `org:${orgAId}` });
      } finally {
        socket.disconnect();
      }
    }, 30_000);
  });
});
