import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { IncidentListComponent } from './incident-list.component';
import { IncidentService } from '../../../core/services/incident.service';
import { AuthService } from '../../../core/services/auth.service';
import { HttpService } from '../../../core/services/http.service';
import { Incident } from '../../../core/models/incident.model';

/**
 * IncidentListComponent — Assignment integration spec.
 *
 * Tests cover:
 *   - "Asignar" toolbar button visible when user has ASSIGN permission
 *   - "Asignar" toolbar button hidden when user lacks ASSIGN permission
 *   - dropdownOpenId signal set on row dropdown click
 *   - trackingPanelOpen signal toggled on "Seguimiento" action
 *   - assignment modal opened on "Asignar" action
 *   - modal state reset on close
 */
describe('IncidentListComponent — Assignment integration', () => {
  let component: IncidentListComponent;
  let fixture: ComponentFixture<IncidentListComponent>;
  let incidentService: { getIncidents: jest.Mock };
  let userSignal: ReturnType<typeof signal<{ permissions: string[] } | null>>;
  let authService: { user: typeof userSignal };

  const fixtureIncident: Incident = {
    id: 'inc-1',
    title: 'Test Incident',
    description: 'Test description',
    status: 'pending',
    priority: 'medium',
    lat: -2.2,
    lng: -80.8,
    zone_id: null,
    geofence_matched: false,
    organization_id: null,
    citizen_id: 'user-1',
    is_anonymous: false,
    assigned_to: null,
    category_id: null,
    claimed_by: null,
    claimed_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    closed_reason: null,
    resolution_date: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
    created_at: new Date('2026-09-23'),
    updated_at: new Date('2026-09-23'),
    deleted_at: null,
  };

  beforeEach(async () => {
    incidentService = {
      getIncidents: jest.fn().mockReturnValue(
        of({ items: [fixtureIncident], total: 1, page: 1, limit: 1 })
      ),
    };

    userSignal = signal<{ permissions: string[] } | null>({
      permissions: ['ASSIGN assignments', 'READ incidents'],
    });
    authService = { user: userSignal };

    await TestBed.configureTestingModule({
      imports: [IncidentListComponent, HttpClientTestingModule],
      providers: [
        { provide: IncidentService, useValue: incidentService },
        { provide: AuthService, useValue: authService },
        HttpService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: () => null } },
            queryParams: of({}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates successfully with assignment integration', () => {
    expect(component).toBeTruthy();
  });

  it('hasAssignPermission returns true for user with ASSIGN permission', () => {
    expect(component.hasAssignPermission()).toBe(true);
  });

  it('hasAssignPermission returns false for user without ASSIGN permission', async () => {
    userSignal.set({ permissions: ['READ incidents'] });
    expect(component.hasAssignPermission()).toBe(false);
  });

  it('openDropdown() sets dropdownOpenId to the given incidentId', () => {
    component.openDropdown('inc-1');
    expect(component.dropdownOpenId()).toBe('inc-1');
  });

  it('openDropdown() closes previously open dropdown before opening new', () => {
    component.openDropdown('inc-1');
    component.openDropdown('inc-2');
    expect(component.dropdownOpenId()).toBe('inc-2');
  });

  it('closeDropdown() resets dropdownOpenId to null', () => {
    component.openDropdown('inc-1');
    component.closeDropdown();
    expect(component.dropdownOpenId()).toBeNull();
  });

  it('openAssignmentModal() sets assignmentModalOpen to true', () => {
    component.openAssignmentModal();
    expect(component.assignmentModalOpen()).toBe(true);
  });

  it('openAssignmentModal(incidentId) sets preSelectedIncidentId', () => {
    component.openAssignmentModal('inc-1');
    expect(component.preSelectedIncidentId()).toBe('inc-1');
  });

  it('closeAssignmentModal() resets modal state', () => {
    component.openAssignmentModal('inc-1');
    component.closeAssignmentModal();
    expect(component.assignmentModalOpen()).toBe(false);
    expect(component.preSelectedIncidentId()).toBeNull();
  });

  it('openTracking() sets trackingPanelOpen and trackingIncidentId', () => {
    component.openTracking('inc-1');
    expect(component.trackingPanelOpen()).toBe(true);
    expect(component.trackingIncidentId()).toBe('inc-1');
  });

  it('closeTracking() resets tracking panel state', () => {
    component.openTracking('inc-1');
    component.closeTracking();
    expect(component.trackingPanelOpen()).toBe(false);
    expect(component.trackingIncidentId()).toBeNull();
  });
});
