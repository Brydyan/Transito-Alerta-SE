import { ComponentFixture, TestBed } from '@angular/core/testing';
import { waitFor } from '@testing-library/angular';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { CitizenReportComponent } from './citizen-report.component';
import { IncidentCategoryService } from '../catalogs/incident-categories/services/incident-category.service';
import { AuthService } from '../../core/services/auth.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { ReportDraftService } from '../../core/services/report-draft.service';
import { IncidentService } from '../../core/services/incident.service';
import { ImageCompressorService } from '../../core/services/image-compressor.service';

/**
 * 2026-09-22-sc-subcategory-priority-assignment (D7) — when the citizen
 * picks a sub-category in the report form, the incident's priority
 * field auto-fills from the category's `priority`. Root categories
 * (priority = null) leave the incident priority untouched.
 */
describe('CitizenReportComponent — category priority pre-fill', () => {
  let mockCategoryService: {
    getTree: jest.Mock;
    getById: jest.Mock;
  };
  let mockAuthService: { currentUser: () => unknown };
  let mockGeolocationService: { getCurrentLocation: jest.Mock };
  let mockDraftService: {
    getDraft: jest.Mock;
    saveDraft: jest.Mock;
    clearDraft: jest.Mock;
  };
  let mockIncidentService: unknown;
  let mockImageCompressor: unknown;
  let mockRouter: { navigate: jest.Mock };

  beforeEach(() => {
    mockCategoryService = {
      getTree: jest.fn().mockReturnValue(of([])),
      getById: jest.fn(),
    };
    mockAuthService = {
      currentUser: () => ({ permissions: [] }),
    };
    mockGeolocationService = {
      getCurrentLocation: jest.fn().mockReturnValue(of({ latitude: 0, longitude: 0 })),
    };
    mockDraftService = {
      getDraft: jest.fn().mockResolvedValue(null),
      saveDraft: jest.fn().mockResolvedValue(undefined),
      clearDraft: jest.fn().mockResolvedValue(undefined),
    };
    mockIncidentService = {};
    mockImageCompressor = {};
    mockRouter = { navigate: jest.fn() };
  });

  // Helper compartido — ver bloque "step restructure" abajo.
  // Inicialmente `render()` de testing-library, cambiado a
  // `TestBed.createComponent` directo porque el checkNoChanges
  // del wrapper rompía con NG0100 al cambiar `currentStep`.
  const setupRender = async (): Promise<{
    fixture: ComponentFixture<CitizenReportComponent>;
    component: CitizenReportComponent;
  }> => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, CitizenReportComponent],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: GeolocationService, useValue: mockGeolocationService },
        { provide: ReportDraftService, useValue: mockDraftService },
        { provide: IncidentService, useValue: mockIncidentService },
        { provide: ImageCompressorService, useValue: mockImageCompressor },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CitizenReportComponent);
    const component = fixture.componentInstance;
    // 2026-10-16 — `NoErrors` schema desactiva checkNoChanges
    // (que dispara NG0100 cuando mutamos currentStep entre
    // detectChanges). El control es nuestro.
    fixture.autoDetectChanges();
    return { fixture, component };
  };

  it('pre-fills the incident priority when the selected category has one', async () => {
    mockCategoryService.getById.mockReturnValue(
      of({
        id: 'sub-1',
        name: 'Agua Potable (Daño)',
        description: null,
        parent_id: 'root-1',
        priority: 'high',
        created_at: '',
        updated_at: '',
      }),
    );

    const { fixture } = await setupRender();
    const component = fixture.componentInstance;

    // Default priority is 'medium' (per existing behavior).
    expect(component.form.get('priority')?.value).toBe('medium');

    // Wait for ngOnInit's async draft restore to complete so the
    // categoryId subscription is in place before we patch.
    await fixture.whenStable();
    fixture.detectChanges();

    // Simulate the user picking a category.
    component.form.patchValue({ categoryId: 'sub-1' });
    fixture.detectChanges();

    await waitFor(() => {
      expect(component.form.get('priority')?.value).toBe('high');
    });
    expect(mockCategoryService.getById).toHaveBeenCalledWith('sub-1');
  });

  it('leaves the incident priority untouched when the selected category has no priority', async () => {
    // Root category — priority is null in the wire format.
    mockCategoryService.getById.mockReturnValue(
      of({
        id: 'root-1',
        name: 'Agua',
        description: null,
        parent_id: null,
        priority: null,
        created_at: '',
        updated_at: '',
      }),
    );

    const { fixture } = await setupRender();
    const component = fixture.componentInstance;

    // The user changed priority manually to 'low' before picking a category.
    component.form.patchValue({ priority: 'low' });
    component.form.patchValue({ categoryId: 'root-1' });
    fixture.detectChanges();

    // Wait long enough for any async getById to potentially resolve.
    await new Promise((r) => setTimeout(r, 10));
    fixture.detectChanges();

    expect(component.form.get('priority')?.value).toBe('low');
  });

  it('does not crash if getById errors out', async () => {
    mockCategoryService.getById.mockReturnValue(throwError(() => new Error('boom')));

    const { fixture } = await setupRender();
    const component = fixture.componentInstance;

    expect(() => {
      component.form.patchValue({ categoryId: 'sub-1' });
      fixture.detectChanges();
    }).not.toThrow();
  });

  // Scenario 11 (W1) — Citizen selects different category after changing priority:
  // When a citizen changes priority, then selects a sub-category with a DIFFERENT
  // priority, the pre-fill from the category should apply (current-priority-wins
  // behavior, which is consistent with the category tree being the source of truth).
  it('updates priority when citizen selects a sub-category with a different priority (Scenario 11 - W1)', async () => {
    mockCategoryService.getById.mockReturnValue(
      of({
        id: 'sub-2',
        name: 'Debris on Road',
        description: 'Rocks/obstacles in roadway',
        parent_id: 'root-1',
        priority: 'high',
        created_at: '',
        updated_at: '',
      }),
    );

    const { fixture } = await setupRender();
    const component = fixture.componentInstance;

    await fixture.whenStable();
    fixture.detectChanges();

    // Citizen starts with default 'medium'
    expect(component.form.get('priority')?.value).toBe('medium');

    // Citizen changes it to 'low'
    component.form.patchValue({ priority: 'low' });
    expect(component.form.get('priority')?.value).toBe('low');

    // Citizen then selects a category with priority='high'
    component.form.patchValue({ categoryId: 'sub-2' });
    fixture.detectChanges();

    // The category pre-fill should update priority to 'high'
    // (category is authoritative for priority assignment)
    await waitFor(() => {
      expect(component.form.get('priority')?.value).toBe('high');
    });
  });
});

