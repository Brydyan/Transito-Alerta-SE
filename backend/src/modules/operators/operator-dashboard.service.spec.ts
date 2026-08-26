import { DataSource } from 'typeorm';
import { OperatorDashboardService } from './operator-dashboard.service';

type Filters = { inicio?: string; fin?: string; location_id?: string; page?: number; per_page?: number };

describe('OperatorDashboardService', () => {
  let dataSource: { query: jest.Mock };
  let service: OperatorDashboardService;

  const userId = 'user-uuid-1';

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new OperatorDashboardService(dataSource as unknown as DataSource);
  });

  function mockResponses(stats: object, incidents: object[], count: number) {
    dataSource.query
      .mockResolvedValueOnce([stats])         // stats query
      .mockResolvedValueOnce(incidents)        // incident list
      .mockResolvedValueOnce([{ count: String(count) }]); // count query
  }

  it('returns correct in_progress count for operator claimed incidents', async () => {
    mockResponses(
      { total_assigned: '3', in_progress: '2', resolved_today: '1' },
      [],
      3,
    );

    const result = await service.forOperator(userId, {} as Filters);

    expect(result.stats.in_progress).toBe(2);
    expect(result.stats.total_assigned).toBe(3);
  });

  it('resolved_today counts only incidents resolved on the current date', async () => {
    mockResponses(
      { total_assigned: '5', in_progress: '1', resolved_today: '1' },
      [],
      5,
    );

    const result = await service.forOperator(userId, {} as Filters);

    expect(result.stats.resolved_today).toBe(1);
  });

  it('date filter on inicio/fin narrows incident list', async () => {
    const now = new Date().toISOString();
    mockResponses(
      { total_assigned: '1', in_progress: '0', resolved_today: '0' },
      [
        {
          id: 'inc-1',
          title: 'August incident',
          status: 'pending',
          priority: 'medium',
          claimed_by: userId,
          category_id: null,
          category_name: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      1,
    );

    const filters = Object.assign({} as Filters, {
      inicio: '2026-08-01',
      fin: '2026-08-31',
    });
    const result = await service.forOperator(userId, filters);

    expect(result.incidents).toHaveLength(1);
    // Verify the query included date params
    const incidentCall = dataSource.query.mock.calls[1] as [string, unknown[]];
    expect(incidentCall[0]).toContain('i.created_at >=');
    expect(incidentCall[0]).toContain('i.created_at <=');
    void now;
  });

  it('empty result returns zero stats, empty incidents, and pagination', async () => {
    mockResponses(
      { total_assigned: '0', in_progress: '0', resolved_today: '0' },
      [],
      0,
    );

    const result = await service.forOperator(userId, {} as Filters);

    expect(result.stats).toEqual({ total_assigned: 0, in_progress: 0, resolved_today: 0 });
    expect(result.incidents).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.last_page).toBe(1);
  });
});
