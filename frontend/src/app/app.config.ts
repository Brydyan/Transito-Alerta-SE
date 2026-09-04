import { ApplicationConfig, ErrorHandler, isDevMode, importProvidersFrom } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';
import {
  AlertTriangle,
  ClipboardList,
  MessageCircle,
  Users,
  Shield,
  Search,
  X,
  ChevronDown,
  Bell,
  Settings,
  Moon,
  Menu,
  CircleDot,
  AlertOctagon,
  Plus,
  MoreVertical,
  ArrowLeft,
  Eye,
  Camera,
  Pencil,
  Trash2,
  LogOut,
  User,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  House,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from 'lucide-angular';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { spinnerInterceptor } from './core/interceptors/spinner.interceptor';

// F0 — set curado de iconos Lucide registrados a nivel app.
// Mantener este set alineado con los nombres emitidos por el backend
// (`backend/src/modules/menus/menu-map.ts`) y los iconos que ya dibuja el shell.
const LUCIDE_ICONS = {
  AlertTriangle,
  ClipboardList,
  MessageCircle,
  Users,
  Shield,
  Search,
  X,
  ChevronDown,
  Bell,
  Settings,
  Moon,
  Menu,
  CircleDot,
  AlertOctagon,
  Plus,
  MoreVertical,
  ArrowLeft,
  Eye,
  Camera,
  Pencil,
  Trash2,
  LogOut,
  User,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  House,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Inbox,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
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
