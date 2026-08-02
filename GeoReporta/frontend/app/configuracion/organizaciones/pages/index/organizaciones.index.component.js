import template from './organizaciones.index.component.html?raw';
import { createCrudIndexPage } from '../../../../shared/crud-index.js';
import { formatearFecha } from '../../../../utils/format.js';
import { permissionService } from '../../../../shared/permission.service.js';

export default {
  template,

  async onInit() {
    const perms = await permissionService.getMyPermissions();
    if (!perms.has('organizations.create')) {
      document
        .querySelectorAll('a[href*="organizaciones/crear"]')
        .forEach((el) => el.classList.add('d-none'));
    }
    const page = createCrudIndexPage({
      endpoint: '/organizations',
      slugs: {
        update: 'organizations.update',
        delete: 'organizations.delete',
      },
      showView: false,
      buildRow: (org) => `
                <tr>
                    <td class="text-center"><input type="checkbox" class="form-check-input check-row" data-id="${org.id}" /></td>
                    <td class="fw-semibold">${org.name}</td>
                    <td class="text-muted small">${org.location?.name ?? '—'}</td>
                    <td class="small text-muted">${formatearFecha(org.created_at)}</td>
                    <td class="text-center">
                        <table-actions id="ta-desktop-${org.id}"></table-actions>
                    </td>
                </tr>`,
      buildCard: (org) => `
                <div class="card mb-2 shadow-sm">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-0">${org.name}</h6>
                                <small class="text-muted">${org.location?.name ?? '—'}</small>
                            </div>
                            <table-actions id="ta-mobile-${org.id}"></table-actions>
                        </div>
                    </div>
                </div>`,
      filters: () => ({
        search: document.getElementById('filtro-buscar').value.trim(),
      }),
      viewPath: (id) => '/organizaciones/' + id,
      editPath: (id) => '/organizaciones/crear?id=' + id,
      deleteOkMsg: 'Organización eliminada.',
    });

    page.init();
  },

  onDestroy() {},
};
