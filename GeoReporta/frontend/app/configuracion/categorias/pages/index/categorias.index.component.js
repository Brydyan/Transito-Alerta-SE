import template from './categorias.index.component.html?raw';
import { http } from '../../../../core/http.service.js';
import { createCrudIndexPage } from '../../../../shared/crud-index.js';
import { permissionService } from '../../../../shared/permission.service.js';

export default {
  template,

  async onInit() {
    const perms = await permissionService.getMyPermissions();
    if (!perms.has('incident-categories.create')) {
      document
        .querySelectorAll('a[href*="categorias/crear"]')
        .forEach((el) => el.classList.add('d-none'));
    }

    let categoriasPadre = [];

    const page = createCrudIndexPage({
      endpoint: '/incident-categories',
      slugs: {
        update: 'incident-categories.update',
        delete: 'incident-categories.delete',
      },
      showView: false,
      buildRow: (cat) => `
            <tr>
              <td class="text-center"><input type="checkbox" class="form-check-input check-row" data-id="${cat.id}" /></td>
              <td class="fw-semibold">${cat.name}</td>
              <td>
                <span class="badge ${cat.parent_id ? 'bg-secondary' : 'bg-primary'}">
                  ${cat.parent_id ? 'Subcategoría' : 'Categoría Principal'}
                </span>
              </td>
              <td class="text-muted">${cat.parent?.name ?? '—'}</td>
              <td class="text-center">
                <table-actions id="ta-desktop-${cat.id}"></table-actions>
              </td>
            </tr>`,
      buildCard: (cat) => `
            <div class="card mb-2 shadow-sm">
              <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 class="mb-0">${cat.name}</h6>
                    <span class="badge ${cat.parent_id ? 'bg-secondary' : 'bg-primary'} mt-1">
                      ${cat.parent_id ? 'Subcategoría' : 'Categoría Principal'}
                    </span>
                    ${cat.parent ? `<br><small class="text-muted">Padre: ${cat.parent.name}</small>` : ''}
                  </div>
                  <table-actions id="ta-mobile-${cat.id}"></table-actions>
                </div>
              </div>
            </div>`,
      filters: () => {
        const f = {
          search: document.getElementById('filtro-buscar').value.trim(),
        };
        const padreVal = document.getElementById('filtro-padre').value;
        if (padreVal) f.parent_id = padreVal;
        return f;
      },
      clearFilters: () => {
        document.getElementById('filtro-padre').value = '';
      },
      viewPath: (id) => '/categorias/' + id,
      editPath: (id) => '/categorias/crear?id=' + id,
      deleteOkMsg: 'Categoría eliminada.',
    });

    async function cargarCategoriasPadre() {
      if (categoriasPadre.length) return;
      const resp = await http.get('/incident-categories?per_page=200');
      const todas = resp.data ?? resp;
      // Filtrar únicamente las principales (parent_id es null o vacio)
      categoriasPadre = todas.filter((c) => !c.parent_id);
      const sel = document.getElementById('filtro-padre');
      sel.innerHTML = '<option value="">Todas las categorías padre</option>';
      categoriasPadre.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        sel.appendChild(opt);
      });
    }

    cargarCategoriasPadre().catch(() => {});
    page.init();
  },

  onDestroy() {},
};
