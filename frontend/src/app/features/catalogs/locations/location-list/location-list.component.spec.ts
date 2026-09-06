import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { LocationListComponent } from './location-list.component';
import { GeoZoneService } from '../services/geo-zone.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { IGeoZone } from '../interfaces/igeo-zone.interface';

/**
 * F2.3.5 — specs for the Ubicaciones tree list.
 *
 * The summary-card tests exist because the "last sync" card read
 * `row.updated_at`, a field the geo-zones wire never carries
 * (`GeoZoneDetailRow` selects `id, name, parent_id, level, active, polygon,
 * code, created_at` — no `updated_at`). `undefined > null` is false, so the
 * card silently rendered "—" forever. The card now derives from `created_at`,
 * which is really on the wire.
 */
describe('LocationListComponent', () => {
  let mockGeoZoneService: { listAll: jest.Mock; remove: jest.Mock };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockActivatedRoute: unknown;
  let mockAuthService: { currentUser: () => { permissions: string[] } };

  const zone = (over: Partial<IGeoZone> & { id: string }): IGeoZone => ({
    name: `Zone ${over.id}`,
    code: null,
    level: 'provincia',
    parent_id: null,
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  });

  const setup = (items: IGeoZone[]) => {
    mockGeoZoneService.listAll.mockReturnValue(of(items));
    return render(LocationListComponent, {
      providers: [
        { provide: GeoZoneService, useValue: mockGeoZoneService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
  };

  beforeEach(() => {
    mockGeoZoneService = {
      listAll: jest.fn().mockReturnValue(of([])),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockActivatedRoute = { snapshot: { params: {} } };
    mockAuthService = {
      currentUser: () => ({
        permissions: [
          'READ geo-zones',
          'CREATE geo-zones',
          'UPDATE geo-zones',
          'DELETE geo-zones',
        ],
      }),
    };
  });

  it('renders a row per zone', async () => {
    await setup([
      zone({ id: '1', name: 'Santa Elena' }),
      zone({ id: '2', name: 'Guayas' }),
    ]);

    expect(screen.queryByText('Santa Elena')).toBeTruthy();
    expect(screen.queryByText('Guayas')).toBeTruthy();
  });

  it('renders empty-state when the catalog is empty', async () => {
    await setup([]);

    expect(
      screen.queryByText(/Sin datos/i) ||
        document.querySelector('.empty-state-container'),
    ).toBeTruthy();
  });

  it('nests children under their parent and indents by depth', async () => {
    const { fixture } = await setup([
      zone({ id: 'p1', name: 'Santa Elena', level: 'provincia' }),
      zone({ id: 'c1', name: 'La Libertad', level: 'canton', parent_id: 'p1' }),
    ]);

    const component = fixture.componentInstance;
    const visible = component.visibleNodes();

    // Collapsed by default: only the root is visible.
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('p1');
    expect(visible[0].depth).toBe(0);
    expect(visible[0].children[0].depth).toBe(1);
  });

  describe('summary cards', () => {
    it('counts every zone in the catalog', async () => {
      const { fixture } = await setup([
        zone({ id: '1' }),
        zone({ id: '2' }),
        zone({ id: '3' }),
      ]);

      expect(fixture.componentInstance.totalCount()).toBe(3);
    });

    it('derives the last-created card from created_at, not a phantom updated_at', async () => {
      const { fixture } = await setup([
        zone({ id: '1', created_at: '2026-08-01T10:00:00Z' }),
        zone({ id: '2', created_at: '2026-09-03T18:30:00Z' }),
        zone({ id: '3', created_at: '2026-07-15T08:00:00Z' }),
      ]);

      const lastCreated = fixture.componentInstance.lastCreated();

      // The regression: this used to be null because `updated_at` is not
      // on the wire for geo-zones.
      expect(lastCreated).not.toBeNull();
      expect(lastCreated!.toISOString()).toBe('2026-09-03T18:30:00.000Z');
    });

    it('reports no last-created date for an empty catalog', async () => {
      const { fixture } = await setup([]);
      expect(fixture.componentInstance.lastCreated()).toBeNull();
    });

    it('counts zones per level', async () => {
      const { fixture } = await setup([
        zone({ id: '1', level: 'provincia' }),
        zone({ id: '2', level: 'canton', parent_id: '1' }),
        zone({ id: '3', level: 'canton', parent_id: '1' }),
      ]);

      const distribution = fixture.componentInstance.levelDistribution();
      expect(distribution.get('provincia')).toBe(1);
      expect(distribution.get('canton')).toBe(2);
      expect(distribution.get('parroquia')).toBe(0);
    });
  });
});
