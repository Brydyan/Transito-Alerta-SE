import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { GeoZoneService } from '../../catalogs/locations/services/geo-zone.service';
import { Incident } from '../../../core/models/incident.model';
import { MapFiltersComponent } from './components/map-filters/map-filters.component';
import { MapDataService } from './services/map-data.service';
import { Subscription } from 'rxjs';

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

  incidents: Incident[] = [];
  displayedCount = 0;
  isLoading = false;
  lastUpdated: Date | null = null;
  activeFilters: any = {};

  private sub = new Subscription();

  constructor(
    private mapDataService: MapDataService,
    private geoZoneService: GeoZoneService,
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
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
            const layer = L.geoJSON(z.polygon as any, {
              style: {
                color: '#3b82f6', // Tailwind blue-500
                weight: 2,
                opacity: 0.8,
                fillColor: '#3b82f6',
                fillOpacity: 0.1,
                dashArray: '3'
              },
              onEachFeature: (feature, layer) => {
                layer.on({
                  mouseover: (e) => {
                    const l = e.target as L.Path;
                    l.setStyle({ fillOpacity: 0.3, weight: 3 });
                  },
                  mouseout: (e) => {
                    const l = e.target as L.Path;
                    l.setStyle({ fillOpacity: 0.1, weight: 2 });
                  }
                });
              }
            });
            this.zoneLayerGroup.addLayer(layer);
          });
        },
        error: (err) => console.error('Error loading zones', err)
      })
    );
  }

  private loadIncidents() {
    this.isLoading = true;
    this.sub.add(
      this.mapDataService.getIncidentsFeed(this.activeFilters).subscribe({
        next: (res) => {
          this.incidents = res.data || [];
          this.updateIncidentMarkers();
          this.lastUpdated = new Date();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error loading incidents', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      })
    );
  }

  private updateIncidentMarkers() {
    this.markerClusterGroup.clearLayers();

    const markers = this.incidents
      .map(inc => {
        // Defensive parse: if the backend/driver returns GeoJSON as a string instead of an object, parse it.
        if (typeof inc.geom === 'string') {
          try {
            inc.geom = JSON.parse(inc.geom);
          } catch (e) {
            console.warn('Failed to parse geom string', inc.geom);
          }
        }
        return inc;
      })
      .filter(inc => (inc.geom && inc.geom.coordinates && inc.geom.coordinates.length === 2) || (inc.lat && inc.lng))
      .map(inc => {
        // GeoJSON is [lng, lat], Leaflet is [lat, lng]
        const lat = inc.geom?.coordinates ? inc.geom.coordinates[1] : (inc.lat || 0);
        const lng = inc.geom?.coordinates ? inc.geom.coordinates[0] : (inc.lng || 0);

        const marker = L.marker([lat, lng]);

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
    this.displayedCount = markers.length;
  }

  onFiltersChange(filters: any) {
    this.activeFilters = filters;
    this.loadIncidents();
  }
}
