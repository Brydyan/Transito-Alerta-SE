import template from './localizaciones.index.component.html?raw';
import { http } from '../../../../core/http.service.js';
import { router } from '../../../../core/router.js';
import { locationService } from '../../../../shared/location.service.js';
import { renderPaginacion } from '../../../../shared/pagination/pagination.js';
import { isForbidden } from '../../../../shared/forbidden.js';
import { permissionService } from '../../../../shared/permission.service.js';
import { hydrateKebabActions } from '../../../../shared/kebab-actions.js';
import {
  isDesktop,
  mostrarEstado,
  mostrarToast,
} from '../../../../utils/ui.js';

const POR_PAGINA = 15;
const NIVEL_LABELS = {
  country: 'País',
  province: 'Provincia',
  city: 'Ciudad',
  neighborhood: 'Barrio',
};

export default {
  template,

  async onInit() {
    const locPerms = await permissionService.getMyPermissions();
    if (!locPerms.has('locations.create')) {
      document
        .querySelectorAll('a[href*="localizaciones/crear"]')
        .forEach((el) => el.classList.add('d-none'));
    }

    let paginaActual = 1;
    let totalPaginas = 1;
    let idEliminar = null;

    // Progressive tree state
    let treeRoots = null; // Flat array of root nodes (countries)
    const childrenMap = new Map(); // nodeId -> children array
    const expandedIds = new Set(); // IDs of expanded nodes
    const loadingIds = new Set(); // IDs currently loading children
    let modoArbol = true;

    const tbody = () => document.getElementById('tabla-body');
    const thead = () => document.getElementById('thead-locs');

    function nivelBadge(level) {
      const map = {
        country: 'primary',
        province: 'info',
        city: 'success',
        neighborhood: 'secondary',
      };
      return `<span class="badge bg-${map[level] ?? 'secondary'}">${NIVEL_LABELS[level] ?? level}</span>`;
    }

    // ─── Progressive Tree mode ───────────────────────────────────────────────

    /**
     * Build a flat list from treeRoots for rendering.
     * Each node may have children fetched lazily from childrenMap.
     * Only renders children if the node is expanded AND has loaded children.
     */
    function buildFlatList(nodes, depth, result) {
      for (const node of nodes) {
        const nodeWithDepth = { ...node, _depth: depth };
        result.push(nodeWithDepth);

        if (expandedIds.has(node.id)) {
          const children = childrenMap.get(node.id);
          if (children && children.length > 0) {
            buildFlatList(children, depth + 1, result);
          }
        }
      }
      return result;
    }

    /**
     * Remove descendants from expandedIds when collapsing a node.
     * Since children are stored in childrenMap (not nested), we track
     * which IDs were added by this expansion in expandedIds directly.
     */
    function removeDescendants(nodeId) {
      // Find direct children and remove them from expandedIds
      const children = childrenMap.get(nodeId);
      if (children) {
        for (const child of children) {
          if (expandedIds.has(child.id)) {
            // Recursively remove grandchildren
            removeDescendants(child.id);
            expandedIds.delete(child.id);
          }
        }
      }
    }

    function renderArbol() {
      thead().innerHTML = `
        <tr>
          <th style="width: 40px;" class="text-center"><input type="checkbox" class="form-check-input check-select-all" /></th>
          <th>NOMBRE</th>
          <th style="width:130px">CÓDIGO</th>
          <th style="width:130px">NIVEL</th>
          <th style="width:70px" class="text-center">Acciones</th>
        </tr>`;

      const flat = buildFlatList(treeRoots, 0, []);
      const esDesktop = isDesktop();
      const slugSet = {
        update: 'locations.update',
        delete: 'locations.delete',
      };

      if (esDesktop) {
        tbody().innerHTML = flat
          .map((loc) => {
            const isExpanded = expandedIds.has(loc.id);
            const isLoading = loadingIds.has(loc.id);
            const hasChildren =
              isExpanded && childrenMap.has(loc.id)
                ? childrenMap.get(loc.id).length > 0
                : null; // null = unknown (not yet loaded)
            const indent = loc._depth * 24;

            let toggleIcon = '';
            let toggleClass =
              'btn btn-link btn-sm p-0 me-1 btn-toggle text-muted';

            if (isLoading) {
              toggleIcon = '<i class="fa-solid fa-spinner fa-spin"></i>';
              toggleClass = 'btn btn-link btn-sm p-0 me-1 text-muted';
            } else if (hasChildren === true) {
              toggleIcon = `<i class="fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>`;
            } else if (hasChildren === false) {
              toggleIcon =
                '<i class="fa-solid fa-chevron-right text-muted opacity-25"></i>';
              toggleClass =
                'btn btn-link btn-sm p-0 me-1 text-muted opacity-25';
            } else {
              // hasChildren === null — unknown, show spinner or arrow
              toggleIcon = '<i class="fa-solid fa-chevron-right"></i>';
            }

            return `
            <tr>
              <td class="text-center"><input type="checkbox" class="form-check-input check-row" data-id="${loc.id}" /></td>
              <td style="padding-left:${10 + indent}px">
                <button class="${toggleClass}" data-id="${loc.id}">
                  ${toggleIcon}
                </button>
                ${loc.name}
              </td>
              <td><code style="font-size:12px">${loc.code ?? '—'}</code></td>
              <td>${nivelBadge(loc.level)}</td>
              <td>
                <table-actions id="ta-tree-${loc.id}"></table-actions>
              </td>
            </tr>`;
          })
          .join('');

        hydrateKebabActions(tbody(), flat, {
          slugs: slugSet,
          showView: false,
          itemTitle: (loc) => loc.name,
        });

        document.getElementById('contenedor-cards').innerHTML = '';
      } else {
        tbody().innerHTML = '';
        document.getElementById('contenedor-cards').innerHTML = flat
          .map(
            (loc) => `
            <div class="card mb-2 shadow-sm" style="margin-left:${loc._depth * 16}px">
              <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 class="mb-0">${loc.name} <code style="font-size:11px">${loc.code ?? ''}</code></h6>
                    <div class="mt-1">${nivelBadge(loc.level)}</div>
                  </div>
                  <table-actions id="ta-mobile-${loc.id}"></table-actions>
                </div>
              </div>
            </div>`,
          )
          .join('');

        hydrateKebabActions(document.getElementById('contenedor-cards'), flat, {
          slugs: slugSet,
          showView: false,
          itemTitle: (loc) => loc.name,
        });
      }

      document.getElementById('info-resultados').textContent =
        `${flat.length} localización${flat.length !== 1 ? 'es' : ''} visible${flat.length !== 1 ? 's' : ''}`;
      document.getElementById('paginacion').innerHTML = '';
      mostrarEstado('tabla');
    }

    async function cargarArbol() {
      mostrarEstado('cargando');
      try {
        if (!treeRoots) {
          // Progressive load: get countries (roots)
          const countries = await locationService.getRoots({
            level: 'country',
          });
          // Countries are roots — they'll have provinces as children
          // But for tree display, we want to show countries and their children (provinces)
          // Since provinces have parent_id pointing to country, we show countries as roots
          treeRoots = countries;
        }
        if (!treeRoots.length) {
          mostrarEstado('vacio');
          return;
        }
        renderArbol();
      } catch (err) {
        if (isForbidden(err)) {
          mostrarToast('No tienes acceso a este recurso.', 'warning');
        }
        mostrarEstado('error');
      }
    }

    // ─── Flat / search mode ───────────────────────────────────────────────

    function renderTablaFlat(datos, total) {
      if (!datos?.length) {
        mostrarEstado('vacio');
        return;
      }

      const esDesktop = isDesktop();

      thead().innerHTML = `
        <tr>
          <th style="width: 40px;" class="text-center"><input type="checkbox" class="form-check-input check-select-all" /></th>
          <th>NOMBRE</th>
          <th style="width:130px">CÓDIGO</th>
          <th style="width:130px">NIVEL</th>
          <th style="width:130px">PADRE</th>
          <th style="width:70px" class="text-center">Acciones</th>
        </tr>`;

      if (esDesktop) {
        tbody().innerHTML = datos
          .map(
            (loc) => `
            <tr>
              <td class="text-center"><input type="checkbox" class="form-check-input check-row" data-id="${loc.id}" /></td>
              <td class="fw-semibold">${loc.name}</td>
              <td><code style="font-size:12px">${loc.code ?? '—'}</code></td>
              <td>${nivelBadge(loc.level)}</td>
              <td class="text-muted">${loc.parent?.name ?? '—'}</td>
              <td>
                <table-actions id="ta-flat-${loc.id}"></table-actions>
              </td>
            </tr>`,
          )
          .join('');

        hydrateKebabActions(tbody(), datos, {
          slugs: { update: 'locations.update', delete: 'locations.delete' },
          showView: false,
          itemTitle: (loc) => loc.name,
        });

        document.getElementById('contenedor-cards').innerHTML = '';
      } else {
        tbody().innerHTML = '';
        document.getElementById('contenedor-cards').innerHTML = datos
          .map(
            (loc) => `
            <div class="card mb-2 shadow-sm">
              <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 class="mb-0">${loc.name} <code style="font-size:11px">${loc.code ?? ''}</code></h6>
                    <div class="mt-1">${nivelBadge(loc.level)}</div>
                    ${loc.parent ? `<small class="text-muted">Padre: ${loc.parent.name}</small>` : ''}
                  </div>
                  <table-actions id="ta-mobile-${loc.id}"></table-actions>
                </div>
              </div>
            </div>`,
          )
          .join('');

        hydrateKebabActions(
          document.getElementById('contenedor-cards'),
          datos,
          {
            slugs: { update: 'locations.update', delete: 'locations.delete' },
            showView: false,
            itemTitle: (loc) => loc.name,
          },
        );
      }

      const desde = (paginaActual - 1) * POR_PAGINA + 1;
      const hasta = Math.min(paginaActual * POR_PAGINA, total);
      document.getElementById('info-resultados').textContent =
        `Mostrando ${desde}–${hasta} de ${total}`;
      renderPaginacion(
        document.getElementById('paginacion'),
        paginaActual,
        totalPaginas,
        buscar,
      );
      mostrarEstado('tabla');
    }

    async function buscar(pagina = 1) {
      paginaActual = pagina;
      mostrarEstado('cargando');
      const params = new URLSearchParams({
        page: paginaActual,
        per_page: POR_PAGINA,
        search: document.getElementById('filtro-buscar').value.trim(),
        level: document.getElementById('filtro-nivel').value,
      });
      try {
        const resp = await http.get('/locations?' + params.toString());
        const datos = resp.data ?? resp;
        const total = resp.meta?.total ?? resp.total ?? datos.length;
        totalPaginas = Math.ceil(total / POR_PAGINA) || 1;
        renderTablaFlat(datos, total);
      } catch (err) {
        if (isForbidden(err)) {
          mostrarToast('No tienes acceso a este recurso.', 'warning');
        }
        mostrarEstado('error');
      }
    }

    // ─── Smart load: tree vs flat ──────────────────────────────────────────

    async function cargar() {
      const search = document.getElementById('filtro-buscar').value.trim();
      const level = document.getElementById('filtro-nivel').value;
      modoArbol = !search && !level;
      if (modoArbol) {
        await cargarArbol();
      } else {
        buscar(1);
      }
    }

    // ─── Events ─────────────────────────────────────────────────────────

    // Delegated click handler for kebab actions ([data-action="view|edit|delete"])
    function manejarAcciones(e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const { id, titulo, action } = target.dataset;
      e.preventDefault();
      if (action === 'view') {
        router.navigate('/localizaciones/' + id);
        return;
      }
      if (action === 'edit') {
        router.navigate('/localizaciones/crear?id=' + id);
        return;
      }
      if (action === 'delete') {
        idEliminar = id;
        document.getElementById('modal-eliminar-nombre').textContent = titulo;
        new bootstrap.Modal(document.getElementById('modal-eliminar')).show();
      }
    }

    async function manejarToggle(e) {
      const toggle = e.target.closest('.btn-toggle');
      if (!toggle || !modoArbol) return;

      const id = parseInt(toggle.dataset.id);

      if (expandedIds.has(id)) {
        // Collapse: remove this node and its descendants from expandedIds
        removeDescendants(id);
        expandedIds.delete(id);
        renderArbol();
      } else {
        // Expand: check if children are already loaded
        if (childrenMap.has(id)) {
          // Children already fetched, just expand
          expandedIds.add(id);
          renderArbol();
        } else {
          // Need to fetch children
          loadingIds.add(id);
          expandedIds.add(id);
          renderArbol(); // Show loading state

          try {
            const children = await locationService.getChildren({
              parentId: id,
            });
            childrenMap.set(id, children);
            loadingIds.delete(id);
            renderArbol();
          } catch {
            // Failed to load children - collapse and show error
            loadingIds.delete(id);
            expandedIds.delete(id);
            childrenMap.delete(id);
            mostrarToast(
              'No se pudieron cargar las localidades hijo.',
              'danger',
            );
            renderArbol();
          }
        }
      }
    }

    const tablaBody = document.getElementById('tabla-body');
    const contenedorCards = document.getElementById('contenedor-cards');

    tablaBody.addEventListener('click', manejarToggle);
    tablaBody.addEventListener('click', manejarAcciones);
    contenedorCards.addEventListener('click', manejarAcciones);

    document
      .getElementById('btn-confirmar-eliminar')
      .addEventListener('click', async function () {
        if (!idEliminar) return;
        document.getElementById('eliminar-texto').classList.add('d-none');
        document.getElementById('eliminar-loading').classList.remove('d-none');
        this.disabled = true;
        try {
          await http.delete('/locations/' + idEliminar);
          bootstrap.Modal.getInstance(
            document.getElementById('modal-eliminar'),
          ).hide();
          // Reset tree state after deletion
          treeRoots = null;
          childrenMap.clear();
          expandedIds.clear();
          locationService.invalidateCache();
          mostrarToast('Localización eliminada.', 'success');
          cargar();
        } catch {
          mostrarToast('No se pudo eliminar.', 'danger');
        } finally {
          document.getElementById('eliminar-texto').classList.remove('d-none');
          document.getElementById('eliminar-loading').classList.add('d-none');
          document.getElementById('btn-confirmar-eliminar').disabled = false;
        }
      });

    document.getElementById('btn-filtrar').addEventListener('click', cargar);
    document
      .getElementById('filtro-buscar')
      .addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cargar();
      });
    document.getElementById('btn-limpiar').addEventListener('click', () => {
      document.getElementById('filtro-buscar').value = '';
      document.getElementById('filtro-nivel').value = '';
      cargar();
    });
    document.getElementById('btn-reintentar').addEventListener('click', cargar);

    await cargar();
  },

  onDestroy() {},
};
