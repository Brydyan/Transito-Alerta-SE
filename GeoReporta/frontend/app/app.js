import { router } from './core/router.js';
import { appShell } from './app-shell/app-shell.component.js';

import loginComponent from './auth/pages/login/login.component.js';
import acceptInviteComponent from './invitations/pages/accept-invite/accept-invite.component.js';
import dashboardComponent from './dashboard/pages/dashboard/dashboard.component.js';
import operatorDashboardComponent from './dashboard/pages/operator-dashboard/operator-dashboard.component.js';
import incidenciasIndexComponent from './incidencias/pages/index/incidencias.index.component.js';
import incidenciaFormComponent from './incidencias/pages/form/incidencias.form.component.js';
import incidenciasDetailComponent from './incidencias/pages/detail/incidencias.detail.component.js';
import notFoundComponent from './shared/not-found/not-found.component.js';
import { authGuard } from './auth/auth.guard.js';
import { permissionGuard } from './auth/permission.guard.js';
import { auth } from './auth/auth.service.js';

import forgotPasswordComponent from './auth/pages/forgot-password/forgot-password.component.js';
import resetPasswordComponent from './auth/pages/reset-password/reset-password.component.js';
import verifyEmailComponent from './auth/pages/verify-email/verify-email.component.js';
import organizacionesComponent from './configuracion/organizaciones/pages/index/organizaciones.index.component.js';
import organizacionesFormComponent from './configuracion/organizaciones/pages/form/organizaciones.form.component.js';
import localizacionesComponent from './configuracion/localizaciones/pages/index/localizaciones.index.component.js';
import localizacionesFormComponent from './configuracion/localizaciones/pages/form/localizaciones.form.component.js';
import categoriasComponent from './configuracion/categorias/pages/index/categorias.index.component.js';
import categoriasFormComponent from './configuracion/categorias/pages/form/categorias.form.component.js';
import usuariosComponent from './configuracion/usuarios/pages/index/usuarios.index.component.js';
import usuariosFormComponent from './configuracion/usuarios/pages/form/usuarios.form.component.js';
import perfilComponent from './configuracion/perfil/perfil.component.js';
import feedComponent from './feed/feed.component.js';
import feedDetailComponent from './feed/pages/detail/feed-detail.component.js';
import mapaComponent from './mapa/mapa.component.js';
import rolesIndexComponent from './configuracion/roles/pages/index/roles.index.component.js';
import rolesDetailComponent from './configuracion/roles/pages/detail/roles.detail.component.js';
import notificacionesIndexComponent from './notificaciones/pages/index/notificaciones-index.component.js';

// ─── Register shell (single, unified) ───────────────────────────────
// Only the unified 'app' shell exists post-consolidar-layout-unico.
router.setShell(appShell);

// ─── Public routes (no shell) ───────────────────────────────────────
// Routes WITHOUT a role tag are full-page (rendered into #auth-outlet).
// Routes WITH a role tag (admin/citizen/both) are mounted into the shell
// and the role is passed to the component's onInit({ role, params, query }).
router.addRoute('/login', loginComponent);
router.addRoute('/forgot-password', forgotPasswordComponent);
router.addRoute('/reset-password', resetPasswordComponent);
router.addRoute('/verify-email', verifyEmailComponent);
router.addRoute('/accept-invite', acceptInviteComponent);

// ─── Citizen routes (authGuard only) ────────────────────────────────
router.addRoute('/feed', feedComponent, [authGuard], 'citizen');
router.addRoute('/feed/crear', incidenciaFormComponent, [authGuard], 'citizen');
router.addRoute('/feed/:id', feedDetailComponent, [authGuard], 'citizen');

// /perfil is reachable from both admin and citizen roles (T-3.1)
router.addRoute('/configuracion/perfil', perfilComponent, [authGuard], 'both');

