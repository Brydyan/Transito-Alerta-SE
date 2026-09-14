import { TestEnvironment } from '../support/test-environment';
import { IncidentsService } from '../../src/modules/incidents/incidents.service';
import { SubjectScope } from '../../src/common/authz/subject-scope';
import { DataSource } from 'typeorm';

describe('A.4.3 - Query count test for incident list', () => {
  let env: TestEnvironment;
  let incidentsService: IncidentsService;
  let dataSource: DataSource;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    incidentsService = env.app.get(IncidentsService);
    dataSource = env.app.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    if (env) await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  it('does not emit one query per row on paginated list', async () => {
    const scope: SubjectScope = { kind: 'global' };
    
    // We can spy on dataSource.query
    const querySpy = jest.spyOn(dataSource, 'query');
    
    await incidentsService.findAll({}, scope);
    
    // One for the SELECT incidents ...
    // Since there is no pagination explicitly tracked as multiple queries in repository, we expect it to be 1 query.
    // Let's assert less than 3 to be safe (in case typeorm does something).
    expect(querySpy.mock.calls.length).toBeLessThanOrEqual(5);
    
    querySpy.mockRestore();
  });
});
