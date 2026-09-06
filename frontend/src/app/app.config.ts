import { ApplicationConfig, isDevMode, importProvidersFrom } from '@angular/core';
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
  FolderOpen,
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
  MapPin,
  LayoutDashboard,
  List,
  Map,
  CirclePlus,
  Building2,
  Tag,
} from 'lucide-angular';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { spinnerInterceptor } from './core/interceptors/spinner.interceptor';

// F0 — set curado de iconos Lucide registrados a nivel app.
// Las KEYS son el nombre que usan los consumidores (kebab-case, tal cual lo
// emiten el backend —`backend/src/modules/menus/menu-map.ts`— y los templates).
// OJO: LucideIconProvider matchea keys EXACTAS (`name in icons`, sin
// normalizar), por eso NO usar los PascalCase de lucide-angular como key:
// `name="alert-triangle"` jamás matchea `AlertTriangle`. Dos alias cubren
// nombres que el backend emite y que Lucide renombró: 'home' → House y
// 'plus-circle' → CirclePlus.
const LUCIDE_ICONS = {
  'alert-triangle': AlertTriangle,
  'clipboard-list': ClipboardList,
  'message-circle': MessageCircle,
  users: Users,
  shield: Shield,
  search: Search,
  x: X,
  'chevron-down': ChevronDown,
  bell: Bell,
  settings: Settings,
  moon: Moon,
  menu: Menu,
  'circle-dot': CircleDot,
  'alert-octagon': AlertOctagon,
  plus: Plus,
  'more-vertical': MoreVertical,
  'arrow-left': ArrowLeft,
  eye: Eye,
  camera: Camera,
  pencil: Pencil,
  'trash-2': Trash2,
  'log-out': LogOut,
  user: User,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  info: Info,
  'refresh-cw': RefreshCw,
  house: House,
  home: House, // alias: el backend emite 'home'; Lucide v1 lo renombró a 'house'
  calendar: Calendar,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  inbox: Inbox,
  'map-pin': MapPin,
  'folder-open': FolderOpen,
  'layout-dashboard': LayoutDashboard,
  list: List,
  map: Map,
  'plus-circle': CirclePlus, // alias: Lucide v1 lo renombró a 'circle-plus'
  'building-2': Building2,
  tag: Tag,
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
  ],
};
