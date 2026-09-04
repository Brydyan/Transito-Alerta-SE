import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';

import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

/**
 * Sentry se inicializa ANTES de arrancar Angular: un error durante el
 * bootstrap —el peor momento posible, porque deja la app en blanco— tiene que
 * llegar igual.
 *
 * `@sentry/angular` ya estaba en `package.json` y no se usaba en ninguna
 * parte. Sin esto, un error del navegador sólo existe si alguien tiene la
 * consola abierta en ese instante; el `console.error` del `.catch()` de abajo
 * no lo lee nadie en staging ni en producción.
 *
 * Sin DSN no se inicializa, igual que el backend.
 */
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',

    // Sin PII por defecto: no se adjuntan IP ni datos del usuario salvo los
    // que el código ponga explícitamente en el scope.
    sendDefaultPii: false,

    /**
     * Las migas de pan de fetch/XHR incluyen cabeceras. `Authorization` lleva
     * el JWT, así que se recorta antes de salir del navegador.
     *
     * Es el mismo cuidado que ya se tiene en el shell del proyecto, donde el
     * token de Shortcut se lee del `.env` a una variable y nunca se imprime:
     * un secreto que llega a un tercero sigue siendo un secreto filtrado
     * aunque el tercero sea de confianza.
     */
    beforeBreadcrumb(breadcrumb) {
      const headers = (breadcrumb.data as { headers?: Record<string, unknown> } | undefined)
        ?.headers;
      if (headers) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'authorization') {
            headers[key] = '[recortado]';
          }
        }
      }
      return breadcrumb;
    },
  });
}

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  // Los dos: Sentry para que quede registrado sin nadie mirando, y la consola
  // para quien SÍ esté mirando. Un fallo de bootstrap deja la pantalla en
  // blanco, así que conviene que deje rastro por los dos lados.
  Sentry.captureException(err);
  console.error(err);
});
