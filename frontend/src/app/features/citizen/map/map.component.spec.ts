import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MapComponent } from './map.component';
import { MapDataService } from './services/map-data.service';
import { GeoZoneService } from '../../catalogs/locations/services/geo-zone.service';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;
  
  const mockMapDataService = {
    getIncidentsFeed: jest.fn().mockReturnValue(of({ data: [] }).pipe(delay(0))),
    getMapFilters: jest.fn().mockReturnValue(of({ data: { categories: [] } }).pipe(delay(0)))
  };
  
  const mockGeoZoneService = {
    listAll: jest.fn().mockReturnValue(of([]).pipe(delay(0)))
  };

  const mockActivatedRoute = {
    snapshot: { paramMap: { get: () => '1' } }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        { provide: MapDataService, useValue: mockMapDataService },
        { provide: GeoZoneService, useValue: mockGeoZoneService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load incidents on init (afterViewInit)', fakeAsync(() => {
    fixture.detectChanges(); // calls ngOnInit and ngAfterViewInit
    tick(); // resolve async HTTP
    expect(mockMapDataService.getIncidentsFeed).toHaveBeenCalledWith({});
  }));

  it('should reload incidents when filters change', fakeAsync(() => {
    fixture.detectChanges();
    tick(); // initial load
    component.onFiltersChange({ status: 'pending' });
    tick(); // reload
    expect(component.activeFilters).toEqual({ status: 'pending' });
    expect(mockMapDataService.getIncidentsFeed).toHaveBeenCalledWith({ status: 'pending' });
  }));
});