// ─── Admin routes ───────────────────────────────────────────────────
// All admin routes now go through permissionGuard, which sources
// authorization from menuService.getMyMenu() for routes with their own
// menu entry, plus a small explicit permission map (see
// permission.guard.js's CHILD_ROUTE_PERMISSIONS) for child routes that
// don't — detail pages, "crear" sub-routes. Previously these routes had
// `guards: []` (no enforcement) or `[roleGuard(['admin_sistema'])]`
// (hardcoded role name); the guard replaces roleGuard on /roles too —
// /roles/:id is gated by roles.update, which only admin_sistema holds.
router.addRoute('/dashboard', dashboardComponent, [permissionGuard], 'admin');
router.addRoute(
  '/operator/dashboard',
  operatorDashboardComponent,
  [permissionGuard],
  'both',
);
router.addRoute(
  '/incidencias',
  incidenciasIndexComponent,
  [permissionGuard],
  'admin',
);
router.addRoute(
  '/incidencias/crear',
  incidenciaFormComponent,
  [permissionGuard],
  'admin',
);
router.addRoute(
  '/incidencias/:id',
  incidenciasDetailComponent,
  [permissionGuard],
  'admin',
);
// Single "Mapa" route for every role — FeedController branches server-side
// by role now (see backend/app/Domains/Incidents/Http/FeedController.php).
// permissionGuard covers both staff (incidents.view) and citizen (feed.view)
// since MenuSeeder's menu_id 19 grants on either permission.
router.addRoute('/mapa', mapaComponent, [permissionGuard], 'admin');
router.addRoute('/usuarios', usuariosComponent, [permissionGuard], 'admin');
router.addRoute(
  '/usuarios/crear',
  usuariosFormComponent,
  [permissionGuard],
  'admin',
);
router.addRoute(
  '/organizaciones',
  organizacionesComponent,
  [permissionGuard],
  'admin',
);
router.addRoute(
  '/organizaciones/crear',
  organizacionesFormComponent,
  [permissionGuard],
  'admin',
);
router.addRoute(
  '/localizaciones',
  localizacionesComponent,
  [permissionGuard],
  'admin',
);
router.addRoute(
  '/localizaciones/crear',
  localizacionesFormComponent,
  [permissionGuard],
  'admin',
);
router.addRoute('/categorias', categoriasComponent, [permissionGuard], 'admin');
router.addRoute(
  '/categorias/crear',
  categoriasFormComponent,
  [permissionGuard],
  'admin',
);
router.addRoute('/roles', rolesIndexComponent, [permissionGuard], 'admin');
router.addRoute('/roles/:id', rolesDetailComponent, [permissionGuard], 'admin');
router.addRoute(
  '/notificaciones',
  notificacionesIndexComponent,
  [permissionGuard],
  'admin',
);
router.addRoute('/not-found', notFoundComponent, [authGuard], 'both');

// ─── Global listeners (cleaned up if app is ever re-booted in tests) ──
// AbortController: every listener is registered with the controller's signal,
// so a single .abort() detaches all of them. The app module is loaded once
// per page load, so this controller lives for the lifetime of the page.
const appAbort = new AbortController();

document.addEventListener(
  'change',
  (e) => {
    // "Select all" checkbox in admin tables — flips every row in the same
    // table. Kept here (not in a component) because the event delegates from
    // the document; only one handler is needed for the whole app.
    if (e.target.classList.contains('check-select-all')) {
      const table = e.target.closest('table');
      if (table) {
        table.querySelectorAll('.check-row').forEach((cb) => {
          cb.checked = e.target.checked;
        });
      }
    }
  },
  { signal: appAbort.signal },
);

document.addEventListener(
  'auth:expired',
  () => {
    // Dispatched by http.service.js after a refresh-token rotation fails
    // (http 401 on /auth/refresh). The service has already cleared the
    // access token + session id; we just need to send the user to /login.
    // Using hash navigation (instead of `window.location.assign`) keeps
    // the SPA's router in charge of the transition and avoids triggering
    // a full-page reload.
    const target = '#/login';
    if (window.location.hash !== target) {
      window.location.hash = '/login';
    }
  },
  { signal: appAbort.signal },
);

// ─── Boot: restore session, then start router. ─────────────────────
(async () => {
  await auth.tryRestoreSession();
  router.init();
})();

// ─── Test helpers (used by Playwright E2E tests) ───────────────────
// NOTE: auth is a module-level singleton. Exposing it on window allows
// Playwright tests to call auth.login() / auth.me() via page.evaluate()
// so the SPA's auth state is properly set before assertions run.
window.__auth = auth;
window.__router = router;
