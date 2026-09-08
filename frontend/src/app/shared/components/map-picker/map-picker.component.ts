import { Component, OnDestroy, ElementRef, Output, EventEmitter, Input, ViewChild, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import { GeolocationService } from '../../../core/services/geolocation.service';

// Canonical Leaflet icon fix for Webpack/Angular
const iconRetinaUrl = 'assets/marker-icon-2x.png';
const iconUrl = 'assets/marker-icon.png';
const shadowUrl = 'assets/marker-shadow.png';
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
  selector: 'app-map-picker',
  template: `<div #mapContainer class="map-container z-0 absolute inset-0"></div>`,
  standalone: true
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  @Input() initialLocation?: { lat: number, lng: number } | null;
  @Output() locationSelected = new EventEmitter<{ lat: number, lng: number }>();

  private map: L.Map | undefined;
  private marker: L.Marker | undefined;

  constructor(private geolocationService: GeolocationService) {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    // Bounds for Santa Elena province, Ecuador
    const santaElenaBounds = L.latLngBounds(
      L.latLng(-2.5075, -81.0113), // SouthWest
      L.latLng(-1.6686, -80.1998)  // NorthEast
    );

    // Default fallback center (Santa Elena) if location is denied or pending
    const defaultCenter: [number, number] = [-2.1954, -80.5669]; 
    const center: [number, number] = this.initialLocation
      ? [this.initialLocation.lat, this.initialLocation.lng]
      : defaultCenter;

    this.map = L.map(this.mapContainer.nativeElement, {
      maxBounds: santaElenaBounds,
      maxBoundsViscosity: 1.0, // Hard bounce when trying to pan outside
      minZoom: 9 // Prevent zooming too far out where bounds aren't effective
    }).setView(center, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    if (this.initialLocation) {
      this.setMarker(this.initialLocation.lat, this.initialLocation.lng);
    } else {
      // Ask for geolocation to center the map (B.2.7)
      this.geolocationService.getCurrentLocation().subscribe({
        next: (coords) => {
          if (this.map) {
            // Smoothly fly to user location once permitted
            this.map.flyTo([coords.latitude, coords.longitude], 15);
          }
        },
        error: (err) => {
          // If denied, it just stays in Quito fallback silently
          console.warn('Geolocation denied or failed, staying at fallback location', err);
        }
      });
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setMarker(e.latlng.lat, e.latlng.lng);
      this.locationSelected.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Fix for Leaflet tiles rendering incorrectly when inside dynamic flex containers
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 100);
  }

  setMarker(lat: number, lng: number): void {
    if (!this.map) return;

    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng]).addTo(this.map);
    }

    // Smoothly pan to the new marker
    this.map.panTo([lat, lng]);
  }
}
