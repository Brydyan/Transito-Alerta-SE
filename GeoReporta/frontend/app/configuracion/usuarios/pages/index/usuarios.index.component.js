import template from './usuarios.index.component.html?raw';
import './usuarios.index.component.css';
import { http } from '../../../../core/http.service.js';
import { createCrudIndexPage } from '../../../../shared/crud-index.js';
import { renderAvatarCell } from '../../../../utils/avatar.js';
import { permissionService } from '../../../../shared/permission.service.js';
import {
  initCustomSelects,
  getSelectValue,
  setSelectOptions,
  clearCustomSelects,
} from '../../../../shared/custom-select.js';

const ROLE_BADGES = {
  admin_sistema: '<span class="badge bg-danger">Admin Sistema</span>',
  operador_sistema:
    '<span class="badge bg-warning text-dark">Operador Sistema</span>',
  admin_organizacion: '<span class="badge bg-primary">Admin Org</span>',
  operador_organizacion:
    '<span class="badge bg-info text-dark">Operador Org</span>',
  usuario: '<span class="badge bg-secondary">Ciudadano</span>',
};

function roleBadge(u) {
  return (
    ROLE_BADGES[u.role?.name] ??
    `<span class="badge bg-light text-dark border">${u.role?.name ?? '—'}</span>`
  );
}

function nombreCompleto(u) {
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`;
}

function iniciales(user) {
  const n = (user.first_name?.[0] ?? '').toUpperCase();
  const a = (user.last_name?.[0] ?? '').toUpperCase();
  return n + a || 'U';
}

export default {
  template,

  async onInit() {
    const perms = await permissionService.getMyPermissions();
    if (!perms.has('users.create')) {
      document
        .querySelectorAll('a[href*="usuarios/crear"]')
        .forEach((el) => el.classList.add('d-none'));
    }

    let roles = [];
    let organizaciones = [];

    const page = createCrudIndexPage({
      endpoint: '/users',
      slugs: { update: 'users.update', delete: 'users.delete' },
      showView: false,
      itemTitle: nombreCompleto,
      buildRow: (u) => `
                <tr>
                    <td class="text-center"><input type="checkbox" class="form-check-input check-row" data-id="${u.id}" /></td>
                    ${renderAvatarCell(u)}
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-semibold">${nombreCompleto(u)}</span>
                        </div>
                    </td>
                    <td class="small">${u.email}</td>
                    <td>${roleBadge(u)}</td>
                    <td class="small text-muted">${u.organization?.name ?? '—'}</td>
                    <td class="small text-muted">${u.phone ?? '—'}</td>
                    <td class="text-center">
                      <table-actions id="ta-desktop-${u.id}"></table-actions>
                    </td>
                </tr>`,
      buildCard: (u) => `
                <div class="card mb-2 shadow-sm">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center gap-2">
                                <span class="rounded-circle bg-primary d-inline-flex align-items-center justify-content-center text-white"
                                    style="width:38px;height:38px;">${iniciales(u)}</span>
                                <div>
                                    <h6 class="mb-0">${nombreCompleto(u)}</h6>
                                    <small class="text-muted">${u.email}</small><br>
                                    ${roleBadge(u)}
                                    ${u.organization ? `<br><small class="text-muted">Org: ${u.organization.name}</small>` : ''}
                                </div>
                            </div>
                            <table-actions id="ta-mobile-${u.id}"></table-actions>
                        </div>
                    </div>
                </div>`,
      filters: () => ({
        search: document.getElementById('filtro-buscar').value.trim(),
        role_id: getSelectValue('filtro-rol'),
        organization_id: getSelectValue('filtro-org'),
      }),
      clearFilters: () => {
        document.getElementById('filtro-buscar').value = '';
        clearCustomSelects();
      },
      viewPath: (id) => '/usuarios/' + id,
      editPath: (id) => '/usuarios/crear?id=' + id,
      deleteOkMsg: 'Usuario eliminado.',
    });

    async function cargarFiltros() {
      if (roles.length && organizaciones.length) return;

      try {
        const data = await http.get('/users/form-data');

        if (!roles.length) {
          roles = data.roles ?? [];
          const rolesOpts = [
            { value: '', label: 'Todos los roles' },
            ...roles.map((r) => ({ value: r.id, label: r.name })),
          ];
          setSelectOptions('filtro-rol', rolesOpts);
        }

        if (!organizaciones.length) {
          organizaciones = data.organizations ?? [];
          const orgsOpts = [
            { value: '', label: 'Todas las organizaciones' },
            ...organizaciones.map((o) => ({ value: o.id, label: o.name })),
          ];
          setSelectOptions('filtro-org', orgsOpts);
        }
      } catch (err) {
        console.error('Error cargando filtros:', err);
      }
    }

    initCustomSelects();
    cargarFiltros().catch(() => {});
    page.init();
  },

  onDestroy() {},
};
