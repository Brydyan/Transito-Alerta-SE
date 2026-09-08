import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedComponent } from './feed.component';
import { IncidentService } from '../../../core/services/incident.service';
import { RouterTestingModule } from '@angular/router/testing';
import { of, BehaviorSubject } from 'rxjs';
import { Incident } from '../../../core/models/incident.model';
import { FeedFiltersComponent } from './components/feed-filters/feed-filters.component';
import { IncidentCardComponent } from './components/incident-card/incident-card.component';
import { IncidentCategoryService } from '../../catalogs/incident-categories/services/incident-category.service';
import { AuthService } from '../../../core/services/auth.service';
import { IncidentSocialService } from '../../../core/services/incident-social.service';

describe('FeedComponent', () => {
  let component: FeedComponent;
  let fixture: ComponentFixture<FeedComponent>;
  let incidentServiceMock: any;

  beforeEach(async () => {
    const incidentsSubject = new BehaviorSubject<Incident[]>([]);
    incidentServiceMock = {
      getIncidents$: jest.fn().mockReturnValue(incidentsSubject.asObservable()),
      getIncidents: jest.fn().mockReturnValue(of({ items: [], total: 0, page: 1, limit: 10 }))
    };

    const categoryServiceMock = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 }))
    };

    const authServiceMock = {
      currentUser: jest.fn().mockReturnValue({ id: 'user-1' })
    };

    const socialServiceMock = {};

    await TestBed.configureTestingModule({
      imports: [FeedComponent, RouterTestingModule],
      providers: [
        { provide: IncidentService, useValue: incidentServiceMock },
        { provide: IncidentCategoryService, useValue: categoryServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: IncidentSocialService, useValue: socialServiceMock }
      ]
    })
    .overrideComponent(FeedFiltersComponent, { set: { template: '<div>Filters</div>' } })
    .overrideComponent(IncidentCardComponent, { set: { template: '<div>Card</div>' } })
    .compileComponents();

    fixture = TestBed.createComponent(FeedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and set hasMore to false since backend does not paginate yet', () => {
    expect(component).toBeTruthy();
    expect(incidentServiceMock.getIncidents).toHaveBeenCalled();
    expect(component.hasMore).toBe(false); // End of feed state B.3.6
  });

  it('should reset hasMore and reload when filters change', () => {
    component.hasMore = false;
    component.onFilterChange({ status: 'pending' });
    expect(component.filters.status).toBe('pending');
    // It temporarily sets hasMore = true before loadIncidents() runs and sets it to false
    // But since getIncidents returns 'of', it finishes synchronously in the test
    expect(component.hasMore).toBe(false);
  });
});
