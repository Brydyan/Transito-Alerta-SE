import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
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
      {
        path: 'incidencias',
        data: { breadcrumb: 'Lista de Incidencias', title: 'Lista de Incidencias', phase: 'F3' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        // PLACEHOLDER F3
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
        children: [
          {
            path: '',
            data: { breadcrumb: 'Organizaciones' },
            loadComponent: () =>
              import('./features/catalogs/organizations/organization-list/organization-list.component').then(
                (m) => m.OrganizationListComponent,
              ),
          },
          {
            path: 'new',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Nueva Organización', permission: 'CREATE organizations' },
            loadComponent: () =>
              import('./features/catalogs/organizations/organization-form/organization-form.component').then(
                (m) => m.OrganizationFormComponent,
              ),
          },
          {
            path: ':id/edit',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Editar Organización', permission: 'UPDATE organizations' },
            loadComponent: () =>
              import('./features/catalogs/organizations/organization-form/organization-form.component').then(
                (m) => m.OrganizationFormComponent,
              ),
          },
        ],
      },
      {
        path: 'categorias',
        data: { breadcrumb: 'Categorías', title: 'Categorías', phase: 'F2' },
        children: [
          {
            path: '',
            data: { breadcrumb: 'Categorías' },
            loadComponent: () =>
              import('./features/catalogs/incident-categories/category-list/category-list.component').then(
                (m) => m.CategoryListComponent,
              ),
          },
          {
            path: 'new',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Nueva Categoría', permission: 'CREATE incident-categories' },
            loadComponent: () =>
              import('./features/catalogs/incident-categories/category-form/category-form.component').then(
                (m) => m.CategoryFormComponent,
              ),
          },
          {
            path: ':id/edit',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Editar Categoría', permission: 'UPDATE incident-categories' },
            loadComponent: () =>
              import('./features/catalogs/incident-categories/category-form/category-form.component').then(
                (m) => m.CategoryFormComponent,
              ),
          },
        ],
      },
      {
        path: 'ubicaciones',
        data: { breadcrumb: 'Ubicaciones', title: 'Ubicaciones', phase: 'F2' },
        children: [
          {
            path: '',
            data: { breadcrumb: 'Ubicaciones' },
            loadComponent: () =>
              import('./features/catalogs/locations/location-list/location-list.component').then(
                (m) => m.LocationListComponent,
              ),
          },
          {
            path: 'new',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Nueva Ubicación', permission: 'CREATE geo-zones' },
            loadComponent: () =>
              import('./features/catalogs/locations/location-form/location-form.component').then(
                (m) => m.LocationFormComponent,
              ),
          },
          {
            path: ':id/edit',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Editar Ubicación', permission: 'UPDATE geo-zones' },
            loadComponent: () =>
              import('./features/catalogs/locations/location-form/location-form.component').then(
                (m) => m.LocationFormComponent,
              ),
          },
        ],
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
