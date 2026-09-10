import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';

/**
 * F6 (`2026-09-08-f6-new-user-form`) — agrega logs visibles a consola
 * cuando el wildcard `**` lo monta. El objetivo: si el router no
 * matchea una ruta (caso típico: bundle viejo cacheado por un SW
 * activo, o una ruta escrita a mano que no existe), el developer
 * ve en la consola la URL que se intentó cargar + un dump del
 * `app.routes` para diagnosticar el mismatch.
 */
@Component({
  selector: 'app-error-page',
  imports: [RouterLink],
  templateUrl: './error-page.component.html',
  styleUrl: './error-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPageComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  errorCode = 404;
  errorTitle = 'Página no encontrada';
  errorDescription = 'La página que buscas no existe o fue movida.';
  attemptedUrl: string;

  constructor() {
    this.attemptedUrl = this.location.path() || window.location.pathname;
  }

  ngOnInit(): void {
    const state = history.state as { errorCode?: number };

    if (state?.errorCode === 500) {
      this.errorCode = 500;
      this.errorTitle = 'Servidor en mantenimiento';
      this.errorDescription =
        'Estamos teniendo problemas técnicos. Por favor, intenta de nuevo más tarde.';
    }

    // F6 (debug) — imprime a consola la URL intentada y un dump
    // recursivo de las rutas configuradas. El primer dump (v1)
    // sólo aplanaba 1 nivel y ocultaba rutas anidadas como
    // `app > admin > users > new`. Esta versión recorre el árbol
    // completo para que cualquier ruta que matchee sea visible.
    // eslint-disable-next-line no-console
    console.error(
      '[ErrorPage] No route matched. URL intentada:',
      this.attemptedUrl,
      '\nRutas configuradas (recursivo):',
      JSON.stringify(this.dumpRoutes(this.router.config), null, 2),
    );
  }

  private dumpRoutes(routes: ReadonlyArray<unknown>, depth = 0): unknown[] {
    return (routes as Array<Record<string, unknown>>).map((r) => {
      const out: Record<string, unknown> = {};
      if (r['path'] !== undefined) out['path'] = r['path'];
      if (r['redirectTo'] !== undefined) out['redirectTo'] = r['redirectTo'];
      if (r['canActivate'] !== undefined) {
        out['canActivate'] = (r['canActivate'] as unknown[]).map((g) => {
          // canActivate puede ser un array de funciones o un array
          // de strings (DI tokens). Mostrar el nombre si está
          // disponible.
          return typeof g === 'function' ? g.name || '(anon)' : String(g);
        });
      }
      if (r['children'] !== undefined) {
        out['children'] = this.dumpRoutes(
          r['children'] as ReadonlyArray<unknown>,
          depth + 1,
        );
      }
      // Para el path `app > admin > users > new` (la ruta que
      // bugueaba): si NO se ve en el dump, el router no la tiene
      // registrada — eso es la confirmación del bug.
      return out;
    });
  }
}
