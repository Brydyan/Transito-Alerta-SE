import { render, screen, waitFor } from '@testing-library/angular';
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

  async function renderReport() {
    return render(CitizenReportComponent, {
      imports: [ReactiveFormsModule],
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
    });
  }

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

    const { fixture } = await renderReport();
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

    const { fixture } = await renderReport();
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

    const { fixture } = await renderReport();
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

    const { fixture } = await renderReport();
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
