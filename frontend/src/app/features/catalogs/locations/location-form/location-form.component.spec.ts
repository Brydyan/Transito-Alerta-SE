import { render, waitFor, screen, fireEvent } from '@testing-library/angular';
import { of, throwError, Subject } from 'rxjs';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { LocationFormComponent } from './location-form.component';
import { GeoZoneService } from '../services/geo-zone.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { IGeoZone } from '../interfaces/igeo-zone.interface';

/**
 * F2.5.5 — specs for Ubicaciones form (parent scoping, required-parent, 422).
 */
describe('LocationFormComponent', () => {
  let mockGeoZoneService: {
    listAll: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
    importShapefile: jest.Mock;
  };
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

  const setup = async (zones: IGeoZone[] = []) => {
    mockGeoZoneService.listAll.mockReturnValue(of(zones));
    return render(LocationFormComponent, {
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
      listAll: jest.fn(),
      create: jest.fn(),
      getById: jest.fn(),
      importShapefile: jest.fn(),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockActivatedRoute = { snapshot: { paramMap: { get: () => null } } };
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

  // ── sc-334 Phase 2: Inline shapefile importer (right panel — W2-reversal of dialog mount).

  const TEN_MB = 10 * 1024 * 1024;
  const makeZip = (size: number): File =>
    new File([new Blob([new ArrayBuffer(size)])], 'cantons.zip', {
      type: 'application/zip',
    });

  describe('Inline shapefile importer', () => {
    it('renders the inline panel when the user has CREATE geo-zones permission', async () => {
      await setup();
      const fileInput = screen.queryByLabelText(/archivo zip/i);
      expect(fileInput).not.toBeNull();
      expect(screen.queryByRole('button', { name: /importar shapefile/i })).not.toBeNull();
    });

    it('hides the inline panel when the user lacks CREATE geo-zones permission', async () => {
      mockAuthService.currentUser = () => ({
        permissions: ['READ geo-zones', 'UPDATE geo-zones', 'DELETE geo-zones'],
      });

      await setup();
      const fileInput = screen.queryByLabelText(/archivo zip/i);
      expect(fileInput).toBeNull();
      expect(screen.queryByRole('button', { name: /importar shapefile/i })).toBeNull();
    });

    it('rejects a non-zip file with an inline error and never POSTs', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      const notAZip = new File([new ArrayBuffer(1024)], 'data.csv', {
        type: 'text/csv',
      });
      Object.defineProperty(fileInput, 'files', { value: [notAZip] });
      fireEvent.change(fileInput);

      expect(component.importError()).toMatch(/zip/i);
      expect(component.importFile()).toBeNull();
      expect(mockGeoZoneService.importShapefile).not.toHaveBeenCalled();
    });

    it('rejects a file > 10 MB before POSTing', async () => {
      const { fixture } = await setup();
      const component = fixture.componentInstance;

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [makeZip(TEN_MB + 1)],
      });
      fireEvent.change(fileInput);

      expect(component.importError()).toMatch(/10\s*MB|excede/i);
      expect(component.importFile()).toBeNull();
      expect(mockGeoZoneService.importShapefile).not.toHaveBeenCalled();
    });

    it('POSTs the file using the form\'s current level + auto_parent + default NAME/CODE columns', async () => {
      const importSubject = new Subject<HttpEvent<unknown>>();
      mockGeoZoneService.importShapefile.mockReturnValue(
        importSubject.asObservable() as ReturnType<typeof mockGeoZoneService.importShapefile>,
      );

      const { fixture } = await setup();
      const component = fixture.componentInstance;
      component.form.patchValue({ level: 'canton' });

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [makeZip(2048)],
      });
      fireEvent.change(fileInput);

      const submit = screen.getByRole('button', { name: /importar shapefile/i });
      fireEvent.click(submit);

      expect(mockGeoZoneService.importShapefile).toHaveBeenCalledTimes(1);
      const [, params] = mockGeoZoneService.importShapefile.mock.calls[0];
      expect(params.level).toBe('canton');
      expect(params.auto_parent).toBe(true);
      expect(params.name_column).toBe('NAME');
      expect(params.code_column).toBe('CODE');
    });

    it('updates the progress signal from UploadProgress events', async () => {
      const importSubject = new Subject<HttpEvent<unknown>>();
      mockGeoZoneService.importShapefile.mockReturnValue(
        importSubject.asObservable() as ReturnType<typeof mockGeoZoneService.importShapefile>,
      );

      const { fixture } = await setup();
      const component = fixture.componentInstance;

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [makeZip(2048)],
      });
      fireEvent.change(fileInput);

      fireEvent.click(screen.getByRole('button', { name: /importar shapefile/i }));

      importSubject.next({
        type: HttpEventType.UploadProgress,
        loaded: 50,
        total: 100,
      });
      expect(component.importProgress()).toBe(50);
    });

    it('resets progress and stores the envelope on Response', async () => {
      const importSubject = new Subject<HttpEvent<unknown>>();
      mockGeoZoneService.importShapefile.mockReturnValue(
        importSubject.asObservable() as ReturnType<typeof mockGeoZoneService.importShapefile>,
      );

      const { fixture } = await setup();
      const component = fixture.componentInstance;

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [makeZip(2048)],
      });
      fireEvent.change(fileInput);
      fireEvent.click(screen.getByRole('button', { name: /importar shapefile/i }));

      importSubject.next({
        type: HttpEventType.UploadProgress,
        loaded: 50,
        total: 100,
      });
      importSubject.next({
        type: HttpEventType.Response,
        body: { imported: 3, skipped: 0, errors: [], warnings: [] },
        status: 200,
        statusText: 'OK',
        headers: {} as Record<string, string>,
        url: '/api/geo-zones/import',
      } as unknown as HttpEvent<unknown>);

      expect(component.importProgress()).toBe(0);
      expect(component.importResult()?.imported).toBe(3);
      expect(component.isImporting()).toBe(false);
      expect(component.importError()).toBeNull();
    });

    it('disables the submit button while uploading', async () => {
      const importSubject = new Subject<HttpEvent<unknown>>();
      mockGeoZoneService.importShapefile.mockReturnValue(
        importSubject.asObservable() as ReturnType<typeof mockGeoZoneService.importShapefile>,
      );

      await setup();

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [makeZip(2048)],
      });
      fireEvent.change(fileInput);

      const submit = screen.getByRole('button', { name: /importar shapefile/i });
      expect(submit.hasAttribute('disabled')).toBe(false);

      fireEvent.click(submit);
      // Re-query after the click because Angular may have re-rendered.
      const submitWhileUploading = screen.getByRole('button', { name: /importar shapefile/i });
      expect(submitWhileUploading.hasAttribute('disabled')).toBe(true);
    });

    it('honors the auto-parent toggle off (false)', async () => {
      const importSubject = new Subject<HttpEvent<unknown>>();
      mockGeoZoneService.importShapefile.mockReturnValue(
        importSubject.asObservable() as ReturnType<typeof mockGeoZoneService.importShapefile>,
      );

      const { fixture } = await setup();
      const component = fixture.componentInstance;

      // Toggle off
      const checkbox = screen.getByRole('checkbox', {
        name: /auto-detectar zona padre/i,
      }) as HTMLInputElement;
      fireEvent.change(checkbox, { target: { checked: false } });
      expect(component.importAutoParent()).toBe(false);

      const fileInput = screen.getByLabelText(/archivo zip/i) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [makeZip(2048)],
      });
      fireEvent.change(fileInput);

      fireEvent.click(screen.getByRole('button', { name: /importar shapefile/i }));

      const [, params] = mockGeoZoneService.importShapefile.mock.calls[0];
      expect(params.auto_parent).toBe(false);
    });
  });
});
