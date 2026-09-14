import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Incident } from '../../../../../core/models/incident.model';
import { IncidentSocialService } from '../../../../../core/services/incident-social.service';
import { AuthService } from '../../../../../core/services/auth.service';

// FIX-02 — reverse-geocoding cache shared across card instances.
// Nominatim (OpenStreetMap) rate-limits aggressively; one HTTP call
// per unique (lat,lng) is enough. `reverseGeocodeCache` holds the
// resolved display name, `inFlightReverseGeocodes` dedupes concurrent
// requests for the same coordinates (two cards in the same zone share
// one fetches instead of two).
const reverseGeocodeCache = new Map<string, string>();
const inFlightReverseGeocodes = new Map<string, Promise<string | null>>();

function reverseGeocodeKey(lat: number, lng: number): string {
  // 5 decimals ≈ 1 m precision, enough for a street-level label.
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// Places in ascending administrative granularity. `parish` = parroquia
// (most specific, preferred), `county` = cantón, then the settlement
// fallbacks. Duplicates are removed so "Salinas, Salinas" becomes "Salinas".
const PLACE_KEYS = ['parish', 'city', 'town', 'village', 'county', 'municipality', 'state'] as const;

@Component({
  selector: 'app-incident-card',
  standalone: true,
  imports: [CommonModule],
  providers: [DatePipe],
  templateUrl: './incident-card.component.html',
  host: { class: 'block' }
})
export class IncidentCardComponent implements OnInit {
  @Input({ required: true }) incident!: Incident;
  locationName = signal<string | null>(null);

  private readonly router = inject(Router);

  constructor(
    private socialService: IncidentSocialService,
    public authService: AuthService,
    private datePipe: DatePipe
  ) {}

  goToDetail(): void {
    this.router.navigate(['/app/incidencias', this.incident.id]);
  }

  ngOnInit() {
    this.fetchLocationName();
  }

  private fetchLocationName() {
    // The paginated feed returns `geom.coordinates` ([lng, lat]) instead of
    // flat lat/lng; the zone map uses the same shape.
    const coords = this.getCoordinates();
    if (!coords) return;

    const key = reverseGeocodeKey(coords.lat, coords.lng);

    // 1. Already resolved for this coordinate → reuse, no HTTP.
    const cached = reverseGeocodeCache.get(key);
    if (cached) {
      this.locationName.set(cached);
      return;
    }

    // 2. Another card is already fetching this coordinate → share the
    //    in-flight request instead of starting a duplicate.
    const inFlight = inFlightReverseGeocodes.get(key);
    if (inFlight) {
      inFlight.then((name) => {
        if (name) this.locationName.set(name);
      });
      return;
    }

    // 3. First fetch for this coordinate.
    const request = window
      .fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&addressdetails=1`,
      )
      .then((res) => res.json())
      .then((data) => {
        const name = this.extractPlaceName(data);
        if (name) {
          reverseGeocodeCache.set(key, name);
          return name;
        }
        return null;
      })
      .catch(() => {
        // Fallback silently if nominatim fails/rate-limits; the header
        // still shows raw coordinates via `locationText` in the template.
        return null;
      });

    inFlightReverseGeocodes.set(key, request);
    request.finally(() => {
      inFlightReverseGeocodes.delete(key);
    });
    request.then((name) => {
      if (name) this.locationName.set(name);
    });
  }

  /** Coordinates from the GeoJSON point, falling back to flat lat/lng. */
  private getCoordinates(): { lat: number; lng: number } | null {
    const geom = this.incident.geom;
    if (
      geom &&
      typeof geom !== 'string' &&
      Array.isArray(geom.coordinates) &&
      geom.coordinates.length === 2
    ) {
      return { lat: geom.coordinates[1], lng: geom.coordinates[0] };
    }
    if (this.incident.lat && this.incident.lng) {
      return { lat: this.incident.lat, lng: this.incident.lng };
    }
    return null;
  }

  /**
   * Place label derived from Nominatim's `address` (admin levels) so we
   * never leak a street-level address. Prefers parish→county (cantón),
   * and always dedupes identical names.
   */
  private extractPlaceName(data: { address?: Record<string, string>; display_name?: string } | null): string | null {
    if (data?.address) {
      const parts = PLACE_KEYS
        .map((key) => data.address?.[key])
        .filter((value): value is string => !!value && value.length > 0);
      const unique = [...new Set(parts)];
      if (unique.length > 0) return unique.slice(0, 2).join(', ');
    }
    if (data?.display_name) {
      // Very coarse fallback (e.g. ocean/rural): first two comma fragments.
      const parts = data.display_name.split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length > 0) return parts.slice(0, 2).join(', ');
    }
    return null;
  }

  /** Text shown in the location slot: reverse name, else raw coordinates, else nothing. */
  get locationText(): string {
    if (this.locationName()) return this.locationName()!;
    const coords = this.getCoordinates();
    if (coords) return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    return '';
  }

  get isCorroborateDisabled(): boolean {
    const user = this.authService.currentUser();
    return this.incident.is_corroborated_by_me || (user != null && user.id === this.incident.citizen_id);
  }

  get relativeAge(): string {
    const diff = Date.now() - new Date(this.incident.created_at).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} días`;
  }

  get statusLabel(): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      in_progress: 'En Proceso',
      resolved: 'Resuelto',
      closed: 'Cerrado'
    };
    return labels[this.incident.status] || this.incident.status;
  }

  get priorityLabel(): string {
    const labels: Record<string, string> = {
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      critical: 'Crítica'
    };
    return labels[this.incident.priority] || this.incident.priority;
  }

  get shortId(): string {
    return this.incident.id.split('-')[0].toUpperCase();
  }

  toggleFollow() {
    const isFollowing = this.incident.is_followed_by_me;
    // B.3.3: Optimistic UI
    this.incident.is_followed_by_me = !isFollowing;
    this.incident.follower_count += isFollowing ? -1 : 1;

    if (isFollowing) {
      this.socialService.unfollow(this.incident.id).subscribe({
        error: () => {
          // Revert on error
          this.incident.is_followed_by_me = true;
          this.incident.follower_count += 1;
        }
      });
    } else {
      this.socialService.follow(this.incident.id).subscribe({
        error: () => {
          // Revert on error
          this.incident.is_followed_by_me = false;
          this.incident.follower_count -= 1;
        }
      });
    }
  }

  corroborate() {
    // B.3.4: No optimism for corroborate
    if (this.isCorroborateDisabled) return;
    
    this.socialService.corroborate(this.incident.id, null).subscribe({
      next: () => {
        this.incident.is_corroborated_by_me = true;
        this.incident.corroboration_count += 1;
      },
      error: (err) => {
        if (err.status === 409) {
          // Sync state on 409 Conflict (already corroborated)
          this.incident.is_corroborated_by_me = true;
        }
      }
    });
  }
}
