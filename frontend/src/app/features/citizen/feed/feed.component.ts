import { Component, OnInit, OnDestroy, signal } from '@angular/core';
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
  incidents = signal<Incident[]>([]);
  filters: IncidentListFilters = {};
  isLoading = signal(false);
  hasMore = signal(true);
  page = signal(1);
  perPage = 10;
  lastPage = signal(0);
  /** FIX-10: memoized derived stats, invalidated whenever `incidents` is reassigned. */
  private dailyStatsCache: { newCount: number; resolvedCount: number } | null = null;
  private sub = new Subscription();

  constructor(
    private incidentService: IncidentService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadIncidents();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  loadIncidents(reset = false) {
    if (this.isLoading()) return;
    if (reset) {
      this.incidents.set([]);
      this.page.set(1);
      this.lastPage.set(0);
      this.dailyStatsCache = null;
    }
    this.isLoading.set(true);
    const requestPage = reset ? 1 : (this.incidents().length === 0 ? this.page() : this.page() + 1);

    this.sub.add(
      this.incidentService.getFeed({ ...this.filters, page: requestPage, per_page: this.perPage }).subscribe({
        next: (res) => {
          this.incidents.set(reset ? res.data : [...this.incidents(), ...res.data]);
          this.dailyStatsCache = null;
          this.hasMore.set(res.meta.page < res.meta.last_page);
          this.lastPage.set(res.meta.last_page);
          this.page.set(res.meta.page);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      })
    );
  }

  onFilterChange(newFilters: IncidentListFilters) {
    this.filters = newFilters;
    this.loadIncidents(true);
  }

  goToReport() {
    this.router.navigate(['/app/reportar']);
  }

  getDailyStats() {
    // Derived stats as instructed in B.3.8 since no endpoint exists yet.
    // FIX-10: memoized — the template calls this getter twice per CD cycle,
    // so returning the last computed value avoids O(n) recomputation.
    if (this.dailyStatsCache) {
      return this.dailyStatsCache;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newCount = 0;
    let resolvedCount = 0;

    for (const inc of this.incidents()) {
      const created = new Date(inc.created_at);
      if (created >= today) newCount++;

      if (inc.status === 'resolved' || inc.status === 'closed') {
        const updated = new Date(inc.updated_at);
        if (updated >= today) resolvedCount++;
      }
    }
    this.dailyStatsCache = { newCount, resolvedCount };
    return this.dailyStatsCache;
  }
}
