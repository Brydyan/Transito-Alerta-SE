import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IncidentService } from '../../../core/services/incident.service';
import { Incident, IncidentListFilters } from '../../../core/models/incident.model';
import { Subscription } from 'rxjs';
import { IncidentCardComponent } from './components/incident-card/incident-card.component';
import { FeedFiltersComponent } from './components/feed-filters/feed-filters.component';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, IncidentCardComponent, FeedFiltersComponent],
  templateUrl: './feed.component.html',
})
export class FeedComponent implements OnInit, OnDestroy {
  incidents: Incident[] = [];
  filters: IncidentListFilters = {};
  isLoading = false;
  hasMore = true;
  private sub = new Subscription();

  constructor(
    private incidentService: IncidentService,
    private router: Router
  ) {}

  ngOnInit() {
    this.sub.add(
      this.incidentService.getIncidents$().subscribe((items) => {
        this.incidents = items;
      })
    );
    this.loadIncidents();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  loadIncidents() {
    if (this.isLoading) return;
    this.isLoading = true;

    this.sub.add(
      this.incidentService.getIncidents(this.filters).subscribe({
        next: () => {
          // No pagination supported yet by backend so hasMore is false after load
          this.hasMore = false;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        }
      })
    );
  }

  onFilterChange(newFilters: IncidentListFilters) {
    this.filters = newFilters;
    this.hasMore = true;
    this.loadIncidents();
  }

  goToReport() {
    this.router.navigate(['/app/reportar']);
  }

  getDailyStats() {
    // Derived stats as instructed in B.3.8 since no endpoint exists yet
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newCount = 0;
    let resolvedCount = 0;

    for (const inc of this.incidents) {
      const created = new Date(inc.created_at);
      if (created >= today) newCount++;

      if (inc.status === 'resolved' || inc.status === 'closed') {
        const updated = new Date(inc.updated_at);
        if (updated >= today) resolvedCount++;
      }
    }
    return { newCount, resolvedCount };
  }
}
