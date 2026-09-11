import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FeedComponent } from './feed.component';
import { IncidentService } from '../../../core/services/incident.service';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { Incident } from '../../../core/models/incident.model';
import { FeedFiltersComponent } from './components/feed-filters/feed-filters.component';
import { IncidentCardComponent } from './components/incident-card/incident-card.component';
import { IncidentCategoryService } from '../../catalogs/incident-categories/services/incident-category.service';
import { AuthService } from '../../../core/services/auth.service';
import { IncidentSocialService } from '../../../core/services/incident-social.service';

function makeIncident(id: string, title: string): Incident {
  return {
    id,
    title,
    description: 'desc',
    status: 'pending',
    priority: 'medium',
    lat: -2.2,
    lng: -80.8,
    zone_id: null,
    geofence_matched: false,
    organization_id: null,
    citizen_id: 'citizen-1',
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
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
    deleted_at: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
  };
}

describe('FeedComponent (paginated feed)', () => {
  let component: FeedComponent;
  let fixture: ComponentFixture<FeedComponent>;
  let incidentServiceMock: { getFeed: jest.Mock };

  const incident1 = makeIncident('inc-1', 'Pothole 1');
  const incident2 = makeIncident('inc-2', 'Pothole 2');

  beforeEach(async () => {
    Object.defineProperty(window, 'fetch', {
      value: jest.fn().mockResolvedValue({ json: () => Promise.resolve({ display_name: 'Test, Location' }) }),
      writable: true,
      configurable: true,
    });

    incidentServiceMock = {
      getFeed: jest.fn().mockReturnValue(of({ data: [incident1], meta: { page: 1, per_page: 10, total: 1, last_page: 1 } })),
    };

    const categoryServiceMock = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
    };

    const authServiceMock = {
      currentUser: jest.fn().mockReturnValue({ id: 'user-1' }),
    };

    const socialServiceMock = {};

    await TestBed.configureTestingModule({
      imports: [FeedComponent, RouterTestingModule],
      providers: [
        { provide: IncidentService, useValue: incidentServiceMock },
        { provide: IncidentCategoryService, useValue: categoryServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: IncidentSocialService, useValue: socialServiceMock },
      ],
    })
      .overrideComponent(FeedFiltersComponent, { set: { template: '<div>Filters</div>' } })
      .overrideComponent(IncidentCardComponent, { set: { template: '<div>Card</div>' } })
      .compileComponents();

    fixture = TestBed.createComponent(FeedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initial load renders incidents', () => {
    expect(component).toBeTruthy();
    expect(incidentServiceMock.getFeed).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 10 }));
    expect(component.incidents()).toHaveLength(1);
    expect(component.incidents()[0].id).toBe('inc-1');
    expect(component.hasMore()).toBe(false);
    expect(component.lastPage()).toBe(1);
    expect(component.page()).toBe(1);
    expect(component.isLoading()).toBe(false);
  });

  it('clicking "Cargar más incidencias" appends page 2 results', () => {
    // Arrange paginated mock: page 1 hasMore true, page 2 is last
    incidentServiceMock.getFeed.mockImplementation((filters: { page?: number }) => {
      if (filters.page === 2) {
        return of({ data: [incident2], meta: { page: 2, per_page: 10, total: 2, last_page: 2 } });
      }
      return of({ data: [incident1], meta: { page: 1, per_page: 10, total: 2, last_page: 2 } });
    });

    // Re-create component to get first page with last_page 2
    fixture.destroy();
    fixture = TestBed.createComponent(FeedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.incidents()).toHaveLength(1);
    expect(component.hasMore()).toBe(true);

    // Button should be present before clicking
    let button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Cargar más incidencias');

    // Click load more
    button!.click();
    fixture.detectChanges();

    expect(incidentServiceMock.getFeed).toHaveBeenCalledWith(expect.objectContaining({ page: 2, per_page: 10 }));
    expect(component.incidents()).toHaveLength(2);
    expect(component.incidents().map((i) => i.id)).toEqual(['inc-1', 'inc-2']);
    expect(component.page()).toBe(2);
    expect(component.lastPage()).toBe(2);
    expect(component.hasMore()).toBe(false);
  });

  it('after the last page, the button is NOT present and the end-of-feed text IS present', () => {
    // Single page last_page 1 -> hasMore false
    expect(component.hasMore()).toBe(false);
    fixture.detectChanges();
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(button).toBeNull();
    const endText: HTMLElement | null = fixture.nativeElement.querySelector('.text-gray-400');
    expect(endText).not.toBeNull();
    expect(endText?.textContent).toContain('Has visto todas las incidencias recientes');
  });

  it('filter change resets the list to page 1 (replaces, not appends)', fakeAsync(() => {
    expect(component.incidents()).toHaveLength(1);
    expect(component.incidents()[0].id).toBe('inc-1');

    const filteredIncident = makeIncident('inc-3', 'Filtered');
    incidentServiceMock.getFeed.mockReturnValue(of({ data: [filteredIncident], meta: { page: 1, per_page: 10, total: 1, last_page: 1 } }).pipe(delay(0)));

    component.onFilterChange({ status: 'pending' });
    tick();

    expect(incidentServiceMock.getFeed).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', page: 1, per_page: 10 }));
    expect(component.incidents()).toHaveLength(1);
    expect(component.incidents()[0].id).toBe('inc-3');
    expect(component.page()).toBe(1);
    expect(component.incidents()).not.toContainEqual(expect.objectContaining({ id: 'inc-1' }));
  }));

  it('keeps hasMore unchanged on error and clears isLoading', () => {
    incidentServiceMock.getFeed.mockReturnValue(throwError(() => new Error('network')));
    // Re-create to isolate
    fixture.destroy();
    fixture = TestBed.createComponent(FeedComponent);
    component = fixture.componentInstance;
    // hasMore initial true before load
    component.hasMore.set(true);
    component.isLoading.set(false);
    component.loadIncidents();
    expect(component.isLoading()).toBe(false);
    expect(component.hasMore()).toBe(true);
  });
});
