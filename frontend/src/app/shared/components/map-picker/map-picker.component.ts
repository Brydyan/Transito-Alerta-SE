import { Component, OnDestroy, ElementRef, Output, EventEmitter, Input, ViewChild, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-map-picker',
  template: `<div #mapContainer class="map-container" style="height: 400px; width: 100%;"></div>`,
  standalone: true
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  
  @Input() initialLocation?: { lat: number, lng: number } | null;
  @Output() locationSelected = new EventEmitter<{ lat: number, lng: number }>();

  private map: L.Map | undefined;
  private marker: L.Marker | undefined;

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    // Default center (e.g. city center)
    const center: [number, number] = this.initialLocation 
      ? [this.initialLocation.lat, this.initialLocation.lng] 
      : [-34.6037, -58.3816]; // Buenos Aires

    this.map = L.map(this.mapContainer.nativeElement).setView(center, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    if (this.initialLocation) {
      this.setMarker(this.initialLocation.lat, this.initialLocation.lng);
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setMarker(e.latlng.lat, e.latlng.lng);
      this.locationSelected.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
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
