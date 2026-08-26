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

      {
        path: 'Reportes',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
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