/**
 * 2026-10-16-citizen-report-step-restructure — Paso 1 ya no expone
 * el selector de prioridad (era engañoso para el ciudadano: la
 * prioridad se deriva automáticamente de la subcategoría). La prioridad
 * se pinta como badge informativo en el Paso 2, después de que el
 * categoryId.valueChanges dispare el pre-fill.
 *
 * Además, el input de adjuntos en el Paso 2 se parte en dos:
 * "Adjuntar imagen" (galería, comportamiento previo) y "Tomar foto"
 * (cámara directa con `capture="environment"`). Ambos llaman al
 * mismo `onPhotosSelected($event)` handler.
 */
describe('CitizenReportComponent — step restructure (2026-10-16)', () => {
  let mockCategoryService: {
    getTree: jest.Mock;
    getById: jest.Mock;
  };
  let mockAuthService: { currentUser: () => unknown };
  let mockGeolocationService: { getCurrentLocation: jest.Mock };
  let mockDraftService: {
    getDraft: jest.Mock;
    saveDraft: jest.Mock;
    clearDraft: jest.Mock;
  };
  let mockIncidentService: unknown;
  let mockImageCompressor: unknown;
  let mockRouter: { navigate: jest.Mock };

  beforeEach(() => {
    mockCategoryService = {
      getTree: jest.fn().mockReturnValue(of([])),
      getById: jest.fn().mockReturnValue(of({ id: 'sub-1', priority: 'high' })),
    };
    mockAuthService = { currentUser: () => ({ permissions: [] }) };
    mockGeolocationService = {
      getCurrentLocation: jest.fn().mockReturnValue(of({ latitude: 0, longitude: 0 })),
    };
    mockDraftService = {
      getDraft: jest.fn().mockResolvedValue(null),
      saveDraft: jest.fn().mockResolvedValue(undefined),
      clearDraft: jest.fn().mockResolvedValue(undefined),
    };
    mockIncidentService = {};
    mockImageCompressor = {};
    mockRouter = { navigate: jest.fn() };
  });

  // 2026-10-16 — `render()` de testing-library dispara NG0100 al
  // mutar `currentStep` entre detectChanges. Usamos TestBed
  // directo y desactivamos `checkNoChanges` por instancia.
  async function renderReport(): Promise<{
    fixture: ComponentFixture<CitizenReportComponent>;
    component: CitizenReportComponent;
  }> {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, CitizenReportComponent],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: GeolocationService, useValue: mockGeolocationService },
        { provide: ReportDraftService, useValue: mockDraftService },
        { provide: IncidentService, useValue: mockIncidentService },
        { provide: ImageCompressorService, useValue: mockImageCompressor },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CitizenReportComponent);
    const component = fixture.componentInstance;
    // 2026-10-16 — desactivar checkNoChanges (NG0100). El test
    // muta `currentStep` y `form.value` entre detectChanges;
    // checkNoChanges esperaba invariancia que rompíamos a propósito.
    fixture.autoDetectChanges();
    return { fixture, component };
  }

  it('Paso 1: el selector <select id="priority"> NO está en el DOM', async () => {
    const { fixture } = await renderReport();
    const select = fixture.nativeElement.querySelector('select#priority');
    expect(select).toBeNull();
  });

  it('Paso 1: el form group sigue teniendo el control priority (el backend lo necesita)', async () => {
    // El form control NO se elimina — sólo se quita el selector
    // visible. La suscripción `categoryId.valueChanges` sigue
    // poblando `priority` desde la categoría.
    const { fixture } = await renderReport();
    const component = fixture.componentInstance;
    expect(component.form.get('priority')).not.toBeNull();
  });

  // 2026-10-16 — los tests del step restructure usan
