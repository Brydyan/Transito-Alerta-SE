import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type { Redis } from 'ioredis';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService, INCIDENTS_STREAM_KEY } from './incidents.service';
import { GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubjectScope } from '../../common/authz/subject-scope';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    title: 'Pothole',
    description: null,
    status: 'pending',
    priority: 'medium',
    citizen_id: 'user-1',
    assigned_to: null,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    lat: -2.2,
    lng: -80.8,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('IncidentsService', () => {
  // sc-315 C4 (ronda 2) — `repo.updateStatus` se eliminó del repository.
  // El mock ya no lo declara; la transición de estado pasa por el
  // workflow service.
  let repo: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };
  let geofencing: { resolveZone: jest.Mock; purgeZoneCache: jest.Mock; tagCacheKey: jest.Mock };
  let organizations: { findNotifiedFor: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let redis: { xadd: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: IncidentsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    geofencing = { resolveZone: jest.fn(), purgeZoneCache: jest.fn(), tagCacheKey: jest.fn() };
    organizations = { findNotifiedFor: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    redis = { xadd: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    service = new IncidentsService(
      repo as unknown as IncidentsRepository,
      geofencing as unknown as GeofencingService,
      organizations as unknown as OrganizationsService,
      eventEmitter as unknown as jest.Mocked<EventEmitter2>,
      redis as unknown as jest.Mocked<Redis>,
      cache as unknown as jest.Mocked<Cache>,
    );
  });

  describe('create', () => {
    it('resolves a zone, derives organization_id from findNotifiedFor()[0] (T7.5.C4 — never the creator\'s own org), purges zone cache, and emits events', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
      organizations.findNotifiedFor.mockResolvedValue([
        { id: 'org-A', name: 'Org A', zone_id: 'zone-1', created_at: new Date() },
      ]);
      repo.create.mockResolvedValue(makeRow());

      const result = await service.create(
        { title: 'Pothole', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(geofencing.resolveZone).toHaveBeenCalledWith({ lat: -2.2, lng: -80.8 });
      expect(organizations.findNotifiedFor).toHaveBeenCalledWith('zone-1', null);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId: 'zone-1',
          geofenceMatched: true,
          citizenId: 'user-1',
          organizationId: 'org-A',
        }),
      );
      expect(geofencing.purgeZoneCache).toHaveBeenCalledWith('zone-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('incident.created', expect.any(Object));
      expect(redis.xadd).toHaveBeenCalledWith(
        INCIDENTS_STREAM_KEY,
        '*',
        'type',
        'incident.created',
        'data',
        expect.any(String),
      );
      expect(result.geofence_matched).toBe(true);
    });

    it('still accepts (does not throw) an incident outside all zones, persisting organization_id=null (R2/D4)', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: null, zone: null });
      organizations.findNotifiedFor.mockResolvedValue([]);
      repo.create.mockResolvedValue(makeRow({ zone_id: null, geofence_matched: false, organization_id: null }));

      const result = await service.create(
        { title: 'Pothole', lat: 0, lng: 0 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(organizations.findNotifiedFor).toHaveBeenCalledWith(null, null);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: null, geofenceMatched: false, organizationId: null }),
      );
      expect(result.geofence_matched).toBe(false);
    });

    it('persists organization_id=null when the zone has no organization', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-9', zone: { id: 'zone-9' } });
      organizations.findNotifiedFor.mockResolvedValue([]);
      repo.create.mockResolvedValue(makeRow({ zone_id: 'zone-9', organization_id: null }));

      await service.create(
        { title: 'X', lat: 1, lng: 1 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }));
    });

    // sc-315 W2 (ronda 2) — D9 del design: una incidencia con
    // `priority: 'critical'` nace en `pending`, NO en `in_progress`.
    // El test afirma que el input que `IncidentsService.create` pasa
    // al repository NO incluye un campo `status` — el default
    // `pending` lo aplica el INSERT de Postgres
    // (`'pending'` en el SQL de `IncidentsRepository.create`).
    //
    // Si alguien agrega `status: 'in_progress'` al `CreateIncidentInput`
    // "para que las críticas se muestren como activas", el aserto cae
    // y la decisión D9 (F7 necesita un estado de parada) queda
    // defendida.
    it('does NOT auto-promote a critical-priority incident to in_progress (D9)', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
      organizations.findNotifiedFor.mockResolvedValue([
        { id: 'org-A', name: 'Org A', zone_id: 'zone-1', created_at: new Date() },
      ]);
      repo.create.mockResolvedValue(makeRow({ priority: 'critical' }));

      await service.create(
        {
          title: 'Building collapse',
          description: 'smoke visible',
          lat: -2.2,
          lng: -80.8,
          priority: 'critical',
        } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      const callArg = repo.create.mock.calls[0][0];
      // El input al repository NO debe tener `status`. Si lo tiene,
      // alguien está forzando un estado de salida que la decisión D9
      // prohíbe. La columna real recibe `'pending'` por default en el
      // SQL de la fila 71 del repository (`'pending'` literal en el
      // INSERT).
      expect(callArg).not.toHaveProperty('status');
      // Y la prioridad crítica sí viaja intacta al repository.
      expect(callArg.priority).toBe('critical');
    });

    it('T7.5.C4 — picks the first org when findNotifiedFor returns several (auto-assign matches is_claimable)', async () => {
      geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
      organizations.findNotifiedFor.mockResolvedValue([
        { id: 'org-primary', name: 'Primary', zone_id: 'zone-1', created_at: new Date('2026-01-01') },
        { id: 'org-secondary', name: 'Secondary', zone_id: 'zone-1', created_at: new Date('2026-01-02') },
      ]);
      repo.create.mockResolvedValue(makeRow({ organization_id: 'org-primary' }));

      await service.create(
        { title: 'Pothole', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof service.create>[0],
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-primary' }),
      );
    });
  });

  describe('findAll', () => {
    it('returns the cached list on a hit without querying the repository', async () => {
      const row = makeRow();
      cache.get.mockResolvedValue([row]);

      const result = await service.findAll('zone-1', undefined, GLOBAL_SCOPE);

      expect(result).toEqual([row]);
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('queries and caches the list by zone+scope on a miss', async () => {
      const row = makeRow();
      cache.get.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue([row]);

      const result = await service.findAll('zone-1', undefined, GLOBAL_SCOPE);

      expect(repo.findAll).toHaveBeenCalledWith({ zoneId: 'zone-1', status: undefined }, GLOBAL_SCOPE);
      expect(cache.set).toHaveBeenCalled();
      expect(result).toEqual([row]);
    });

    // Design "Scope-blind list cache" risk: threading scope into the
    // repository alone would still serve org A's cached array to org B —
    // the cache KEY itself must carry the scope discriminator.
    it('caches org and global scope under DISTINCT keys for the same zone/status', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue([]);

      await service.findAll('zone-1', undefined, GLOBAL_SCOPE);
      await service.findAll('zone-1', undefined, ORG_A_SCOPE);

      const keysUsed = cache.set.mock.calls.map((call) => call[0]);
      expect(new Set(keysUsed).size).toBe(2);
    });
  });

  describe('findOne', () => {
    it('returns the incident when found', async () => {
      const row = makeRow();
      repo.findOne.mockResolvedValue(row);

      const result = await service.findOne('inc-1', GLOBAL_SCOPE);

      expect(repo.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(result).toEqual(row);
    });

    it('throws NotFoundException when missing or invisible under scope (D11 — 404, never 403)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing', ORG_A_SCOPE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });


  // sc-315 C2 (ronda 2) — la única ruta HTTP real que entrega el
  // catálogo de estados (`GET /incidents/statuses` y `GET /estados`)
  // pasa por acá. El test afirma que la respuesta sale del grafo
  // declarado, no de un arreglo literal escrito a mano. Si alguien
  // restaura la lista hardcoded, el test cae.
  describe('getStatuses (sc-315 C2)', () => {
    it('returns the four IncidentStatus values declared in the state machine', () => {
      const result = service.getStatuses();
      const ids = result.map((s) => s.id).sort();
      expect(ids).toEqual(['closed', 'in_progress', 'pending', 'resolved']);
    });

    it('ships a non-empty label for every status (contract for the frontend)', () => {
      const result = service.getStatuses();
      for (const entry of result) {
        expect(entry.label).toBeTruthy();
        expect(entry.label.length).toBeGreaterThan(0);
      }
    });
  });
});
