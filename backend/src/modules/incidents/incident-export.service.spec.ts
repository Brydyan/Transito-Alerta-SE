import { DataSource } from 'typeorm';
import { IncidentExportService } from './incident-export.service';
import { AuthContext } from '../../common/authz/subject-scope';

const ADMIN: AuthContext = {
  userId: 'a-1', roleName: 'admin_sistema', organizationId: null,
  permissions: ['READ dashboard'], scope: { kind: 'global' }, sessionId: null, isAnonymous: false,
};

type Filters = { inicio?: string; fin?: string; tipo_id?: string };

function makeRow(id: string) {
  return {
    id, title: 'Test', status: 'pending', priority: 'medium',
    org_name: 'Org', category_name: null,
    created_at: new Date('2026-08-01T00:00:00Z'),
    updated_at: new Date('2026-08-01T00:00:00Z'),
  };
}

async function collectStream(readable: import('stream').Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('IncidentExportService', () => {
  let ds: { query: jest.Mock };
  let service: IncidentExportService;

  beforeEach(() => {
    ds = { query: jest.fn() };
    service = new IncidentExportService(ds as unknown as DataSource);
  });

  it('CSV header row matches expected columns', async () => {
    ds.query.mockResolvedValue([]);

    const stream = service.createCsvStream({} as Filters, ADMIN, 5000);
    const csv = await collectStream(stream);

    expect(csv).toContain('id,title,status,priority,organization,category,created_at,resolution_date');
  });

  it('row count capped at cap param when total > cap', async () => {
    // cap=5, BATCH_SIZE=500 → batchSize=5; mock returns exactly 5 rows
    // After first batch exported(5)==cap(5), loop exits → no second DB call
    ds.query
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => makeRow(`inc-${i}`)));

    const stream = service.createCsvStream({} as Filters, ADMIN, 5);
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(6); // 1 header + 5 rows
  });

  it('date range filter applies correct SQL clause', async () => {
    ds.query.mockResolvedValue([]);

    const stream = service.createCsvStream(
      { inicio: '2026-08-01', fin: '2026-08-31' } as Filters,
      ADMIN,
      5000,
    );
    await collectStream(stream);

    const sql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
    expect(sql).toContain('created_at >=');
    expect(sql).toContain('created_at <=');
  });
});
