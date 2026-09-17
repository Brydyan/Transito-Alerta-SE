import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { GeoZoneService } from '../../catalogs/locations/services/geo-zone.service';
import { Incident, IncidentStatus } from '../../../core/models/incident.model';
import { MapFiltersComponent } from './components/map-filters/map-filters.component';
import { MapDataService, MapActiveFilters } from './services/map-data.service';
import {
  IGeoZone,
  IGeoJsonPolygon,
  IGeoJsonMultiPolygon,
  GeoZoneLevel,
} from '../../catalogs/locations/interfaces/igeo-zone.interface';
import { Subscription } from 'rxjs';

type GeoZonePolygon = IGeoJsonPolygon | IGeoJsonMultiPolygon;

/**
 * sc-334 D3 — color palette for the four zone levels.
 *
 * Chosen for colorblind accessibility and contrast on OSM tiles. Stroke +
 * fill are the same hue; opacity + dashArray differentiate the levels
 * visually so a canton never looks identical to a parroquia stacked
 * underneath it.
 *
 * Exported for unit tests in `map.component.spec.ts` — the test asserts
 * the stroke color per level, not the values, so an architect redesign
 * of the palette breaks the test loudly rather than silently.
 */
export const ZONE_STYLES: Record<GeoZoneLevel, L.PathOptions> = {
  provincia: { color: '#6366f1', weight: 2, opacity: 0.8, fillColor: '#6366f1', fillOpacity: 0.08, dashArray: '6 4' },
  canton:    { color: '#0891b2', weight: 2, opacity: 0.9, fillColor: '#0891b2', fillOpacity: 0.12 },
  parroquia: { color: '#059669', weight: 1.5, opacity: 0.9, fillColor: '#059669', fillOpacity: 0.15 },
  zona:      { color: '#d97706', weight: 1, opacity: 0.9, fillColor: '#d97706', fillOpacity: 0.10, dashArray: '2 3' },
};

