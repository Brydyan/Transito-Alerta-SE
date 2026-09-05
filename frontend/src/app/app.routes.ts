import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { menuResolver } from './core/guards/menu.resolver';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  // REG (sc-325) — primera ruta alcanzable sin sesión (D5).
  // `guestGuard` redirige al dashboard si el visitante ya tiene
  // sesión, igual que la ruta de login. Vive FUERA del árbol
  // `/app` (que está bajo `authGuard`).
  {
    path: 'registro',
    loadComponent: () =>
      import('./features/auth/register/register.component').then(
        (m) => m.RegisterComponent,
      ),
    canActivate: [guestGuard],
  },
  // REG (sc-325) — Fix 9 (ronda 6): destino de la navegación de
  // `register.component.ts:onSubmit` al alta exitosa. Sin esta
  // ruta, el ciudadano cae en el comodín `path: '**'` y termina
  // en una página de error 404 con la cuenta creada y el OTP
  // enviado. La propia existencia de esta ruta la cubre el spec
  // de la próxima sección (defensa contra el defecto B.6 que
  // verificó el cambio como hecho cuando en realidad no
  // existía el componente, sólo un `.html` heredado de sc-117).
  //
  // guestGuard (no authGuard): un visitante sin sesión debe poder
  // ver esta pantalla; un usuario con sesión queda en el
  // dashboard (esto último es decisión consciente del round 0,
  // no se cambia en este fix).
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.component').then(
        (m) => m.VerifyEmailComponent,
      ),
    canActivate: [guestGuard],
  },
  // SC-207 — invitation token acceptance (replaces the dead
  // /auth/register flow). Token arrives out-of-band (typically via
  // email) as `?token=…`. Deliberately NO guestGuard: an already
  // signed-in user must still be able to open an invitation link to
  // join a different organization (the component clears their old
  // session itself before previewing the new invitation).
  {
    path: 'accept-invitation',
    loadComponent: () =>
      import('./features/auth/accept-invitation/accept-invitation.component').then(
        (m) => m.AcceptInvitationComponent,
      ),
  },
  {
    path: 'app',
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then((m) => m.MainLayout),
    canActivate: [authGuard],
    resolve: { menu: menuResolver },
    children: [
      {
        path: 'dashboard',
        data: { breadcrumb: 'Dashboard' },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },

      // Sección Administración (Solo Admin)
      {
        path: 'admin',
        data: { breadcrumb: 'Administración' },
        loadComponent: () =>
          import('./features/admin/component/admin.component').then((m) => m.AdminComponent),
        children: [
          {
            path: 'users',
            data: { breadcrumb: 'Usuarios' },
            children: [
              {
                path: '',
                pathMatch: 'full',
                loadComponent: () =>
                  import('./features/admin/users/user-management/user-management.component').then(
                    (m) => m.UserManagementComponent,
                  ),
              },
              {
                path: 'new',
                data: { breadcrumb: 'Nuevo Usuario' },
                loadComponent: () =>
                  import('./features/admin/users/user-form/user-form.component').then(
                    (m) => m.UserFormComponent,
                  ),
              },
              {
                path: ':id/edit',
                data: { breadcrumb: 'Editar Usuario' },
                loadComponent: () =>
                  import('./features/admin/users/user-form/user-form.component').then(
                    (m) => m.UserFormComponent,
                  ),
              },
            ],
          },
          {
            path: 'roles',
            data: { breadcrumb: 'Roles' },
            loadComponent: () =>
              import('./features/admin/roles/roles.component').then((m) => m.RolesComponent),
            children: [
              {
                path: ':rolId',
                data: { breadcrumb: 'Editor de Rol' },
                loadComponent: () =>
                  import('./features/admin/roles/role-editor/role-editor.component').then(
                    (m) => m.RoleEditorComponent,
                  ),
              },
            ],
          },
          {
            path: 'config',
            data: { breadcrumb: 'Configuración' },
            loadComponent: () =>
              import('./features/admin/system-config/system-config.component').then(
                (m) => m.SystemConfigComponent,
              ),
          },
        ],
      },

      // Sección Reportes
      {
        path: 'reportes',
        data: { breadcrumb: 'Reportes' },
        children: [
          {
            path: 'dashboard',
            data: { breadcrumb: 'Dashboard KPI' },
            loadComponent: () =>
              import('./features/reports/kpi-dashboard/kpi-dashboard').then(
                (m) => m.KpiDashboardComponent,
              ),
          },
          {
            path: 'listado-clientes',
            data: { breadcrumb: 'Listado de Clientes' },
            loadComponent: () =>
              import('./features/reports/clients-list/clients-list').then(
                (m) => m.ClientsListComponent,
              ),
          },
        ],
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },

      // F1 (D2) — Rutas placeholder para los destinos del MENU_MAP que aún
      // no tienen pantalla real. Cada una monta `PlaceholderComponent` con
      // el comentario `// PLACEHOLDER F<n>` para que la fase siguiente la
      // identifique y reemplace. El listado vive también en
      // `backend/src/modules/menus/menu-map.spec.ts` (D6).
      {
        path: 'inicio',
        data: { breadcrumb: 'Inicio', title: 'Inicio', phase: 'F4' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        // PLACEHOLDER F4
      },
      // F3 (sc-303) — Incidencias: listado + detalle. El placeholder
      // de F1 se sustituye por el componente real. El `:id` del
      // detalle va DESPUÉS del listado literal (orden importante en
      // Angular Router: las rutas con segmentos estáticos ganan a
      // las dinámicas).
      {
        path: 'incidencias',
        data: { breadcrumb: 'Incidencias' },
        children: [
          {
            path: '',
            data: { breadcrumb: 'Listado' },
            loadComponent: () =>
              import('./features/incidents/incident-list/incident-list.component').then(
                (m) => m.IncidentListComponent,
              ),
          },
          {
            path: ':id',
            data: { breadcrumb: 'Detalle' },
            loadComponent: () =>
              import('./features/incidents/incident-detail/incident-detail.component').then(
                (m) => m.IncidentDetailComponent,
              ),
          },
        ],
      },
      {
        path: 'mapa',
        data: { breadcrumb: 'Mapa', title: 'Mapa', phase: 'F4' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        // PLACEHOLDER F4
      },
      // F1.5.3 — `citizen-report` era código muerto (sólo importable).
      // F1 lo registra como ruta real del menú `Reportar`. La pantalla
      // existe y se conserva tal cual.
      {
        path: 'reportar',
        data: { breadcrumb: 'Reportar' },
        loadComponent: () =>
          import('./features/citizen-report/citizen-report.component').then(
            (m) => m.CitizenReportComponent,
          ),
      },
      {
        path: 'organizaciones',
        data: { breadcrumb: 'Organizaciones', title: 'Organizaciones', phase: 'F2' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        // PLACEHOLDER F2
      },
      {
        path: 'categorias',
        data: { breadcrumb: 'Categorías', title: 'Categorías', phase: 'F2' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        // PLACEHOLDER F2
      },
      {
        path: 'ubicaciones',
        data: { breadcrumb: 'Ubicaciones', title: 'Ubicaciones', phase: 'F2' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        // PLACEHOLDER F2
      },

      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/error/error-page/error-page.component').then((m) => m.ErrorPageComponent),
  },
];
