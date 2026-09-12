import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { GeoZoneService } from '../../catalogs/locations/services/geo-zone.service';
import { Incident, IncidentStatus } from '../../../core/models/incident.model';
import { MapFiltersComponent } from './components/map-filters/map-filters.component';
import { MapDataService, MapActiveFilters } from './services/map-data.service';
import { IGeoJsonPolygon, IGeoJsonMultiPolygon } from '../../catalogs/locations/interfaces/igeo-zone.interface';
import { Subscription } from 'rxjs';

type GeoZonePolygon = IGeoJsonPolygon | IGeoJsonMultiPolygon;

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

          const activeZones = zones.filter(z => z.active && z.polygon);
          activeZones.forEach(z => {
            const layer = L.geoJSON(z.polygon as GeoZonePolygon as unknown as Parameters<typeof L.geoJSON>[0], {
              style: () => ({
                color: '#3b82f6',
                weight: 2,
                opacity: 0.8,
                fillColor: '#3b82f6',
                fillOpacity: 0.1,
                dashArray: '3'
              }),
              onEachFeature: (feature, layer) => {
                layer.on({
                  mouseover: (e) => {
                    const l = e.target as L.Path;
                    l.setStyle({ fillOpacity: 0.3, weight: 3 });
                  },
                  mouseout: (e) => {
                    const l = e.target as L.Path;
                    const geoJsonLayer = layer as unknown as L.GeoJSON;
                    if (geoJsonLayer.resetStyle) {
                      geoJsonLayer.resetStyle(e.target);
                    } else {
                      l.setStyle({ fillOpacity: 0.1, weight: 2 });
                    }
                  }
                });
              }
            });
            this.zoneLayerGroup.addLayer(layer);
          });
        },
        error: (err) => console.error('Error loading zones:', err?.message ?? 'unknown')
      })
    );
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
