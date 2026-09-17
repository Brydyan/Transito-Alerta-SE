import { TestBed } from '@angular/core/testing';
import { OfflineSyncService } from './offline-sync.service';
import { IndexedDbService } from '../db/indexed-db.service';
import { IncidentService } from './incident.service';
import { ConnectionService } from './connection.service';
import { of } from 'rxjs';

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let mockIndexedDb: Pick<IndexedDbService, 'addPendingIncident' | 'getPendingByStatus'>;
  let mockIncidentService: Pick<IncidentService, 'createIncident'>;
  let mockConnectionService: Pick<ConnectionService, 'getConnectionStatus$'>;

  beforeEach(async () => {
    mockIndexedDb = {
      addPendingIncident: jest.fn().mockResolvedValue('123'),
      getPendingByStatus: jest.fn().mockResolvedValue([]),
    } as unknown as Pick<IndexedDbService, 'addPendingIncident' | 'getPendingByStatus'>;

    mockIncidentService = {
      createIncident: jest.fn().mockReturnValue(of({})),
    } as unknown as Pick<IncidentService, 'createIncident'>;

    mockConnectionService = {
      getConnectionStatus$: jest.fn().mockReturnValue(of(true)),
    } as unknown as Pick<ConnectionService, 'getConnectionStatus$'>;

    await TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        { provide: IndexedDbService, useValue: mockIndexedDb },
        { provide: IncidentService, useValue: mockIncidentService },
        { provide: ConnectionService, useValue: mockConnectionService }
      ],
    }).compileComponents();

    service = TestBed.inject(OfflineSyncService);
  });

  it('should queue incident', async () => {
    const incident = { title: 'Test', latitude: -2.0, longitude: -80.5 };
    const id = await service.queueIncident(incident);
    expect(id).toBe('123');
  });
});
