import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MapFiltersComponent } from './map-filters.component';
import { MapDataService } from '../../services/map-data.service';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';

describe('MapFiltersComponent', () => {
  let component: MapFiltersComponent;
  let fixture: ComponentFixture<MapFiltersComponent>;
  
  const mockMapDataService = {
    getMapFilters: jest.fn().mockReturnValue(of({ data: { categories: [] } }).pipe(delay(0)))
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFiltersComponent],
      providers: [
        { provide: MapDataService, useValue: mockMapDataService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MapFiltersComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch categories on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(mockMapDataService.getMapFilters).toHaveBeenCalled();
  }));

  it('should emit cleaned filters when form changes', () => {
    jest.spyOn(component.filtersChange, 'emit');
    component.form.patchValue({ status: 'pending', priority: '' });
    expect(component.filtersChange.emit).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('should toggle panel', () => {
    expect(component.isOpen).toBe(false);
    component.togglePanel();
    expect(component.isOpen).toBe(true);
  });
});