// Canonical Leaflet icon fix for Webpack/Angular
const iconRetinaUrl = '/assets/marker-icon-2x.png';
const iconUrl = '/assets/marker-icon.png';
const shadowUrl = '/assets/marker-shadow.png';
const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, MapFiltersComponent],
  templateUrl: './map.component.html',
  host: { class: 'block h-full' }
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  private map!: L.Map;
  private markerClusterGroup!: L.MarkerClusterGroup;
  private zoneLayerGroup!: L.LayerGroup;

  incidents = signal<Incident[]>([]);
  displayedCount = signal(0);
  isLoading = signal(false);
  lastUpdated = signal<Date | null>(null);
  activeFilters: MapActiveFilters = {};

  private sub = new Subscription();

  constructor(
    private mapDataService: MapDataService,
    private geoZoneService: GeoZoneService,
    private router: Router,
    private zone: NgZone
  ) { }

  ngOnInit() {
    // We fetch initial incidents once the map is initialized
  }

  ngAfterViewInit() {
    this.initMap();
    setTimeout(() => {
      this.loadZones();
      this.loadIncidents();
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap() {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [-2.1954, -80.5669], // Santa Elena fallback
      zoom: 10,
      zoomControl: false // Move to bottom-right to not overlap filters
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // Create marker cluster group (Umbral recomendado: ~5.000 incidencias. Pasado ese límite
    // se recomienda implementar clustering o bounding box fetching directo desde el backend / PostGIS).
    this.markerClusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false
    });
    this.map.addLayer(this.markerClusterGroup);

    this.zoneLayerGroup = L.layerGroup().addTo(this.map);

    // Fix resize issues
    setTimeout(() => {
      this.map.invalidateSize();
    }, 100);
  }

  private loadZones() {
    this.sub.add(
      this.geoZoneService.listAll().subscribe({
        next: (zones) => {
          this.zoneLayerGroup.clearLayers();
          const layers = this.renderZonePolygons(zones);
          layers.forEach(l => this.zoneLayerGroup.addLayer(l));
        },
        error: (err) => console.error('Error loading zones:', err?.message ?? 'unknown')
      })
    );
  }

  /**
   * sc-334 D3 — public for testability. Returns one Leaflet layer per
   * active zone with a polygon, using the per-level palette and a
   * `bindPopup` payload that surfaces name + code + level + parent_name.
   *
   * Default `interactive: false` (spec R-): clicks must not block
   * incident markers. The popup binding re-enables interaction for the
   * bound layer so the popup can be opened.
   */
  renderZonePolygons(zones: IGeoZone[]): L.Layer[] {
    return zones
      .filter(z => z.active && z.polygon != null)
      .map(z => this.createZoneLayer(z));
  }

  private createZoneLayer(zone: IGeoZone): L.Layer {
    const layer = L.geoJSON(zone.polygon as GeoZonePolygon as unknown as Parameters<typeof L.geoJSON>[0], {
      style: () => ZONE_STYLES[zone.level],
      interactive: false,
      bubblingMouseEvents: false,
    });

    const popupHtml = `
      <div class="zone-popup">
        <div class="font-semibold text-slate-900">${this.escapeHtml(zone.name)}</div>
        <div class="text-xs text-slate-500 mt-1">
          <span>Código: <strong>${this.escapeHtml(zone.code ?? '---')}</strong></span><br>
          <span>Nivel: <strong>${zone.level}</strong></span><br>
          <span>Padre: <strong>${this.escapeHtml(zone.parent_name ?? '---')}</strong></span>
        </div>
      </div>
    `;
    layer.bindPopup(popupHtml);

    // Re-enable interaction now that the popup is bound — `interactive: false`
    // would block the click that opens the popup. `bubblingMouseEvents: true`
    // keeps incident markers underneath clickable.
    const opts = (layer as unknown as { options: L.PathOptions & { bubblingMouseEvents?: boolean } }).options;
    opts.interactive = true;
    opts.bubblingMouseEvents = true;

    return layer;
  }

  /** Minimal HTML escape for popup payloads — GeoJSON properties are
   *  admin-controlled but a malicious admin should still not get XSS
   *  via a zone name. */
  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private loadIncidents() {
    this.isLoading.set(true);
    this.sub.add(
      this.mapDataService.getIncidentsFeed(this.activeFilters).subscribe({
        next: (res) => {
          this.incidents.set(res.data || []);
          this.updateIncidentMarkers();
          this.lastUpdated.set(new Date());
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading incidents:', err?.message ?? 'unknown');
          this.isLoading.set(false);
        }
      })
    );
  }

  // FIX-05: parse geom WITHOUT mutating the Incident model. The backend may
  // return GeoJSON as a string; we only derive coordinates from it, leaving
  // `inc.geom` untouched for any other consumer.
  private parseGeom(inc: Incident): { type: string; coordinates: [number, number] } | null {
    if (typeof inc.geom === 'string') {
      try {
        const parsed = JSON.parse(inc.geom) as { type?: string; coordinates?: [number, number] };
        if (parsed && Array.isArray(parsed.coordinates) && parsed.coordinates.length === 2) {
          return {
            type: parsed.type || 'Point',
            coordinates: [parsed.coordinates[0], parsed.coordinates[1]]
          };
        }
      } catch {
        // Malformed string: fall through to the lat/lng fallback.
      }
      return null;
    }
    return inc.geom && inc.geom.coordinates ? inc.geom : null;
  }

  private getMarkerPosition(inc: Incident): [number, number] | null {
    const geom = this.parseGeom(inc);
    if (geom && geom.coordinates && geom.coordinates.length === 2) {
      return [geom.coordinates[1], geom.coordinates[0]]; // GeoJSON [lng,lat] → Leaflet [lat,lng]
    }
    if (inc.lat && inc.lng) {
      return [inc.lat, inc.lng];
    }
    return null;
  }

  private getMarkerIcon(status: IncidentStatus): L.DivIcon {
    const colors: Record<IncidentStatus, string> = {
      pending: '#eab308',
      in_progress: '#3b82f6',
      resolved: '#22c55e',
      closed: '#6b7280',
    };
    const color = colors[status] ?? '#6b7280';
    return L.divIcon({
      className: 'incident-marker',
      html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  private updateIncidentMarkers() {
    this.markerClusterGroup.clearLayers();

    const markers = this.incidents()
      .map(inc => ({ inc, position: this.getMarkerPosition(inc) }))
      .filter((entry): entry is { inc: Incident; position: [number, number] } => entry.position !== null)
      .map(({ inc, position }) => {
        const [lat, lng] = position;

        const marker = L.marker([lat, lng], { icon: this.getMarkerIcon(inc.status) });

        const statusColors: Record<string, string> = {
          pending: 'bg-yellow-100 text-yellow-800',
          in_progress: 'bg-blue-100 text-blue-800',
          resolved: 'bg-green-100 text-green-800',
          closed: 'bg-gray-100 text-gray-800'
        };
        const statusColor = statusColors[inc.status] || 'bg-gray-100 text-gray-800';
        const statusLabel = inc.status.replace('_', ' ').toUpperCase();

        const popupContent = `
        <div class="p-1 min-w-[200px]">
          <h3 class="font-bold text-gray-900 text-sm mb-2 line-clamp-2">${inc.title}</h3>
          <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${statusColor} mb-3">${statusLabel}</span>
          <div class="mt-2 text-right border-t border-gray-100 pt-2">
            <button class="text-blue-600 font-medium text-xs hover:underline detail-btn" data-id="${inc.id}">Ver detalle &rarr;</button>
          </div>
        </div>
      `;

        marker.bindPopup(popupContent);

        // We must handle the button click inside the popup using DOM events since it's injected HTML
        marker.on('popupopen', () => {
          const btn = document.querySelector(`.detail-btn[data-id="${inc.id}"]`);
          if (btn) {
            btn.addEventListener('click', () => {
              this.zone.run(() => {
                this.router.navigate(['/app/incidencias', inc.id]);
              });
            });
          }
        });

        return marker;
      });

    this.markerClusterGroup.addLayers(markers);
    this.displayedCount.set(markers.length);
  }

  onFiltersChange(filters: MapActiveFilters) {
    this.activeFilters = filters;
    this.loadIncidents();
  }
}
