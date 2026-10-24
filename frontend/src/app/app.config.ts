import { ApplicationConfig, ErrorHandler, isDevMode, importProvidersFrom } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';
import { LUCIDE_ICONS } from './shared/icons/lucide-icons.registry';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { spinnerInterceptor } from './core/interceptors/spinner.interceptor';



export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, spinnerInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    importProvidersFrom(LucideAngularModule.pick(LUCIDE_ICONS)),

    // Reemplaza el ErrorHandler de Angular. Sin esto, Sentry sólo vería lo que
    // se le reporta a mano: toda excepción no capturada dentro de un
    // componente, un guard o un resolver moriría en la consola del navegador,
    // que en staging y producción no lee nadie.
    //
    // Si `environment.sentryDsn` está vacío, `Sentry.init` no corrió y este
    // handler es inerte — no rompe nada, simplemente no envía.
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
  ],
};
