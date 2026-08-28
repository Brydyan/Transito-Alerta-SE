import { Injectable, inject, signal } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';

export interface IBreadcrumb {
  label: string;
  url: string;
}

@Injectable({
  providedIn: 'root',
})
export class BreadcrumbService {
  private readonly router = inject(Router);

  readonly breadcrumbs = signal<IBreadcrumb[]>([]);

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      const crumbs = this.buildBreadcrumbs(this.router.routerState.root);
      this.breadcrumbs.set(crumbs);
    });
  }

  private buildBreadcrumbs(
    route: ActivatedRoute,
    url = '',
    breadcrumbs: IBreadcrumb[] = [],
  ): IBreadcrumb[] {
    const children = route.children;

    if (children.length === 0) {
      return breadcrumbs;
    }

    for (const child of children) {
      const segments = child.snapshot.url;

      if (segments.length === 0) {
        return this.buildBreadcrumbs(child, url, breadcrumbs);
      }

      const routeUrl = segments.map((s) => s.path).join('/');
      const currentUrl = `${url}/${routeUrl}`;
      const label = this.getLabel(child.snapshot.data, routeUrl);

      if (label) {
        breadcrumbs.push({ label, url: currentUrl });
      }

      return this.buildBreadcrumbs(child, currentUrl, breadcrumbs);
    }

    return breadcrumbs;
  }

  private getLabel(routeData: Record<string, unknown>, urlPart: string): string | null {
    if (routeData?.['breadcrumb']) {
      return routeData['breadcrumb'] as string;
    }

    // Si es un UUID o ID numérico, mostrar etiqueta genérica en lugar del valor técnico
    const isParam = /^[a-f\d-]{24,36}$/i.test(urlPart) || !isNaN(Number(urlPart));
    if (isParam) {
      return 'Detalle';
    }

    return null;
  }
}
