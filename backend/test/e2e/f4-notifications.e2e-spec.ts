import { TestEnvironment } from '../support/test-environment';
import { IncidentWorkflowService } from '../../src/modules/incidents/incident-workflow.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { DataSource } from 'typeorm';

describe('A.5.4 - notify followers when an incident status changes', () => {
  let env: TestEnvironment;
  let workflowService: IncidentWorkflowService;
  let dataSource: DataSource;
  let notificationsService: NotificationsService;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    workflowService = env.app.get(IncidentWorkflowService);
    dataSource = env.app.get(DataSource);
    notificationsService = env.app.get(NotificationsService);
  }, 120_000);

  afterAll(async () => {
    if (env) await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  it('incident with no followers changes status without notifications and without failing', async () => {
    const notifySpy = jest.spyOn(notificationsService, 'notify');
    
    // Insert a fake role if missing
    let [{ id: roleId }] = await dataSource.query(`SELECT id FROM roles LIMIT 1`);
    if (!roleId) {
       const res = await dataSource.query(`INSERT INTO roles (name, description, permissions) VALUES ('test_role', 'test', '[]') RETURNING id`);
       roleId = res[0].id;
    }
    const resUser = await dataSource.query(`INSERT INTO users (email, role_id, password_hash) VALUES ('f4_notif_user_${Date.now()}@example.com', $1, 'hash') RETURNING id`, [roleId]);
    const userId = resUser[0].id;
    
    const [{ id: incidentId }] = await dataSource.query(`
      INSERT INTO incidents (title, location, status, priority, citizen_id, is_anonymous, geofence_matched)
      VALUES ('No followers', ST_SetSRID(ST_Point(-80, -2), 4326), 'pending', 'low', $1, false, false) RETURNING id
    `, [userId]);

    await expect(workflowService.changeStatus({
      incidentId,
      to: 'in_progress',
      actorId: userId,
      actorPermissions: [],
    })).resolves.not.toThrow();

    expect(notifySpy).not.toHaveBeenCalled();
    notifySpy.mockRestore();
  });
});
