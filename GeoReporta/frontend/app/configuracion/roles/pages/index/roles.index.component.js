import template from './roles.index.component.html?raw';
import { router } from '../../../../core/router.js';
import { createCrudIndexPage } from '../../../../shared/crud-index.js';

export default {
  template,

  async onInit() {
    const page = createCrudIndexPage({
      endpoint: '/roles',
      slugs: { update: 'roles.update', delete: 'roles.delete' },
      showView: true,
      buildRow: (rol) => `
                <tr>
                    <td class="fw-semibold">${rol.name}</td>
                    <td class="text-center">
                        <table-actions id="ta-desktop-${rol.id}"></table-actions>
                    </td>
                </tr>`,
      buildCard: (rol) => `
                <div class="card mb-2 shadow-sm">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-0">${rol.name}</h6>
                            </div>
                            <table-actions id="ta-mobile-${rol.id}"></table-actions>
                        </div>
                    </div>
                </div>`,
      filters: () => {
        const buscar = document.getElementById('filtro-buscar').value.trim();
        return buscar ? { search: buscar } : {};
      },
      viewPath: (id) => '/roles/' + id + '?view=true',
      editPath: (id) => '/roles/' + id,
      deleteOkMsg: 'Rol eliminado.',
    });

    document.getElementById('btn-nuevo-rol').addEventListener('click', () => {
      router.navigate('/roles/create');
    });

    page.init();
  },

  onDestroy() {},
};
