import { Component, Input, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Incident } from '../../../../../core/models/incident.model';
import { IncidentSocialService } from '../../../../../core/services/incident-social.service';
import { AuthService } from '../../../../../core/services/auth.service';

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
  locationName: string | null = null;

  constructor(
    private socialService: IncidentSocialService,
    public authService: AuthService,
    private datePipe: DatePipe
  ) {}

  ngOnInit() {
    this.fetchLocationName();
  }

  private fetchLocationName() {
    const lat = this.incident.lat;
    const lng = this.incident.lng;
    if (!lat || !lng) return;

    window
      .fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      )
      .then((res) => res.json())
      .then(data => {
        if (data && data.display_name) {
          const parts = data.display_name.split(',');
          // Truncate to first two parts for a cleaner UI display
          this.locationName = parts.slice(0, 2).join(',').trim();
        }
      })
      .catch(() => {
        // Fallback silently if nominatim fails/rate-limits
      });
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
