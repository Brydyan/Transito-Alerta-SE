import { ApplicationConfig, isDevMode, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
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
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, spinnerInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    importProvidersFrom(LucideAngularModule.pick(LUCIDE_ICONS)),
  ],
};
