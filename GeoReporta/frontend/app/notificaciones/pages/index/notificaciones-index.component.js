import template from './notificaciones-index.component.html?raw';
import { notificationService } from '../../../shared/notification.service.js';
import { auth } from '../../../auth/auth.service.js';
import { mostrarToast, mostrarEstado, isDesktop } from '../../../utils/ui.js';
import { formatearFecha, escapeHtml } from '../../../utils/format.js';
import { renderPaginacion } from '../../../shared/pagination/pagination.js';
import {
  initSelect,
  clearSelect,
  destroyAll,
} from '../../../shared/select-search.js';

const POR_PAGINA = 20;

const component = {
  template,

  // Instance state — these are set on the instance in onInit
  currentTab: 'pending',
  _paginaActual: 1,
  _totalPaginas: 1,
  _idRechazar: null,
  _isAdminSistema: false,
  _cargarFn: null,

  async onInit() {
    // Reset module-level singleton state on every re-init so values from
    // a previous navigation never leak into the new instance.
    this.currentTab = 'pending';
    this._paginaActual = 1;
    this._totalPaginas = 1;
    this._idRechazar = null;

    // Cache the current user role for filter visibility and action buttons
    let currentUser = null;
    try {
      currentUser = await auth.me();
    } catch {
      currentUser = null;
    }
    this._isAdminSistema = currentUser?.role === 'admin_sistema';

    // Show/hide organization filter for admin_sistema only
    const orgFilterWrap = document.getElementById('filtro-organizacion-wrap');
    if (orgFilterWrap) {
      orgFilterWrap.classList.toggle('d-none', !this._isAdminSistema);
    }

    // Initialize Tom Select for organization filter
    initSelect('filtro-organizacion', {
      placeholder: 'Organización...',
      allowClear: true,
    });

    // Wire tab switching
    document.querySelectorAll('.nav-link[data-tab]').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = tab.dataset.tab;
        this.currentTab = tabName;

        // Update active tab UI
        document.querySelectorAll('.nav-link[data-tab]').forEach((t) => {
          t.classList.toggle('active', t.dataset.tab === tabName);
        });

        this._cargarPagina(1);
      });
    });

    // Filter handlers
    const btnFiltrar = document.getElementById('btn-filtrar');
    if (btnFiltrar) {
      btnFiltrar.addEventListener('click', () => this._cargarPagina(1));
    }
    const btnLimpiar = document.getElementById('btn-limpiar');
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        clearSelect('filtro-organizacion');
        this._cargarPagina(1);
      });
    }
    const btnReintentar = document.getElementById('btn-reintentar');
    if (btnReintentar) {
      btnReintentar.addEventListener('click', () =>
        this._cargarPagina(this._paginaActual),
      );
    }

    // Action delegation: approve/reject buttons on table and cards.
    // Both elements are required for delegated handlers to work — if
    // either is missing, skip silently instead of throwing.
    const tablaBody = document.getElementById('tabla-body');
    const contenedorCards = document.getElementById('contenedor-cards');
    if (tablaBody) {
      tablaBody.addEventListener('click', (e) => this._manejarAcciones(e));
    }
    if (contenedorCards) {
      contenedorCards.addEventListener('click', (e) =>
        this._manejarAcciones(e),
      );
    }

    // Confirm reject button
    const btnConfirmarRechazar = document.getElementById(
      'btn-confirmar-rechazar',
    );
    if (btnConfirmarRechazar) {
      btnConfirmarRechazar.addEventListener('click', async () => {
        if (!this._idRechazar) return;
        const reason = document.getElementById('rechazo-motivo')?.value?.trim();
        if (!reason) {
          mostrarToast('El motivo del rechazo es obligatorio.', 'danger');
          return;
        }

        document.getElementById('rechazo-texto').classList.add('d-none');
        document.getElementById('rechazo-loading').classList.remove('d-none');
        btnConfirmarRechazar.disabled = true;

        try {
          await notificationService.reject(this._idRechazar, reason);
          // bootstrap.Modal.getInstance() can return null if the modal
          // was never shown or was already torn down — guard so a
          // successful reject doesn't throw an uncaught TypeError.
          const modalEl = document.getElementById('modal-rechazar');
          const modalInstance = modalEl
            ? bootstrap.Modal.getInstance(modalEl)
            : null;
          if (modalInstance) modalInstance.hide();
          mostrarToast('Rechazada correctamente.', 'success');
          const motivoEl = document.getElementById('rechazo-motivo');
          if (motivoEl) motivoEl.value = '';
          this._idRechazar = null;
          this._cargarPagina(this._paginaActual);
        } catch {
          mostrarToast('No se pudo rechazar la notificación.', 'danger');
        } finally {
          document.getElementById('rechazo-texto').classList.remove('d-none');
          document.getElementById('rechazo-loading').classList.add('d-none');
          btnConfirmarRechazar.disabled = false;
        }
      });
    }

    // Initial load
    this._cargarPagina(1);
  },

  _manejarAcciones(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    e.preventDefault();

    if (action === 'approve') {
      this._handleApprove(id);
    } else if (action === 'reject') {
      this._idRechazar = id;
      const modal = new bootstrap.Modal(
        document.getElementById('modal-rechazar'),
      );
      modal.show();
    }
  },

  async _handleApprove(id) {
    try {
      await notificationService.approve(id);
      // Remove row/card from DOM
      const row = document.querySelector(`tr[data-id="${id}"]`);
      if (row) row.remove();
      const card = document.querySelector(`.lista-card[data-id="${id}"]`);
      if (card) card.remove();
      mostrarToast('Aprobada correctamente.', 'success');
    } catch {
      mostrarToast('No se pudo aprobar la notificación.', 'danger');
    }
  },

  _renderTabla(datos, total) {
    if (!datos || datos.length === 0) {
      mostrarEstado('vacio');
      return;
    }

    const esDesktop = isDesktop();
    const tbody = document.getElementById('tabla-body');
    const cards = document.getElementById('contenedor-cards');

    if (esDesktop) {
      tbody.innerHTML = datos
        .map((notif) => {
          const titulo = notif.data?.title || notif.title || 'Sin título';
          const tipo = notif.type || 'incident_pending_approval';
          const leida = notif.read_at != null;
          const createdAt = notif.created_at
            ? formatearFecha(notif.created_at)
            : '—';
          const organizationName =
            notif.data?.organization?.name || notif.organization?.name || '—';

          return `<tr data-id="${notif.id}" class="lista-row ${leida ? '' : 'fw-semibold'}">
            <td class="text-center">
              ${
                !leida
                  ? '<span class="badge bg-primary rounded-circle" style="width:8px;height:8px;padding:0;"></span>'
                  : ''
              }
            </td>
            <td>
              <div style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(titulo)}">
                ${escapeHtml(titulo)}
              </div>
              <small class="text-muted">${escapeHtml(organizationName)}</small>
            </td>
            <td class="small text-muted">${escapeHtml(createdAt)}</td>
            <td class="text-center">
              ${
                tipo === 'incident_pending_approval'
                  ? `<button class="btn btn-sm btn-success me-1" data-action="approve" data-id="${notif.id}" title="Aprobar">
                       <i class="fa-solid fa-check"></i>
                     </button>
                     <button class="btn btn-sm btn-outline-danger" data-action="reject" data-id="${notif.id}" title="Rechazar">
                       <i class="fa-solid fa-xmark"></i>
                     </button>`
                  : '—'
              }
            </td>
          </tr>`;
        })
        .join('');

      cards.innerHTML = '';
    } else {
      tbody.innerHTML = '';
      cards.innerHTML = datos
        .map((notif) => {
          const titulo = notif.data?.title || notif.title || 'Sin título';
          const tipo = notif.type || 'incident_pending_approval';
          const leida = notif.read_at != null;
          const createdAt = notif.created_at
            ? formatearFecha(notif.created_at)
            : '—';
          const organizationName =
            notif.data?.organization?.name || notif.organization?.name || '—';

          return `
          <div class="card mb-2 shadow-sm lista-card" data-id="${notif.id}" style="cursor:pointer;">
            <div class="card-body p-2">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div class="flex-grow-1 me-2">
                  <h6 class="mb-0" style="font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(titulo)}</h6>
                  <small class="text-muted">${escapeHtml(organizationName)}</small>
                </div>
                ${
                  !leida
                    ? '<span class="badge bg-primary rounded-circle" style="width:8px;height:8px;padding:0;flex-shrink:0;"></span>'
                    : ''
                }
              </div>
              <div class="small text-muted mb-2">${escapeHtml(createdAt)}</div>
              ${
                tipo === 'incident_pending_approval'
                  ? `<div class="d-flex gap-1 justify-content-end">
                       <button class="btn btn-sm btn-success" data-action="approve" data-id="${notif.id}" title="Aprobar">
                         <i class="fa-solid fa-check"></i> Aprobar
                       </button>
                       <button class="btn btn-sm btn-outline-danger" data-action="reject" data-id="${notif.id}" title="Rechazar">
                         <i class="fa-solid fa-xmark"></i> Rechazar
                       </button>
                     </div>`
                  : ''
              }
            </div>
          </div>`;
        })
        .join('');
    }

    const desde = (this._paginaActual - 1) * POR_PAGINA + 1;
    const hasta = Math.min(this._paginaActual * POR_PAGINA, total);
    const infoEl = document.getElementById('info-resultados');
    if (infoEl) {
      infoEl.textContent = `Mostrando ${desde}–${hasta} de ${total} notificaciones`;
    }

    renderPaginacion(
      document.getElementById('paginacion'),
      this._paginaActual,
      this._totalPaginas,
      (pag) => this._cargarPagina(pag),
    );
    mostrarEstado('tabla');
  },

  async _cargarPagina(pagina) {
    this._paginaActual = pagina || 1;
    mostrarEstado('cargando');

    const orgId = document.getElementById('filtro-organizacion')?.value || null;
    const params = {
      page: this._paginaActual,
      perPage: POR_PAGINA,
    };
    if (orgId) params.organizationId = orgId;

    try {
      let resp;
      if (this.currentTab === 'pending') {
        resp = await notificationService.getPendingApprovals(params);
      } else {
        resp = await notificationService.list({
          page: this._paginaActual,
          perPage: POR_PAGINA,
          unreadOnly: this.currentTab === 'read',
        });
      }
      const datos = resp.data || [];
      const total = resp.meta?.total || datos.length;
      this._totalPaginas = Math.ceil(total / POR_PAGINA) || 1;
      this._renderTabla(datos, total);
    } catch {
      mostrarEstado('error');
    }
  },

  onDestroy() {
    destroyAll();
  },
};

export default component;
