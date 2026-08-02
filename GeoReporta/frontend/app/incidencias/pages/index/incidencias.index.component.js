import template from './incidencias.index.component.html?raw';
import {
  badgeEstado,
  badgePrioridad,
  escapeHtml,
  formatearFecha,
} from '../../../utils/format.js';
import { http } from '../../../core/http.service.js';
import { router } from '../../../core/router.js';
import { renderPaginacion } from '../../../shared/pagination/pagination.js';
import { permissionService } from '../../../shared/permission.service.js';
import {
  initSelect,
  clearSelect,
  destroyAll,
} from '../../../shared/select-search.js';
import { hydrateKebabActions } from '../../../shared/kebab-actions.js';
import { isDesktop, mostrarEstado, mostrarToast } from '../../../utils/ui.js';

const POR_PAGINA = 10;

export default {
  template,

  async onInit() {
    let paginaActual = 1;
    let totalPaginas = 1;
    let idEliminar = null;

    async function renderTabla(datos, total) {
      if (!datos || datos.length === 0) {
        mostrarEstado('vacio');
        return;
      }

      const esDesktop = isDesktop();
      const tbody = document.getElementById('tabla-body');
      const cards = document.getElementById('contenedor-cards');

      // Desktop: tabla
      if (esDesktop) {
        tbody.innerHTML = datos
          .map((inc) => {
            const categoria = inc.category?.name || '—';
            const ubicacion = inc.location?.name || '—';
            const titulo = inc.title || 'Sin título';
            return `<tr data-id="${inc.id}" data-status="${inc.status}" style="cursor:pointer;" class="lista-row">
            <td class="text-center"><input type="checkbox" class="form-check-input check-row" data-id="${inc.id}" /></td>
            <td>
              <div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${inc.title ?? ''}">
                <span class="fw-semibold">${titulo}</span>
              </div>
              <small class="text-muted">${categoria}</small>
            </td>
            <td>${badgePrioridad(inc.priority)}</td>
            <td>${badgeEstado(inc.status)}</td>
            <td class="small text-muted">${ubicacion}</td>
            <td class="small text-muted">${formatearFecha(inc.created_at)}</td>
            <td class="text-center">
              <table-actions id="ta-desktop-${inc.id}"></table-actions>
            </td>
          </tr>`;
          })
          .join('');

        // Wait for kebab hydration so the dropdown menu is in the DOM
        // before renderTabla returns.
        await hydrateKebabActions(tbody, datos, {
          slugs: { update: 'incidents.update', delete: 'incidents.delete' },
          showView: false,
          itemTitle: (inc) => inc.title || 'Sin título',
        });

        cards.innerHTML = '';
      } else {
        // Mobile: cards — compact layout sin scroll horizontal
        tbody.innerHTML = '';
        cards.innerHTML = datos
          .map((inc) => {
            const categoria = inc.category?.name || '—';
            const ubicacion = inc.location?.name || '—';
            const titulo = inc.title || 'Sin título';
            return `
            <div class="card mb-2 shadow-sm lista-card" data-id="${inc.id}" data-status="${inc.status}" style="cursor:pointer;">
              <div class="card-body p-1" style="padding:0.75rem !important;">
                <!-- Título y categoría -->
                <div class="mb-1">
                  <h6 class="card-title mb-0" style="font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(titulo)}</h6>
                  <small class="text-muted" style="font-size:0.75rem;">${escapeHtml(categoria)}</small>
                </div>

                <!-- Prioridad y Estado -->
                <div class="d-flex gap-1 mb-2" style="font-size:0.75rem;">
                  ${badgePrioridad(inc.priority)}
                  ${badgeEstado(inc.status)}
                </div>

                <!-- Metadata (fecha, ubicación) -->
                <div class="mb-2" style="font-size:0.7rem;">
                  <div class="text-muted mb-1">
                    <i class="fas fa-calendar-alt" style="width:12px;"></i>
                    ${formatearFecha(inc.created_at)}
                  </div>
                  <div class="text-muted">
                    <i class="fas fa-map-marker-alt" style="width:12px;"></i>
                    <span style="overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:180px;vertical-align:middle;">
                      ${escapeHtml(ubicacion)}
                    </span>
                  </div>
                </div>

                <!-- kebab actions placeholder (Ver + kebab dropdown) -->
                <div class="d-flex gap-1 justify-content-end">
                  <table-actions id="ta-mobile-${inc.id}"></table-actions>
                </div>
              </div>
            </div>`;
          })
          .join('');

        // Wait for kebab hydration so the dropdown menu is in the DOM
        // before renderTabla returns.
        await hydrateKebabActions(cards, datos, {
          slugs: { update: 'incidents.update', delete: 'incidents.delete' },
          showView: false,
          itemTitle: (inc) => inc.title || 'Sin título',
        });
      }

      const desde = (paginaActual - 1) * POR_PAGINA + 1;
      const hasta = Math.min(paginaActual * POR_PAGINA, total);
      document.getElementById('info-resultados').textContent =
        `Mostrando ${desde}–${hasta} de ${total} incidencias`;

      renderPaginacion(
        document.getElementById('paginacion'),
        paginaActual,
        totalPaginas,
        cargarIncidencias,
      );
      mostrarEstado('tabla');
    }

    async function cargarIncidencias(pagina) {
      paginaActual = pagina || 1;
      mostrarEstado('cargando');

      const buscar = document.getElementById('filtro-buscar').value.trim();
      const params = new URLSearchParams({
        page: paginaActual,
        per_page: POR_PAGINA,
        priority: document.getElementById('filtro-prioridad').value,
        status: document.getElementById('filtro-estado').value,
      });
      if (buscar) params.set('title', buscar);

      try {
        const resp = await http.get('/incidents?' + params.toString());
        const datos = resp.data || resp;
        const total = resp.meta?.total || datos.length;
        totalPaginas = Math.ceil(total / POR_PAGINA) || 1;
        renderTabla(datos, total);
      } catch {
        mostrarEstado('error');
      }
    }

    // Delegated click handler for kebab actions ([data-action="view|edit|delete"])
    async function manejarAcciones(e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const { id, titulo, action } = target.dataset;
      e.preventDefault();
      if (action === 'view') {
        router.navigate('/incidencias/' + id);
        return;
      }
      if (action === 'edit') {
        router.navigate('/incidencias/crear?id=' + id);
        return;
      }
      if (action === 'delete') {
        idEliminar = id;
        document.getElementById('modal-eliminar-titulo').textContent = titulo;
        new bootstrap.Modal(document.getElementById('modal-eliminar')).show();
        return;
      }
    }

    const tablaBody = document.getElementById('tabla-body');
    const contenedorCards = document.getElementById('contenedor-cards');

    tablaBody.addEventListener('click', manejarAcciones);
    contenedorCards.addEventListener('click', manejarAcciones);

    // Double-click handlers: abrir detalle
    function manejarDobleClic(e) {
      const fila = e.target.closest('.lista-row, .lista-card');
      if (!fila) return;
      const id = fila.dataset.id;
      if (id) router.navigate('/incidencias/' + id);
    }

    document
      .getElementById('tabla-body')
      .addEventListener('dblclick', manejarDobleClic);
    document
      .getElementById('contenedor-cards')
      .addEventListener('dblclick', manejarDobleClic);

    document
      .getElementById('btn-confirmar-eliminar')
      .addEventListener('click', async function () {
        if (!idEliminar) return;
        document.getElementById('eliminar-texto').classList.add('d-none');
        document.getElementById('eliminar-loading').classList.remove('d-none');
        this.disabled = true;

        try {
          await http.delete('/incidents/' + idEliminar);
          bootstrap.Modal.getInstance(
            document.getElementById('modal-eliminar'),
          ).hide();
          mostrarToast('Incidencia eliminada correctamente.', 'success');
          cargarIncidencias(paginaActual);
        } catch {
          mostrarToast('No se pudo eliminar la incidencia.', 'danger');
        } finally {
          document.getElementById('eliminar-texto').classList.remove('d-none');
          document.getElementById('eliminar-loading').classList.add('d-none');
          document.getElementById('btn-confirmar-eliminar').disabled = false;
        }
      });

    // Filter handlers
    document
      .getElementById('btn-filtrar')
      .addEventListener('click', () => cargarIncidencias(1));
    document
      .getElementById('filtro-buscar')
      .addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cargarIncidencias(1);
      });
    document.getElementById('btn-limpiar').addEventListener('click', () => {
      document.getElementById('filtro-buscar').value = '';
      clearSelect('filtro-prioridad');
      clearSelect('filtro-estado');
      cargarIncidencias(1);
    });
    document
      .getElementById('btn-reintentar')
      .addEventListener('click', () => cargarIncidencias(paginaActual));

    // ─── Tom Select en filtros ─────────────────────────────────────────
    initSelect('filtro-prioridad', { placeholder: 'Prioridad...' });
    initSelect('filtro-estado', { placeholder: 'Estado...' });

    // "Nueva incidencia" is the sole entry point to /incidencias/crear now
    // (menu_id 4 was removed from MenuSeeder) — its permission gate moved
    // here client-side. Fail closed: no confirmed permission, stays hidden.
    // SC-127: Validar incidents.create, no incidents.manage.
    // admin_sistema gestiona/aprueba, no reporta incidencias.
    let permisos;
    try {
      permisos = await permissionService.getMyPermissions();
    } catch {
      permisos = new Set();
    }
    if (permisos.has('incidents.create')) {
      document
        .getElementById('btn-nueva-incidencia')
        ?.classList.remove('d-none');
      document
        .getElementById('btn-registrar-primera')
        ?.classList.remove('d-none');
    }

    await cargarIncidencias(1);
  },

  onDestroy() {
    destroyAll();
  },
};
