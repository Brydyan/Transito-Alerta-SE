import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapComponent, ZONE_STYLES } from './map.component';
import { MapDataService } from './services/map-data.service';
import { GeoZoneService } from '../../catalogs/locations/services/geo-zone.service';
import { IGeoZone } from '../../catalogs/locations/interfaces/igeo-zone.interface';
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
    listAll: jest.fn().mockReturnValue(of([]).pipe(delay(0))),
    list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
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

  describe('ZONE_STYLES palette (sc-334 D3)', () => {
    it('uses the four design palette colors per level', () => {
      expect(ZONE_STYLES.provincia.color).toBe('#6366f1');
      expect(ZONE_STYLES.canton.color).toBe('#0891b2');
      expect(ZONE_STYLES.parroquia.color).toBe('#059669');
      expect(ZONE_STYLES.zona.color).toBe('#d97706');
    });
  });

  function makeZone(over: Partial<IGeoZone> & { id: string }): IGeoZone {
    return {
      name: `Zone ${over.id}`,
      code: null,
      level: 'provincia',
      parent_id: null,
      active: true,
      created_at: '2026-09-01T00:00:00Z',
      polygon: { type: 'Polygon', coordinates: [[[-80, -2], [-79, -2], [-79, -1], [-80, -1], [-80, -2]]] },
      ...over,
    };
  }

  describe('renderZonePolygons (task 3.3)', () => {
    let geoJsonSpy: jest.SpyInstance;

    beforeEach(() => {
      geoJsonSpy = jest.spyOn(L, 'geoJSON').mockReturnValue({
        bindPopup: jest.fn(),
        options: {},
        on: jest.fn(),
        addLayer: jest.fn(),
      } as unknown as ReturnType<typeof L.geoJSON>);
    });

    afterEach(() => {
      geoJsonSpy.mockRestore();
    });

    it('creates one L.geoJSON layer per active zone, each with the correct stroke color from ZONE_STYLES', () => {
      const zones = [
        makeZone({ id: 'p1', name: 'Pichincha', level: 'provincia' }),
        makeZone({ id: 'c1', name: 'Quito', level: 'canton', parent_id: 'p1' }),
        makeZone({ id: 'pa1', name: 'Cumbayá', level: 'parroquia', parent_id: 'c1' }),
        makeZone({ id: 'z1', name: 'Tumbaco', level: 'zona', parent_id: 'pa1' }),
      ];

      const layers = component.renderZonePolygons(zones);

      expect(layers).toHaveLength(4);
      expect(geoJsonSpy).toHaveBeenCalledTimes(4);

      const calls = geoJsonSpy.mock.calls;
      const styles = calls.map((call) => {
        const opts = call[1] as { style?: () => { color?: string } };
        return opts.style!();
      });
      expect(styles[0].color).toBe(ZONE_STYLES.provincia.color);
      expect(styles[1].color).toBe(ZONE_STYLES.canton.color);
      expect(styles[2].color).toBe(ZONE_STYLES.parroquia.color);
      expect(styles[3].color).toBe(ZONE_STYLES.zona.color);
    });

    it('skips inactive zones and zones without a polygon', () => {
      const zones = [
        makeZone({ id: '1', level: 'provincia' }),
        makeZone({ id: '2', active: false }),
        makeZone({ id: '3', polygon: undefined }),
      ];

      const layers = component.renderZonePolygons(zones);

      expect(layers).toHaveLength(1);
      expect(geoJsonSpy).toHaveBeenCalledTimes(1);
    });

    it('defaults to interactive: false on the layer option so it does not block incident markers', () => {
      component.renderZonePolygons([makeZone({ id: 'p1' })]);
      const opts = geoJsonSpy.mock.calls[0][1] as { interactive?: boolean; bubblingMouseEvents?: boolean };
      expect(opts.interactive).toBe(false);
      expect(opts.bubblingMouseEvents).toBe(false);
    });
  });

  describe('bindPopup payload (task 3.6)', () => {
    it('binds a popup carrying name, code (or ---), level, and parent_name (or ---)', () => {
      const mockLayer = {
        bindPopup: jest.fn(),
        options: {} as { bubblingMouseEvents?: boolean },
        on: jest.fn(),
      };
      const geoJsonSpy = jest.spyOn(L, 'geoJSON').mockReturnValue(mockLayer as unknown as ReturnType<typeof L.geoJSON>);

      const zone = makeZone({
        id: 'c1',
        name: 'Daule',
        level: 'canton',
        code: 'EC-09-01',
        parent_name: 'Guayas',
        parent_id: 'p1',
      });

      component.renderZonePolygons([zone]);

      expect(mockLayer.bindPopup).toHaveBeenCalledTimes(1);
      const popupHtml = mockLayer.bindPopup.mock.calls[0][0] as string;
      expect(popupHtml).toContain('Daule');
      expect(popupHtml).toContain('EC-09-01');
      expect(popupHtml).toContain('canton');
      expect(popupHtml).toContain('Guayas');

      geoJsonSpy.mockRestore();
    });

    it('falls back to --- when code or parent_name is null', () => {
      const mockLayer = {
        bindPopup: jest.fn(),
        options: {} as { bubblingMouseEvents?: boolean },
        on: jest.fn(),
      };
      const geoJsonSpy = jest.spyOn(L, 'geoJSON').mockReturnValue(mockLayer as unknown as ReturnType<typeof L.geoJSON>);

      const zone = makeZone({
        id: 'p1',
        name: 'Pichincha',
        level: 'provincia',
        code: null,
        parent_name: null,
      });

      component.renderZonePolygons([zone]);

      const popupHtml = mockLayer.bindPopup.mock.calls[0][0] as string;
      expect(popupHtml.match(/---/g)?.length).toBeGreaterThanOrEqual(2);

      geoJsonSpy.mockRestore();
    });

    it('re-enables interactive + bubblingMouseEvents after bindPopup so the popup opens without blocking markers', () => {
      const mockLayer = {
        bindPopup: jest.fn(),
        options: {} as { bubblingMouseEvents?: boolean },
        on: jest.fn(),
      };
      const geoJsonSpy = jest.spyOn(L, 'geoJSON').mockReturnValue(mockLayer as unknown as ReturnType<typeof L.geoJSON>);

      component.renderZonePolygons([makeZone({ id: 'c1', level: 'canton' })]);

      expect(mockLayer.options.interactive).toBe(true);
      expect(mockLayer.options.bubblingMouseEvents).toBe(true);

      geoJsonSpy.mockRestore();
    });
  });

  // sc-334 debug-fix — polygon highlight + fitBounds behaviour
  describe('highlightZone (debug-fix polygon highlight)', () => {
    let setStyleSpyA: jest.Mock;
    let setStyleSpyB: jest.Mock;
    let fitBoundsSpy: jest.Mock;

    // Synthetic setup that bypasses `loadZones()`'s async subscribe —
    // we inject the layer-to-id / layer-to-level maps directly so the
    // tests stay synchronous and don't depend on a fakeAsync + tick.
    function injectZone(id: string, level: 'canton' | 'provincia' | 'parroquia' | 'zona') {
      const layer = {
        setStyle: jest.fn(),
        getBounds: jest.fn().mockReturnValue({
          isValid: () => true,
          pad: jest.fn(),
        }),
        bindPopup: jest.fn(),
        options: {},
        on: jest.fn(),
      };
      const cmp = component as unknown as {
        zoneLayerById: Map<string, typeof layer>;
        zoneLevelByLayer: WeakMap<object, string>;
        map: { fitBounds: jest.Mock };
      };
      cmp.zoneLayerById.set(id, layer);
      cmp.zoneLevelByLayer.set(layer, level);
      return layer.setStyle as jest.Mock;
    }

    beforeEach(() => {
      setStyleSpyA = injectZone('A', 'canton');
      setStyleSpyB = injectZone('B', 'canton');

      // Provide a fake map so fitBounds has somewhere to land AND ngOnDestroy's
      //  `this.map.remove()` call doesn't throw during teardown.
      fitBoundsSpy = jest.fn();
      (component as unknown as { map: { fitBounds: jest.Mock; remove: jest.Mock } }).map = {
        fitBounds: fitBoundsSpy,
        remove: jest.fn(),
      };
    });

    it('applies highlight style (level colour preserved) when a zone is selected', () => {
      component.highlightZone('A');

      const callArgs = setStyleSpyA.mock.calls.at(-1)?.[0];
      expect(callArgs).toBeDefined();
      // The highlight must KEEP the level colour (canton = #0891b2)
      expect(callArgs.color).toBe(ZONE_STYLES.canton.color);
      expect(callArgs.weight).toBeGreaterThan(ZONE_STYLES.canton.weight ?? 0);
      expect(callArgs.dashArray ?? '').toBe('');
      expect(setStyleSpyB).not.toHaveBeenCalled();
    });

    it('resets the previous highlighted zone to its level default when the selection changes', () => {
      // First selection: A
      component.highlightZone('A');
      expect(setStyleSpyA).toHaveBeenCalledTimes(1);

      // Second selection: B — A must be reset to default BEFORE B is
      // styled (in that order, so the visual transition doesn't flash).
      component.highlightZone('B');

      // A's last setStyle call must be the canton default.
      const lastA = setStyleSpyA.mock.calls.at(-1)?.[0];
      expect(lastA).toEqual(ZONE_STYLES.canton);

      // B's last setStyle call must be the highlight override on top of
      // the canton default.
      const lastB = setStyleSpyB.mock.calls.at(-1)?.[0];
      expect(lastB.color).toBe(ZONE_STYLES.canton.color);
      expect(lastB.weight).toBeGreaterThan(ZONE_STYLES.canton.weight ?? 0);
    });

    it('is a no-op when the selection is identical (no redundant fitBounds)', () => {
      component.highlightZone('A');
      fitBoundsSpy.mockClear();

      component.highlightZone('A');
      expect(fitBoundsSpy).not.toHaveBeenCalled();
      expect(setStyleSpyA).toHaveBeenCalledTimes(1); // unchanged
    });

    it('clears the highlight when zoneId is empty (no fitBounds)', () => {
      component.highlightZone('A');
      fitBoundsSpy.mockClear();

      component.highlightZone(undefined);

      // A's last setStyle call must be the default (reset to level).
      const lastA = setStyleSpyA.mock.calls.at(-1)?.[0];
      expect(lastA).toEqual(ZONE_STYLES.canton);
      expect(fitBoundsSpy).not.toHaveBeenCalled();
    });

    it('does nothing when the zone id is not in zoneLayerById', () => {
      component.highlightZone('nonexistent-id');
      expect(setStyleSpyA).not.toHaveBeenCalled();
      expect(setStyleSpyB).not.toHaveBeenCalled();
      expect(fitBoundsSpy).not.toHaveBeenCalled();
    });
  });
});