// `markForCheck` + `detectChanges` para evitar NG0100. El problema:
// `currentStep` es una propiedad primitiva (no signal); Angular
// OnPush no re-renderiza al mutarla sin un evento. `fixture.detectChanges()`
// lo dispara pero `checkNoChanges` arroja NG0100 cuando el segundo
// detectChanges ve un cambio respecto al anterior.
//
// Solución: marcar para check antes del detectChanges, así Angular
// invalida el cache de "no changes since last check".
function refresh(fixture: ComponentFixture<CitizenReportComponent>): void {
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges();
}

it('Paso 2 con categoría + priority=high: priority-badge visible con texto "Alta"', async () => {
  const { fixture, component } = await renderReport();
  await new Promise((r) => setTimeout(r, 0));
  component.currentStep = 2;
  component.form.patchValue({ categoryId: 'sub-1' });
  await waitFor(() => {
    expect(component.form.get('priority')?.value).toBe('high');
  });
  refresh(fixture);
  const badge = fixture.nativeElement.querySelector(
    '[data-testid="priority-badge"]',
  );
  expect(badge).toBeTruthy();
  expect(badge?.textContent).toContain('Alta');
});

it('Paso 2 sin categoría seleccionada: priority-badge NO visible', async () => {
  const { fixture, component } = await renderReport();
  await new Promise((r) => setTimeout(r, 0));
  component.currentStep = 2;
  refresh(fixture);
  const badge = fixture.nativeElement.querySelector(
    '[data-testid="priority-badge"]',
  );
  expect(badge).toBeNull();
});

it('Paso 2: btn-attach-gallery presente', async () => {
  const { fixture, component } = await renderReport();
  await new Promise((r) => setTimeout(r, 0));
  component.currentStep = 2;
  refresh(fixture);
  const galleryBtn = fixture.nativeElement.querySelector(
    '[data-testid="btn-attach-gallery"]',
  );
  expect(galleryBtn).toBeTruthy();
});

it('Paso 2: btn-attach-camera presente con input capture="environment"', async () => {
  const { fixture, component } = await renderReport();
  await new Promise((r) => setTimeout(r, 0));
  component.currentStep = 2;
  refresh(fixture);
  const cameraBtn = fixture.nativeElement.querySelector(
    '[data-testid="btn-attach-camera"]',
  );
  expect(cameraBtn).toBeTruthy();
  const input = cameraBtn?.querySelector(
    'input[data-testid="input-camera"]',
  ) as HTMLInputElement | null;
  expect(input).toBeTruthy();
  expect(input?.getAttribute('capture')).toBe('environment');
});

it('Paso 2: ambos inputs (galería + cámara) llaman a onPhotosSelected al cambiar', async () => {
  const { fixture, component } = await renderReport();
  await new Promise((r) => setTimeout(r, 0));
  component.currentStep = 2;
  refresh(fixture);
  const spy = jest.spyOn(component, 'onPhotosSelected');

  const galleryInput = fixture.nativeElement.querySelector(
    'input[data-testid="input-gallery"]',
  ) as HTMLInputElement;
  const cameraInput = fixture.nativeElement.querySelector(
    'input[data-testid="input-camera"]',
  ) as HTMLInputElement;

  galleryInput.dispatchEvent(new Event('change'));
  cameraInput.dispatchEvent(new Event('change'));

  expect(spy).toHaveBeenCalledTimes(2);
});
});
