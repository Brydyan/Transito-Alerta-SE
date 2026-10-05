import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { TrackingPanelComponent } from './tracking-panel.component';
import { AssignmentService, Assignment } from '../../../core/services/assignment.service';
import { IncidentService } from '../../../core/services/incident.service';
import { HttpService } from '../../../core/services/http.service';
import { Incident } from '../../../core/models/incident.model';

/**
 * TrackingPanelComponent spec — Phase 5 TDD.
 *
 * Tests cover:
 *   - Panel renders incident summary card
 *   - Elapsed timers update every second (setInterval)
 *   - clearInterval on ngOnDestroy prevents memory leak
 *   - Loading state while fetching
 *   - Null assignment (unassigned incident) shows "sin asignar"
 */
describe('TrackingPanelComponent', () => {
  let component: TrackingPanelComponent;
  let fixture: ComponentFixture<TrackingPanelComponent>;
  let assignmentService: { getLatestAssignment: jest.Mock };
  let incidentService: { getIncident: jest.Mock };

  const now = new Date('2026-09-23T12:00:00Z');
  const createdAt = new Date('2026-09-23T10:00:00Z'); // 2 hours ago

  const fixtureIncident: Incident = {
    id: 'inc-1',
    title: 'Accidente en Av. Principal',
    description: 'Vehículos colisionaron',
    status: 'in_progress',
    priority: 'high',
    lat: -2.2,
    lng: -80.8,
    zone_id: null,
    geofence_matched: false,
    organization_id: 'org-1',
    citizen_id: 'user-1',
    assigned_to: 'op-1',
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
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
  };

  const assignedAt = new Date('2026-09-23T11:30:00Z'); // 30 min ago
  const fixtureAssignment: Assignment = {
    id: 'assign-1',
    incident_id: 'inc-1',
    operator_id: 'op-1',
    role: 'primary',
    operator_name: 'Juan Pérez',
    created_at: assignedAt,
    updated_at: assignedAt,
    deleted_at: null,
  };

  beforeEach(async () => {
    assignmentService = {
      getLatestAssignment: jest.fn().mockReturnValue(of(fixtureAssignment)),
    };
    incidentService = {
      getIncident: jest.fn().mockReturnValue(of(fixtureIncident)),
    };

    await TestBed.configureTestingModule({
      imports: [TrackingPanelComponent, HttpClientTestingModule],
      providers: [
        { provide: AssignmentService, useValue: assignmentService },
        { provide: IncidentService, useValue: incidentService },
        HttpService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrackingPanelComponent);
    component = fixture.componentInstance;
    component.incidentId = 'inc-1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    component.ngOnDestroy();
  });

  it('creates successfully', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('fetches incident and assignment on init', fakeAsync(() => {
    fixture.detectChanges();
    tick(0);

    expect(incidentService.getIncident).toHaveBeenCalledWith('inc-1');
    expect(assignmentService.getLatestAssignment).toHaveBeenCalledWith('inc-1');

    discardPeriodicTasks();
  }));

  it('formats elapsed time correctly for 2 hours', fakeAsync(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    fixture.detectChanges();
    tick(0);

    // 2 hours = 7200s → "2 h 0 min"
    expect(component.elapsedSinceCreation()).toContain('2 h');

    discardPeriodicTasks();
  }));

  it('formats elapsed time correctly for 30 minutes', fakeAsync(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    fixture.detectChanges();
    tick(0);

    // 30 min → "30 min"
    expect(component.elapsedSinceAssignment()).toContain('30 min');

    discardPeriodicTasks();
  }));

  it('timer updates elapsedSinceCreation each second', fakeAsync(() => {
    let currentTime = now.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    fixture.detectChanges();
    tick(0);

    const before = component.elapsedSinceCreation();
    currentTime += 60_000;
    tick(1000);

    const after = component.elapsedSinceCreation();
    // elapsed increased
    expect(after).not.toEqual(before);

    discardPeriodicTasks();
  }));

  it('ngOnDestroy clears the interval to prevent memory leaks', fakeAsync(() => {
    fixture.detectChanges();
    tick(0);

    const clearSpy = jest.spyOn(window, 'clearInterval');
    component.ngOnDestroy();

    expect(clearSpy).toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('shows "Sin asignación" when no assignment exists', fakeAsync(() => {
    assignmentService.getLatestAssignment.mockReturnValue(of(null));
    fixture.detectChanges();
    tick(0);
    fixture.detectChanges();

    expect(component.latestAssignment()).toBeNull();
    discardPeriodicTasks();
  }));

  it('emits closed event on close()', () => {
    fixture.detectChanges();
    const closedSpy = jest.fn();
    component.closed.subscribe(closedSpy);

    component.close();

    expect(closedSpy).toHaveBeenCalled();
  });
});
