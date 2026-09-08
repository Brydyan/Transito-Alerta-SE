import { render, screen } from '@testing-library/angular';
import { OrganizationFormComponent } from './organization-form.component';
import { OrganizationService } from '../services/organization.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { GeoZoneService } from '../../locations/services/geo-zone.service';
import { IncidentCategoryService } from '../../incident-categories/services/incident-category.service';

describe('OrganizationFormComponent', () => {
  let mockOrganizationService: any;
  let mockZoneService: any;
  let mockCategoryService: any;
  let mockToastService: any;
  let mockDialogService: any;
  let mockActivatedRoute: any;
  let mockRouter: any;

  beforeEach(() => {
    mockOrganizationService = {
      create: jest.fn().mockReturnValue(of({ id: '1', name: 'Org 1' })),
      getById: jest.fn().mockReturnValue(of({ id: '1', name: 'Org 1' })),
      update: jest.fn().mockReturnValue(of({ id: '1', name: 'Org 1' })),
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      listAll: jest.fn().mockReturnValue(of([])),
      formData: jest.fn().mockReturnValue(of({ roles: [], geo_zones: [] })),
    };
    mockZoneService = {
      listAll: jest.fn().mockReturnValue(of([])),
    };
    mockCategoryService = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
    };
    mockToastService = {
      success: jest.fn(),
      error: jest.fn(),
    };
    mockDialogService = {
      confirm: jest.fn().mockReturnValue(of(true)),
    };
    mockActivatedRoute = {
      snapshot: { paramMap: { get: () => null } }, // default: create mode
    };
    mockRouter = {
      navigate: jest.fn(),
    };
  });

  it('blocks submission when form is invalid', async () => {
    const { fixture } = await render(OrganizationFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: GeoZoneService, useValue: mockZoneService },
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.onSubmit();

    expect(mockOrganizationService.create).not.toHaveBeenCalled();
    expect(form.form.invalid).toBe(true);
  });

  it('displays 422 server error mapped to a field', async () => {
    mockOrganizationService.create.mockReturnValue(
      throwError(() => ({
        status: 422,
        error: { errors: { name: 'Name must be unique' } },
      })),
    );

    const { fixture } = await render(OrganizationFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: GeoZoneService, useValue: mockZoneService },
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.form.patchValue({ name: 'Duplicate', max_active_claims: 1 });
    form.onSubmit();

    fixture.detectChanges();

    expect(form.serverErrors()['name']).toBe('Name must be unique');
    const errorMessage = screen.queryByText('Name must be unique');
    expect(errorMessage).toBeTruthy();
  });

  /**
   * F2.5.7 — el formulario mandaba sólo `name`, así que era imposible
   * asignarle una zona a una organización desde la UI, pese a que `zone_id`
   * es lo que dirige el ruteo de incidencias y el backend ya lo aceptaba.
   */
  describe('zone_id y parent_id', () => {
    const renderForm = () =>
      render(OrganizationFormComponent, {
        imports: [ReactiveFormsModule],
        providers: [
          { provide: OrganizationService, useValue: mockOrganizationService },
          { provide: GeoZoneService, useValue: mockZoneService },
          { provide: IncidentCategoryService, useValue: mockCategoryService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: ActivatedRoute, useValue: mockActivatedRoute },
          { provide: Router, useValue: mockRouter },
        ],
      });

    it('ofrece las zonas que devuelve form-data', async () => {
      mockOrganizationService.formData.mockReturnValue(
        of({
          roles: [],
          geo_zones: [
            { id: 'z-q', name: 'Quito' },
            { id: 'z-g', name: 'Guayaquil' },
          ],
        }),
      );

      const { fixture } = await renderForm();

      expect(fixture.componentInstance.zoneOptions()).toEqual([
        { id: 'z-q', name: 'Quito' },
        { id: 'z-g', name: 'Guayaquil' },
      ]);
    });

    it('manda zone_id y parent_id al crear', async () => {
      const { fixture } = await renderForm();
      const form = fixture.componentInstance;

      form.form.patchValue({
        name: 'GAD Quito – Zona Centro',
        zone_id: 'z-q',
        parent_id: 'org-quito',
      });
      form.onSubmit();

      expect(mockOrganizationService.create).toHaveBeenCalledWith({
        name: 'GAD Quito – Zona Centro',
        zone_id: 'z-q',
        parent_id: 'org-quito',
      });
    });

    it('traduce «sin selección» a null en vez de mandar cadena vacía', async () => {
      const { fixture } = await renderForm();
      const form = fixture.componentInstance;

      // El `<option value="">` de un select nativo entrega '', que el
      // backend rechazaría con 422 por no ser un UUID.
      form.form.patchValue({ name: 'Sin zona', zone_id: '', parent_id: '' });
      form.onSubmit();

      expect(mockOrganizationService.create).toHaveBeenCalledWith({
        name: 'Sin zona',
        zone_id: null,
        parent_id: null,
      });
    });

    it('excluye la propia organización de los padres posibles al editar', async () => {
      mockActivatedRoute.snapshot = { paramMap: { get: () => '1' } };
      mockOrganizationService.getById.mockReturnValue(
        of({ id: '1', name: 'Org 1', zone_id: 'z-q', parent_id: null }),
      );
      mockOrganizationService.listAll.mockReturnValue(
        of([
          { id: '1', name: 'Org 1' },
          { id: '2', name: 'Org 2' },
        ]),
      );

      const { fixture } = await renderForm();

      const parents = fixture.componentInstance.parentOptions();
      expect(parents.map((p: { id: string }) => p.id)).toEqual(['2']);
    });

    it('carga zone_id y parent_id existentes al editar', async () => {
      mockActivatedRoute.snapshot = { paramMap: { get: () => '1' } };
      mockOrganizationService.getById.mockReturnValue(
        of({ id: '1', name: 'Org 1', zone_id: 'z-q', parent_id: 'org-madre' }),
      );

      const { fixture } = await renderForm();

      expect(fixture.componentInstance.form.value.zone_id).toBe('z-q');
      expect(fixture.componentInstance.form.value.parent_id).toBe('org-madre');
    });
  });
});
