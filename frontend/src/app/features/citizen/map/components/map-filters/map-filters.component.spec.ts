import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MapFiltersComponent } from './map-filters.component';
import { MapDataService } from '../../services/map-data.service';
import { GeoZoneService } from '../../../../catalogs/locations/services/geo-zone.service';
import { IGeoZone } from '../../../../catalogs/locations/interfaces/igeo-zone.interface';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';

describe('MapFiltersComponent', () => {
  let component: MapFiltersComponent;
  let fixture: ComponentFixture<MapFiltersComponent>;

  const mockMapDataService = {
    getMapFilters: jest.fn().mockReturnValue(of({ data: { categories: [] } }).pipe(delay(0))),
  };

  const mockGeoZoneService = {
    list: jest.fn(),
  };

  const zona = (over: Partial<IGeoZone> & { id: string }): IGeoZone => ({
    name: `Zone ${over.id}`,
    code: null,
    level: 'provincia',
    parent_id: null,
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFiltersComponent],
      providers: [
        { provide: MapDataService, useValue: mockMapDataService },
        { provide: GeoZoneService, useValue: mockGeoZoneService },
      ],
    }).compileComponents();

    mockGeoZoneService.list.mockReturnValue(of({ items: [], total: 0 }));

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

  it('should fetch provincias on init (Phase 4)', fakeAsync(() => {
    mockGeoZoneService.list.mockReturnValue(
      of({
        items: [zona({ id: 'p1', level: 'provincia', name: 'Pichincha' })],
        total: 1,
      }).pipe(delay(0)),
    );

    fixture.detectChanges();
    tick();

    expect(mockGeoZoneService.list).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'provincia' }),
    );
    expect(component.provincias().length).toBe(1);
  }));

  it('should emit cleaned filters when form changes', () => {
    jest.spyOn(component.filtersChange, 'emit');
    component.form.patchValue({ status: 'pending', priority: '' });
    expect(component.filtersChange.emit).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('should toggle panel', () => {
    expect(component.isOpen()).toBe(false);
    component.togglePanel();
    expect(component.isOpen()).toBe(true);
  });

  // ── sc-334 Phase 4 — cascading zone filters (tasks 4.3–4.11) ────────

  describe('Cascading zone filters', () => {
    it('starts with canton and parroquia disabled', () => {
      fixture.detectChanges();
      expect(component.form.get('canton_id')!.disabled).toBe(true);
      expect(component.form.get('parroquia_id')!.disabled).toBe(true);
    });

    it('(4.3) selecting a provincia enables canton + calls GeoZoneService.list(level=canton, parent_id=provinciaId)', fakeAsync(() => {
      mockGeoZoneService.list
        .mockReturnValueOnce(
          of({ items: [zona({ id: 'p1', level: 'provincia' })], total: 1 }),
        )
        .mockReturnValueOnce(
          of({
            items: [zona({ id: 'c1', level: 'canton', parent_id: 'p1', name: 'Quito' })],
            total: 1,
          }),
        );

      fixture.detectChanges();
      tick();

      component.form.get('provincia_id')!.setValue('p1');
      tick();

      expect(component.form.get('canton_id')!.disabled).toBe(false);
      expect(mockGeoZoneService.list).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'canton', parent_id: 'p1' }),
      );
      expect(component.cantones().length).toBe(1);
    }));

    it('resetting provincia disables canton + clears cantones', fakeAsync(() => {
      mockGeoZoneService.list
        .mockReturnValueOnce(of({ items: [zona({ id: 'p1', level: 'provincia' })], total: 1 }))
        .mockReturnValueOnce(of({ items: [zona({ id: 'c1', level: 'canton', parent_id: 'p1' })], total: 1 }));

      fixture.detectChanges();
      tick();
      component.form.get('provincia_id')!.setValue('p1');
      tick();

      component.form.get('provincia_id')!.setValue('');
      tick();

      expect(component.form.get('canton_id')!.disabled).toBe(true);
      expect(component.cantones().length).toBe(0);
    }));

    it('(4.5) selecting a canton enables parroquia + calls GeoZoneService.list(level=parroquia, parent_id=cantonId)', fakeAsync(() => {
      mockGeoZoneService.list
        .mockReturnValueOnce(of({ items: [zona({ id: 'p1', level: 'provincia' })], total: 1 }))
        .mockReturnValueOnce(
          of({ items: [zona({ id: 'c1', level: 'canton', parent_id: 'p1' })], total: 1 }),
        )
        .mockReturnValueOnce(
          of({
            items: [zona({ id: 'pa1', level: 'parroquia', parent_id: 'c1', name: 'Cumbayá' })],
            total: 1,
          }),
        );

      fixture.detectChanges();
      tick();
      component.form.get('provincia_id')!.setValue('p1');
      tick();
      component.form.get('canton_id')!.setValue('c1');
      tick();

      expect(component.form.get('parroquia_id')!.disabled).toBe(false);
      expect(mockGeoZoneService.list).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'parroquia', parent_id: 'c1' }),
      );
      expect(component.parroquias().length).toBe(1);
    }));

    it('(4.9) emits zone_id = most-specific selection (parroquia > canton > provincia)', fakeAsync(() => {
      mockGeoZoneService.list.mockReturnValue(of({ items: [], total: 0 }));

      fixture.detectChanges();
      tick();

      const emitSpy = jest.spyOn(component.filtersChange, 'emit');

      // Only provincia
      component.form.get('provincia_id')!.setValue('p1');
      tick();
      expect(emitSpy).toHaveBeenLastCalledWith(expect.objectContaining({ zone_id: 'p1' }));

      // Add canton → canton wins over provincia
      component.form.get('canton_id')!.setValue('c1');
      tick();
      expect(emitSpy).toHaveBeenLastCalledWith(expect.objectContaining({ zone_id: 'c1' }));

      // Add parroquia → parroquia wins
      component.form.get('parroquia_id')!.setValue('pa1');
      tick();
      expect(emitSpy).toHaveBeenLastCalledWith(expect.objectContaining({ zone_id: 'pa1' }));
    }));

    it('(4.6) clearFilters resets all zone controls + re-disables downstream', fakeAsync(() => {
      mockGeoZoneService.list.mockReturnValue(of({ items: [], total: 0 }));

      fixture.detectChanges();
      tick();
      component.form.get('provincia_id')!.setValue('p1');
      tick();

      component.clearFilters();

      expect(component.form.get('provincia_id')!.value).toBe('');
      expect(component.form.get('canton_id')!.value).toBe('');
      expect(component.form.get('parroquia_id')!.value).toBe('');
      expect(component.form.get('canton_id')!.disabled).toBe(true);
      expect(component.form.get('parroquia_id')!.disabled).toBe(true);
    }));
  });
});
