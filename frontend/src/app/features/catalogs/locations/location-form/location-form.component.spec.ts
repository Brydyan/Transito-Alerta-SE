import { render, screen, fireEvent, waitFor } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { LocationFormComponent } from './location-form.component';
import { GeoZoneService } from '../services/geo-zone.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { IGeoZone } from '../interfaces/igeo-zone.interface';

/**
 * F2.5.5 — specs for Ubicaciones form (parent scoping, required-parent, 422).
 */
describe('LocationFormComponent', () => {
  let mockGeoZoneService: { listAll: jest.Mock; create: jest.Mock; getById: jest.Mock };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockActivatedRoute: unknown;

  const zone = (over: Partial<IGeoZone> & { id: string }): IGeoZone => ({
    name: `Zone ${over.id}`,
    code: null,
    level: 'provincia',
    parent_id: null,
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  });

  const setup = async (zones: IGeoZone[] = []) => {
    mockGeoZoneService.listAll.mockReturnValue(of(zones));
    return render(LocationFormComponent, {
      providers: [
        { provide: GeoZoneService, useValue: mockGeoZoneService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });
  };

  beforeEach(() => {
    mockGeoZoneService = {
      listAll: jest.fn(),
      create: jest.fn(),
      getById: jest.fn(),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockActivatedRoute = { snapshot: { paramMap: { get: () => null } } };
  });

  it('filters parent options to immediate parent level', async () => {
    const { fixture } = await setup([
      zone({ id: 'p1', name: 'Provincia A', level: 'provincia' }),
      zone({ id: 'p2', name: 'Provincia B', level: 'provincia' }),
      zone({ id: 'c1', name: 'Cantón A', level: 'canton', parent_id: 'p1' }),
    ]);
    const component = fixture.componentInstance;
    
    // Set level to 'canton'
    component.form.patchValue({ level: 'canton' });
    fixture.detectChanges();

    const options = component.parentOptions();
    expect(options).toHaveLength(2); // Only provincias
    expect(options.every(o => o.level === 'provincia')).toBe(true);
  });

  it('validates parent_id as required for canton and parroquia', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    // Set level to 'canton' (parent required)
    component.form.patchValue({ level: 'canton', parent_id: '' });
    fixture.detectChanges();
    component.form.get('parent_id')!.markAsTouched(); // Ensure validation triggers
    fixture.detectChanges();

    expect(component.form.get('parent_id')!.valid).toBe(false);
    expect(component.form.get('parent_id')!.errors?.['required']).toBeTruthy();

    // Set level to 'provincia' (no parent)
    component.form.patchValue({ level: 'provincia' });
    fixture.detectChanges();

    expect(component.form.get('parent_id')!.valid).toBe(true);
  });

  it('maps 422 error from backend to field errors', async () => {
    const { fixture } = await setup();
    
    const mockError = {
      status: 422,
      error: {
        errors: {
          name: 'El nombre ya existe',
        },
      },
    };
    mockGeoZoneService.create.mockReturnValue(throwError(() => mockError));

    // Submit valid form
    fixture.componentInstance.form.patchValue({ name: 'Dup', level: 'provincia' });
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    await waitFor(() => {
        expect(fixture.componentInstance.serverErrors()).toEqual({ name: 'El nombre ya existe' });
    });
  });
});
