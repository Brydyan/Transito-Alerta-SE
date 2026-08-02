import { http } from '../core/http.service.js';
import { router } from '../core/router.js';
import { renderPaginacion } from './pagination/pagination.js';
import { isForbidden } from './forbidden.js';
import { hydrateKebabActions } from './kebab-actions.js';
import { isDesktop, mostrarEstado, mostrarToast } from '../utils/ui.js';

/**
 * Skeleton shared by the configuración CRUD index pages (categorías,
 * roles, organizaciones, usuarios). Each page was a full copy of the same
 * load → render table/cards → paginate → delete-modal loop, diverging only
 * in endpoint, row/card markup, filters and routes — exactly what the
 * config object captures.
 *
 * DOM contract (ids every index template already uses): #tabla-body,
 * #contenedor-cards, #info-resultados, #paginacion, #filtro-buscar,
 * #btn-filtrar, #btn-limpiar, #btn-reintentar, #modal-eliminar,
 * #modal-eliminar-nombre, #btn-confirmar-eliminar, #eliminar-texto,
 * #eliminar-loading, plus the #estado-* containers from mostrarEstado.
 *
 * @param {object} config
 * @param {string} config.endpoint  API resource path (e.g. '/roles') —
 *   used for both the paginated GET and the DELETE.
 * @param {number} [config.porPagina]
 * @param {{update: string, delete: string}} config.slugs  kebab-actions
 *   permission slugs.
 * @param {boolean} [config.showView]
 * @param {(item: object) => string} config.buildRow  `<tr>` html; must
 *   include `<table-actions id="ta-desktop-${item.id}">`.
 * @param {(item: object) => string} config.buildCard  Mobile card html;
 *   must include `<table-actions id="ta-mobile-${item.id}">`.
 * @param {(item: object) => string} [config.itemTitle]
 * @param {() => Record<string, string>} [config.filters]  Extra query
 *   params — each page keeps its exact empty-string semantics.
 * @param {() => void} [config.clearFilters]  Reset the filter inputs.
 * @param {(id: string|number) => string} config.viewPath
 * @param {(id: string|number) => string} config.editPath
 * @param {string} config.deleteOkMsg
 * @returns {{ init: () => void, cargar: (pagina?: number) => Promise<void> }}
 */
export function createCrudIndexPage({
  endpoint,
  porPagina = 15,
  slugs,
  showView = false,
  buildRow,
  buildCard,
  itemTitle = (item) => item.name,
  filters = () => ({}),
  clearFilters = () => {},
  viewPath,
  editPath,
  deleteOkMsg,
}) {
  let paginaActual = 1;
  let totalPaginas = 1;
  let idEliminar = null;
  let unsubscribeKebab = null;

  async function renderKebabEn(container, datos) {
    if (unsubscribeKebab) {
      unsubscribeKebab();
      unsubscribeKebab = null;
    }
    unsubscribeKebab = await hydrateKebabActions(container, datos, {
      slugs,
      showView,
      itemTitle,
    });
  }

  function renderTabla(datos, total) {
    if (!datos || datos.length === 0) {
      mostrarEstado('vacio');
      return;
    }

    const esDesktop = isDesktop();
    const tbody = document.getElementById('tabla-body');
    const cards = document.getElementById('contenedor-cards');

    if (esDesktop) {
      tbody.innerHTML = datos.map(buildRow).join('');
      cards.innerHTML = '';
      renderKebabEn(tbody, datos);
    } else {
      tbody.innerHTML = '';
      cards.innerHTML = datos.map(buildCard).join('');
      renderKebabEn(cards, datos);
    }

    const desde = (paginaActual - 1) * porPagina + 1;
    const hasta = Math.min(paginaActual * porPagina, total);
    document.getElementById('info-resultados').textContent =
      `Mostrando ${desde}–${hasta} de ${total}`;
    renderPaginacion(
      document.getElementById('paginacion'),
      paginaActual,
      totalPaginas,
      cargar,
    );
    mostrarEstado('tabla');
  }

  async function cargar(pagina = 1) {
    paginaActual = pagina;
    mostrarEstado('cargando');
    const params = new URLSearchParams({
      page: paginaActual,
      per_page: porPagina,
      ...filters(),
    });
    try {
      const resp = await http.get(endpoint + '?' + params.toString());
      const datos = resp.data ?? resp;
      const total = resp.meta?.total ?? resp.total ?? datos.length;
      totalPaginas = Math.ceil(total / porPagina) || 1;
      renderTabla(datos, total);
    } catch (err) {
      // Defense in depth (R-24): distinguish 403 from generic failure.
      if (isForbidden(err)) {
        mostrarToast('No tienes acceso a este recurso.', 'warning');
      }
      mostrarEstado('error');
    }
  }

  // Single delegated click listener: catches [data-action="view|edit|delete"]
  // anywhere inside the rendered table body or mobile cards container.
  function manejarAccionesDelegadas(e, target) {
    const id = target.dataset.id;
    const titulo = target.dataset.titulo;
    if (target.dataset.action === 'view') {
      router.navigate(viewPath(id));
      return;
    }
    if (target.dataset.action === 'edit') {
      router.navigate(editPath(id));
      return;
    }
    if (target.dataset.action === 'delete') {
      idEliminar = id;
      document.getElementById('modal-eliminar-nombre').textContent = titulo;
      new bootstrap.Modal(document.getElementById('modal-eliminar')).show();
    }
  }

  function onContainerClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    e.preventDefault();
    manejarAccionesDelegadas(e, target);
  }

  function init() {
    const tablaBody = document.getElementById('tabla-body');
    const contenedorCards = document.getElementById('contenedor-cards');

    tablaBody.addEventListener('click', onContainerClick);
    contenedorCards.addEventListener('click', onContainerClick);

    document
      .getElementById('btn-confirmar-eliminar')
      .addEventListener('click', async function () {
        if (!idEliminar) return;
        document.getElementById('eliminar-texto').classList.add('d-none');
        document.getElementById('eliminar-loading').classList.remove('d-none');
        this.disabled = true;
        try {
          await http.delete(endpoint + '/' + idEliminar);
          bootstrap.Modal.getInstance(
            document.getElementById('modal-eliminar'),
          )?.hide();
          mostrarToast(deleteOkMsg, 'success');
          cargar(paginaActual);
        } catch {
          mostrarToast('No se pudo eliminar.', 'danger');
        } finally {
          document.getElementById('eliminar-texto').classList.remove('d-none');
          document.getElementById('eliminar-loading').classList.add('d-none');
          document.getElementById('btn-confirmar-eliminar').disabled = false;
        }
      });

    document
      .getElementById('btn-filtrar')
      .addEventListener('click', () => cargar(1));
    document
      .getElementById('filtro-buscar')
      .addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cargar(1);
      });
    document.getElementById('btn-limpiar').addEventListener('click', () => {
      document.getElementById('filtro-buscar').value = '';
      clearFilters();
      cargar(1);
    });
    document
      .getElementById('btn-reintentar')
      .addEventListener('click', () => cargar(paginaActual));

    cargar(1);
  }

  return { init, cargar };
}
