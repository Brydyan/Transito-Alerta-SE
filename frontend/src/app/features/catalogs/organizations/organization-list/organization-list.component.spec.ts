import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { OrganizationListComponent } from './organization-list.component';
import { OrganizationService } from '../services/organization.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { IOrganization } from '../interfaces/iorganization.interface';

describe('OrganizationListComponent', () => {
  let mockOrganizationService: {
    list: jest.Mock;
    listAll: jest.Mock;
    formData: jest.Mock;
    remove: jest.Mock;
  };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockActivatedRoute: unknown;
  let mockAuthService: { currentUser: () => { permissions: string[] } };

  const org = (over: Partial<IOrganization> & { id: string }): IOrganization => ({
    name: `Org ${over.id}`,
    zone_id: null,
    parent_id: null,
    incident_category_id: null,
    max_active_claims: 0,
    created_at: '2026-07-22T00:00:00Z',
    ...over,
  });

  const setup = (
    items: IOrganization[],
    zones: Array<{ id: string; name: string }> = [],
  ) => {
    mockOrganizationService.list.mockReturnValue(
      of({ items, total: items.length }),
    );
    mockOrganizationService.listAll.mockReturnValue(of(items));
    mockOrganizationService.formData.mockReturnValue(
      of({ roles: [], geo_zones: zones }),
    );

    return render(OrganizationListComponent, {
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
  };

  beforeEach(() => {
    mockOrganizationService = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      listAll: jest.fn().mockReturnValue(of([])),
      formData: jest.fn().mockReturnValue(of({ roles: [], geo_zones: [] })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockActivatedRoute = { snapshot: { params: {} } };
    mockAuthService = {
      currentUser: () => ({
        permissions: [
          'READ organizations',
          'CREATE organizations',
          'UPDATE organizations',
          'DELETE organizations',
        ],
      }),
    };
  });

  it('renders rows for fetched organizations', async () => {
    await setup([org({ id: '1', name: 'Org 1' }), org({ id: '2', name: 'Org 2' })]);

    expect(screen.queryByText('Org 1')).toBeTruthy();
    expect(screen.queryByText('Org 2')).toBeTruthy();
  });

  it('renders empty-state when no organizations exist', async () => {
    await setup([]);

    expect(
      screen.queryByText(/Sin datos/i) ||
        document.querySelector('.empty-state-container'),
    ).toBeTruthy();
  });

  /**
   * F2.5.7 — el mock 08-01 muestra una columna «LOCALIZACIÓN» por
   * organización. El wire trae `zone_id` (un UUID), así que el nombre se
   * resuelve contra `GET /organizations/form-data`.
   */
  describe('columna LOCALIZACIÓN', () => {
    it('resuelve el nombre de la zona a partir de zone_id', async () => {
      await setup(
        [org({ id: '1', name: 'GAD Municipal del Cantón Quito', zone_id: 'z-q' })],
        [
          { id: 'z-q', name: 'Quito' },
          { id: 'z-g', name: 'Guayaquil' },
        ],
      );

      expect(screen.queryByText('Quito')).toBeTruthy();
      expect(screen.queryByText('Guayaquil')).toBeFalsy();
    });

    it('muestra un guion cuando la organización no tiene zona', async () => {
      const { fixture } = await setup([org({ id: '1', zone_id: null })], []);

      expect(fixture.componentInstance.zoneName(null)).toBe('—');
    });

    it('muestra un guion cuando la zona no está en form-data', async () => {
      const { fixture } = await setup(
        [org({ id: '1', zone_id: 'z-desconocida' })],
        [{ id: 'z-q', name: 'Quito' }],
      );

      expect(fixture.componentInstance.zoneName('z-desconocida')).toBe('—');
    });
  });

  /**
   * Tarjetas al pie del mock 08-01: total de entidades, ciudades alcanzadas
   * (cantones distintos) y altas del mes.
   */
  describe('tarjetas de resumen', () => {
    it('cuenta ciudades alcanzadas como zonas distintas, no como filas', async () => {
      const { fixture } = await setup(
        [
          org({ id: '1', zone_id: 'z-q' }),
          org({ id: '2', zone_id: 'z-q' }),
          org({ id: '3', zone_id: 'z-g' }),
          org({ id: '4', zone_id: null }),
        ],
        [
          { id: 'z-q', name: 'Quito' },
          { id: 'z-g', name: 'Guayaquil' },
        ],
      );

      // Cuatro organizaciones, dos zonas reales, una sin zona.
      expect(fixture.componentInstance.citiesReached()).toBe(2);
    });

    it('cuenta el total sobre el catálogo entero, no sobre la página', async () => {
      const { fixture } = await setup([
        org({ id: '1' }),
        org({ id: '2' }),
        org({ id: '3' }),
      ]);

      expect(fixture.componentInstance.totalCount()).toBe(3);
    });

    it('cuenta sólo las altas del mes en curso', async () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5).toISOString();
      const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), 5).toISOString();

      const { fixture } = await setup([
        org({ id: '1', created_at: thisMonth }),
        org({ id: '2', created_at: thisMonth }),
        org({ id: '3', created_at: lastYear }),
      ]);

      expect(fixture.componentInstance.monthCount()).toBe(2);
    });
  });
});
