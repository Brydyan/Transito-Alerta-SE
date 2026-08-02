import template from './incidencias.detail.component.html?raw';
import style from './incidencias.detail.component.css?raw';
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  escapeHtml,
} from '../../../utils/format.js';
import { http } from '../../../core/http.service.js';
import { router } from '../../../core/router.js';
import { auth } from '../../../auth/auth.service.js';
import setupCommentsForm from '../../../shared/setup-comments-form.js';
import initMapView from '../../../shared/init-map-view.js';
import { assignmentService } from '../../../shared/assignment.service.js';
import { permissionService } from '../../../shared/permission.service.js';
import { notificationService } from '../../../shared/notification.service.js';
import { mostrarToast } from '../../../utils/ui.js';
import {
  sortStatusHistoryDesc,
  statusHistoryEntry,
} from '../../../utils/status-history.js';

// CP-02-04-F: transiciones válidas por estado actual
const VALID_TRANSITIONS = {
  pending: ['in_progress'],
  in_progress: ['resolved'],
  resolved: [],
};

// CP-02-01-F: todos los estados visibles en dropdown (Cerrado sin soporte backend)
const DROPDOWN_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En Proceso' },
  { value: 'resolved', label: 'Resuelto' },
  { value: 'closed', label: 'Cerrado' },
];

export default {
  style,
  template,

  async onInit({ params } = {}) {
    const id = params?.id;
    if (!id) {
      router.navigate('/incidencias');
      return;
    }

    this._incidentId = id;
    let inc;
    try {
      inc = await cargarIncidencia(id);
    } catch {
      router.navigate('/not-found');
      return;
    }
    renderizarIncidencia(inc);
    renderizarImagenes(inc.images ?? []);
    setupUpload(id);
    setupActionButtons(id, inc);
    setupEstado(id, inc);
    renderHistorial(inc.status_history ?? []);
    setupComments(id, inc.comments);
    setupAssignments(id, inc, inc.assignments);
    setupAuditar(id, inc);
  },

  onDestroy() {
    const mapEl = document.getElementById('detalle-coords');
    if (!mapEl) return;
    // The disposer returned by initMapView() captures the L.Map in its
    // closure and also disconnects the ResizeObserver. Calling
    // `map.remove()` again on the same map (via `mapEl._leaflet_map`)
    // throws "Map container is being reused by another instance" from
    // Leaflet, because the second call sees a container that has
    // already been detached by the first. The disposer is the single
    // source of truth for teardown.
    if (typeof mapEl._leaflet_dispose === 'function') {
      mapEl._leaflet_dispose();
      delete mapEl._leaflet_dispose;
    }
  },
};

async function cargarIncidencia(id) {
  document.getElementById('detalle-loading').classList.remove('d-none');
  document.getElementById('detalle-content').classList.add('d-none');

  try {
    const resp = await http.get(`/incidents/${id}`);
    const inc = resp.data ?? resp;
    return inc;
  } catch (err) {
    console.error('Error al cargar incidencia:', err);
    document.getElementById('detalle-loading').innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Error al cargar la incidencia. <a href="#/incidencias" class="alert-link">Volver</a>
      </div>`;
    throw err;
  }
}

function renderizarIncidencia(inc) {
  const fechaTexto = inc.created_at
    ? new Date(inc.created_at).toLocaleDateString('es-EC', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const usuarioTexto = inc.user
    ? [inc.user.first_name, inc.user.last_name].filter(Boolean).join(' ')
    : '—';

  // Toggle loading vs content in one shot.
  document.getElementById('detalle-loading').classList.toggle('d-none', true);
  document.getElementById('detalle-content').classList.toggle('d-none', false);

  // Plain text fields.
  document.getElementById('detalle-titulo').textContent =
    inc.title ?? 'Sin título';
  document.getElementById('detalle-breadcrumb').textContent =
    inc.title ?? 'Detalle';
  document.getElementById('detalle-priority').textContent =
    PRIORITY_LABEL[inc.priority] ?? inc.priority;
  document.getElementById('detalle-fecha').textContent = fechaTexto;
  document.getElementById('detalle-descripcion').textContent =
    inc.description ?? 'Sin descripción';
  document.getElementById('detalle-categoria').textContent =
    inc.category?.name ?? '—';
  document.getElementById('detalle-ubicacion').textContent =
    inc.location?.name ?? '—';
  document.getElementById('detalle-usuario').textContent = usuarioTexto;
  document.getElementById('detalle-organizacion').textContent =
    inc.organization?.name ?? '—';

  // Status badge: text + dynamic className based on the status.
  const statusEl = document.getElementById('detalle-status');
  statusEl.textContent = STATUS_LABEL[inc.status] ?? inc.status;
  statusEl.className = `ig-status-badge ig-status-${inc.status}`;

  // Thumbnail: shown only when the backend provides a URL.
  const thumbEl = document.getElementById('detalle-thumbnail');
  if (inc.thumbnail_url) {
    thumbEl.innerHTML = `<img src="${inc.thumbnail_url}" alt="Thumbnail" class="img-fluid rounded incid-detail__thumbnail-img" />`;
    thumbEl.classList.toggle('d-none', false);
  } else {
    thumbEl.classList.toggle('d-none', true);
  }

  renderMap(inc);
}

async function renderMap(inc) {
  const mapEl = document.getElementById('detalle-coords');
  if (!inc.geom?.coordinates) {
    mapEl.innerHTML =
      '<p class="text-muted text-center py-4 mb-0">Sin coordenadas</p>';
    return;
  }

  const [lng, lat] = inc.geom.coordinates;

  // Inject the canvas div BEFORE the async Leaflet load so the container
  // keeps its height and there is no blank-white flash while tiles fetch.
  mapEl.innerHTML =
    '<div id="detalle-mapa" class="incid-detail__map-canvas"></div>';

  const { map, remove } = await initMapView({
    container: 'detalle-mapa',
    center: { lat, lng },
    zoom: 15,
    liveInputs: false,
    errorClass: 'incid-detail__map-error',
  });
  if (!map) return;

  L.marker([lat, lng]).addTo(map);

  // Store map reference and disposer for cleanup
  mapEl._leaflet_map = map;
  mapEl._leaflet_dispose = remove;
}

function renderizarImagenes(images) {
  const container = document.getElementById('detalle-imagenes');
  const emptyEl = document.getElementById('detalle-sin-imagenes');

  if (!images || images.length === 0) {
    emptyEl?.classList.remove('d-none');
    return;
  }

  emptyEl?.classList.add('d-none');
  container.innerHTML = images
    .map(
      (img) => `
    <div class="mb-2 position-relative">
      <a href="${img.url}" target="_blank">
        <img src="${img.url}" alt="${img.original_name}" class="img-fluid rounded incid-detail__image" />
      </a>
      <small class="text-muted d-block text-truncate mt-1">${img.original_name}</small>
    </div>`,
    )
    .join('');
}

function setupUpload(incidentId) {
  const fileInput = document.getElementById('detalle-file-input');
  const btnSubir = document.getElementById('btn-subir-imagen');
  const progress = document.getElementById('detalle-upload-progress');

  if (!fileInput || !btnSubir) return;

  btnSubir.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    btnSubir.disabled = true;
    progress.classList.remove('d-none');

    try {
      const formData = new FormData();
      formData.append('images[]', file);

      // Upload via PATCH to the incident endpoint
      const resp = await http.request(
        'PATCH',
        `/incidents/${incidentId}`,
        formData,
      );

      fileInput.value = '';
      btnSubir.disabled = true;
      progress.classList.add('d-none');

      const toast = new bootstrap.Toast(
        document.getElementById('toast-imagen'),
        { delay: 2000 },
      );
      toast.show();

      // Refresh images from the updated incident
      const images = resp.data?.images ?? [];
      renderizarImagenes(images);
    } catch (err) {
      console.error('Error al subir imagen:', err);
      alert(
        'Error al subir la imagen. Verifique que sea JPEG, PNG o WEBP y que no supere 10 MB.',
      );
    } finally {
      btnSubir.disabled = false;
      progress.classList.add('d-none');
    }
  });
}

// ── Gestión de Estado (CP-02-01-F / 02-02-F / 02-04-F / 02-05-F) ──

function setupEstado(incidentId, inc) {
  const select = document.getElementById('detalle-estado-select');
  const btnGuardar = document.getElementById('btn-guardar-estado');
  const btnTexto = document.getElementById('btn-estado-texto');
  const btnLoading = document.getElementById('btn-estado-loading');
  const errorEl = document.getElementById('detalle-estado-error');
  const errorMsg = document.getElementById('detalle-estado-msg');
  const resolucionEl = document.getElementById('detalle-resolucion');
  const fechaResEl = document.getElementById('detalle-fecha-resolucion');

  if (!select || !btnGuardar) return;

  const currentStatus = inc.status;
  const validNext = VALID_TRANSITIONS[currentStatus] ?? [];

  // CP-02-01-F: mostrar todos los estados; CP-02-04-F: deshabilitar inválidos
  select.innerHTML = DROPDOWN_STATUSES.map(({ value, label }) => {
    const isCurrent = value === currentStatus;
    const isValid = validNext.includes(value);
    const disabled = isCurrent || !isValid;
    return `<option value="${value}"${isCurrent ? ' selected' : ''}${disabled ? ' disabled' : ''}>${label}${isCurrent ? ' (actual)' : ''}</option>`;
  }).join('');

  if (validNext.length === 0) {
    btnGuardar.disabled = true;
    select.disabled = true;
  }

  // CP-02-05-F: mostrar fecha resolución si ya está resuelto
  if (currentStatus === 'resolved' && inc.resolution_date) {
    resolucionEl.classList.remove('d-none');
    fechaResEl.textContent = new Date(inc.resolution_date).toLocaleString(
      'es-EC',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    );
  }

  // CP-02-02-F: guardar nuevo estado
  btnGuardar.addEventListener('click', async () => {
    const newStatus = select.value;
    if (!validNext.includes(newStatus)) return;

    btnTexto.classList.add('d-none');
    btnLoading.classList.remove('d-none');
    btnGuardar.disabled = true;
    errorEl.classList.add('d-none');

    try {
      const payload = { status: newStatus };

      if (newStatus === 'resolved') {
        payload.resolution_date = new Date().toISOString();
      }
      await http.put(`/incidents/${incidentId}`, payload);

      // Actualización reactiva SPA (sin recargar la página completa)
      const res = await http.get(`/incidents/${incidentId}`);
      const updatedInc = res.data ?? res;

      const statusEl = document.getElementById('detalle-status');
      if (statusEl) {
        statusEl.textContent =
          STATUS_LABEL[updatedInc.status] ?? updatedInc.status;
        statusEl.className = `ig-status-badge ig-status-${updatedInc.status}`;
      }

      setupEstado(incidentId, updatedInc);
      renderHistorial(updatedInc.status_history ?? []);
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      errorMsg.textContent = err.message || 'No se pudo cambiar el estado.';
      errorEl.classList.remove('d-none');
    } finally {
      btnTexto.classList.remove('d-none');
      btnLoading.classList.add('d-none');
      btnGuardar.disabled = false;
    }
  });
}

// ── Historial de estados (CP-02-03-F) ──────────────────────

/**
 * Renders the status history list from a pre-loaded array.
 * Called with the data embedded in GET /incidents/:id so no extra
 * network request is needed on initial load.
 */
function renderHistorial(items) {
  const loadingEl = document.getElementById('detalle-historial-loading');
  const listEl = document.getElementById('detalle-historial-list');
  const vacioEl = document.getElementById('detalle-historial-vacio');

  if (!loadingEl || !listEl) return;

  loadingEl.classList.add('d-none');

  if (!items || items.length === 0) {
    vacioEl.classList.remove('d-none');
    return;
  }

  // más reciente primero (DESC)
  listEl.innerHTML = sortStatusHistoryDesc(items)
    .map((item) => {
      const { prev, next, userName } = statusHistoryEntry(item);
      const fecha = new Date(item.created_at).toLocaleString('es-EC', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      const isResolved = item.new_status === 'resolved';
      const borderClass = isResolved ? 'border-success' : 'border-primary';
      const notesHtml = item.notes
        ? `<div class="mt-1 p-2 rounded ${isResolved ? 'bg-success-subtle text-dark border border-success-subtle' : 'bg-light text-secondary'} small">
             <i class="fa-solid fa-sticky-note me-1 ${isResolved ? 'text-success' : 'text-muted'}"></i><strong>Notas:</strong> ${escapeHtml(item.notes)}
           </div>`
        : '';

      return `
        <div class="border-start border-2 ${borderClass} ps-3 mb-3">
          <div class="small fw-semibold">${prev} → ${next}</div>
          <div class="text-muted" style="font-size:0.75rem;">${userName} · ${fecha}</div>
          ${notesHtml}
        </div>`;
    })
    .join('');
}

// ── Comentarios públicos ────────────────────────────────────

async function setupComments(incidentId, initialComments) {
  return setupCommentsForm({
    incidentId,
    initialComments,
    loadingId: 'detalle-comments-loading',
    formId: 'detalle-comment-form',
    inputId: 'detalle-comment-input',
    submitId: 'detalle-comment-submit',
    counterId: 'detalle-comment-counter',
    listId: 'detalle-comments-list',
    emptyId: 'detalle-comments-vacio',
    errorId: 'detalle-comment-error',
    previewId: 'detalle-comment-previews',
    fileInputId: 'detalle-comment-images',
    attachButtonId: 'detalle-comment-attach-btn',
    replyBadgeId: 'detalle-reply-badge',
    replyParentIdId: 'detalle-reply-parent-id',
    lightboxId: 'incid-detail__lightbox',
    lightboxCloseId: 'incid-detail__lightbox-close',
    thumbnailSelector: '.incid-detail__thumbnail-wrapper[data-src]',
    canDelete: true,
    getUserName: (user) =>
      [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
  });
}

// ── Asignaciones de operadores (responsable/apoyo) ─────────

const ASSIGNMENT_ROLE_BADGE = {
  responsable: '<span class="badge bg-primary">Responsable</span>',
  apoyo: '<span class="badge bg-secondary">Apoyo</span>',
};

// Matches the default placeholder text in incidencias.detail.component.html
// (#detalle-asignaciones-vacio) — used to restore the empty-state message
// after a previous error render had overwritten it (see R4-003).
const ASSIGNMENTS_VACIO_TEXT = 'Sin operadores asignados.';

function buildAssignmentRow(assignment, canDelete) {
  const nombre = assignment.user
    ? [assignment.user.first_name, assignment.user.last_name]
        .filter(Boolean)
        .join(' ') || assignment.user.email
    : 'Usuario';
  // role/id are enum/int-constrained server-side today, but escaped here
  // for defense-in-depth consistency with `nombre` above.
  const badge =
    ASSIGNMENT_ROLE_BADGE[assignment.role] ??
    escapeHtml(String(assignment.role ?? ''));
  const btn = canDelete
    ? `<button type="button" class="btn btn-sm btn-outline-danger btn-eliminar-asignacion" data-id="${escapeHtml(String(assignment.id))}" title="Quitar asignación">
        <i class="fas fa-times"></i>
      </button>`
    : '';

  return `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div>
        <div class="small fw-semibold">${escapeHtml(nombre)}</div>
        <div>${badge}</div>
      </div>
      ${btn}
    </div>`;
}

/**
 * Renders the assignment list into #detalle-asignaciones-list, toggling
 * the empty-state placeholder as needed. Mirrors the fetch-function →
 * render-function split used for comments (buildCommentLi/renderComments)
 * so rendering can be tested independently of the network call.
 */
function renderAssignments(items, puedeEliminar) {
  const listEl = document.getElementById('detalle-asignaciones-list');
  const vacioEl = document.getElementById('detalle-asignaciones-vacio');
  if (!listEl) return;

  if (!items || items.length === 0) {
    listEl.innerHTML = '';
    if (vacioEl) {
      vacioEl.textContent = ASSIGNMENTS_VACIO_TEXT;
      vacioEl.classList.remove('d-none');
    }
    return;
  }

  vacioEl?.classList.add('d-none');
  listEl.innerHTML = items
    .map((a) => buildAssignmentRow(a, puedeEliminar))
    .join('');
}

/**
 * Populates the operator <select> by calling the dedicated endpoint
 * GET /incidents/:id/available-operators.
 *
 * The backend resolves the operador_organizacion role internally and
 * filters by the incident's organization, so the frontend no longer
 * needs two sequential requests (GET /roles → GET /users).
 */
async function cargarOperadores(inc, selectEl, submitBtn) {
  if (!selectEl) return;

  const setAvailability = (available) => {
    selectEl.disabled = !available;
    if (submitBtn) submitBtn.disabled = !available;
  };

  if (!inc.organization_id && !inc.organization?.id) {
    selectEl.innerHTML = '<option value="">Sin organización asignada</option>';
    setAvailability(false);
    return;
  }

  setAvailability(false);

  try {
    const resp = await http.get(`/incidents/${inc.id}/available-operators`);
    const usuarios = resp.data ?? [];

    if (usuarios.length === 0) {
      selectEl.innerHTML =
        '<option value="">Sin operadores disponibles</option>';
      return;
    }

    selectEl.innerHTML = usuarios
      .map((u) => {
        const nombre =
          [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
        return `<option value="${u.id}">${escapeHtml(nombre)}</option>`;
      })
      .join('');
    setAvailability(true);
  } catch (err) {
    console.error('Error al cargar operadores:', err);
    selectEl.innerHTML = '<option value="">Error al cargar operadores</option>';
  }
}

async function setupAssignments(incidentId, inc, initialAssignments = null) {
  const cardEl = document.getElementById('detalle-asignaciones-card');
  const loadingEl = document.getElementById('detalle-asignaciones-loading');
  const listEl = document.getElementById('detalle-asignaciones-list');
  const vacioEl = document.getElementById('detalle-asignaciones-vacio');
  const formEl = document.getElementById('detalle-asignaciones-form');
  const selectEl = document.getElementById('detalle-asignaciones-select');
  const errorEl = document.getElementById('detalle-asignaciones-error');
  const errorMsgEl = document.getElementById('detalle-asignaciones-msg');
  const submitBtn = document.getElementById('detalle-asignaciones-submit');

  if (!cardEl || !listEl) return;

  function showError(msg) {
    if (errorMsgEl) errorMsgEl.textContent = msg;
    errorEl?.classList.remove('d-none');
  }

  let permisos;
  try {
    permisos = await permissionService.getMyPermissions();
  } catch {
    permisos = new Set();
  }
  const puedeCrear = permisos.has('assignments.create');
  const puedeEliminar = permisos.has('assignments.delete');

  // Fetch-from-network used for post-mutation refreshes.
  async function cargarAsignaciones() {
    try {
      const { data } = await assignmentService.list(incidentId);
      loadingEl?.classList.add('d-none');
      renderAssignments(data, puedeEliminar);
    } catch (err) {
      console.error('Error al cargar asignaciones:', err);
      loadingEl?.classList.add('d-none');
      listEl.innerHTML = '';
      if (vacioEl) {
        vacioEl.textContent = 'Error al cargar asignaciones.';
        vacioEl.classList.remove('d-none');
      }
    }
  }

  if (puedeEliminar) {
    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-eliminar-asignacion');
      if (!btn) return;

      const assignmentId = btn.dataset.id;
      btn.disabled = true;
      errorEl?.classList.add('d-none');

      try {
        await assignmentService.remove(incidentId, assignmentId);
        await cargarAsignaciones();
      } catch (err) {
        showError(err.message || 'No se pudo eliminar la asignación.');
        btn.disabled = false;
      }
    });
  }

  if (puedeCrear && formEl) {
    formEl.classList.remove('d-none');
    cargarOperadores(inc, selectEl, submitBtn);

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitBtn?.disabled) return;
      errorEl?.classList.add('d-none');

      const userId = selectEl?.value;
      const role = formEl.querySelector(
        'input[name="asignacion-rol"]:checked',
      )?.value;
      if (!userId || !role) {
        showError('Seleccione un operador y un rol.');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        await assignmentService.create(incidentId, Number(userId), role);
        await cargarAsignaciones();
      } catch (err) {
        showError(err.message || 'No se pudo crear la asignación.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Initial render — use embedded data if available, otherwise fetch.
  if (initialAssignments != null) {
    loadingEl?.classList.add('d-none');
    renderAssignments(initialAssignments, puedeEliminar);
  } else {
    await cargarAsignaciones();
  }
}

// ── Claim / Release / Confirmar ────────────────────────────

function resolveRoleName(user) {
  if (!user?.role) return null;
  if (typeof user.role === 'string') return user.role;
  if (typeof user.role === 'object' && user.role?.name) return user.role.name;
  return null;
}

/**
 * Muestra/oculta botones de acción según el rol del usuario y el estado de la incidencia.
 */
function setupActionButtons(incidentId, inc) {
  const user = auth.getUser();
  if (!user) return;

  const roleName = resolveRoleName(user);
  if (!roleName) return;

  const actionsEl = document.getElementById('detalle-acciones');
  const claimActionsEl = document.getElementById('detalle-claim-actions');
  const confirmActionsEl = document.getElementById('detalle-confirm-actions');
  const loadingEl = document.getElementById('detalle-acciones-loading');
  const errorEl = document.getElementById('detalle-acciones-error');
  const errorMsgEl = document.getElementById('detalle-acciones-msg');
  const btnReclamar = document.getElementById('btn-reclamar');
  const btnLiberar = document.getElementById('btn-liberar');
  const btnConfirmar = document.getElementById('btn-confirmar');

  if (!actionsEl) return;

  function showError(msg) {
    if (errorMsgEl) errorMsgEl.textContent = msg;
    if (errorEl) errorEl.classList.remove('d-none');
    setTimeout(() => errorEl?.classList.add('d-none'), 5000);
  }

  function setLoading(on) {
    if (loadingEl) loadingEl.classList.toggle('d-none', !on);
    if (btnReclamar) btnReclamar.disabled = on;
    if (btnLiberar) btnLiberar.disabled = on;
    if (btnConfirmar) btnConfirmar.disabled = on;
  }

  // ── OperadorOrganizacion: Claim / Release ──
  if (roleName === 'operador_organizacion') {
    const userOrgId = user.organization?.id;
    const incOrgId = inc.organization?.id || inc.organization_id;

    // Solo si la incidencia pertenece a su org
    if (userOrgId && incOrgId && userOrgId === incOrgId) {
      actionsEl.classList.remove('d-none');

      if (!inc.claimed_by) {
        // Sin asignar → mostrar "Reclamar"
        claimActionsEl.classList.remove('d-none');
        btnLiberar?.classList.add('d-none');

        btnReclamar?.addEventListener('click', async () => {
          setLoading(true);
          try {
            await http.post(`/incidents/${incidentId}/claim`);
            window.location.reload();
          } catch (err) {
            showError(err.message || 'No se pudo reclamar la incidencia.');
          } finally {
            setLoading(false);
          }
        });
      } else if (inc.claimed_by === user.id) {
        // Asignada a mí → mostrar "Liberar"
        claimActionsEl.classList.remove('d-none');
        btnReclamar?.classList.add('d-none');

        btnLiberar?.addEventListener('click', async () => {
          setLoading(true);
          try {
            await http.post(`/incidents/${incidentId}/release`);
            window.location.reload();
          } catch (err) {
            showError(err.message || 'No se pudo liberar la incidencia.');
          } finally {
            setLoading(false);
          }
        });
      }
    }
  }

  // ── Publicador: Confirmar ──
  if (roleName === 'publicador') {
    const incOrgId = inc.organization?.id || inc.organization_id;

    // Solo si la incidencia NO tiene organización asignada
    if (!incOrgId) {
      actionsEl.classList.remove('d-none');
      confirmActionsEl.classList.remove('d-none');

      btnConfirmar?.addEventListener('click', async () => {
        setLoading(true);
        try {
          await http.post(`/incidents/${incidentId}/confirmar`);
          window.location.reload();
        } catch (err) {
          showError(
            err.message ||
              'No se pudo confirmar la incidencia. Puede que ya haya sido asignada.',
          );
        } finally {
          setLoading(false);
        }
      });
    }
  }
}

// ── Aprobar / Rechazar resolución (sc-123 / #150, inline card) ──

/**
 * Inline "Aprobar / Rechazar" card for admins. Visible only when the
 * incident is in 'resolved' state AND the current user is admin (any
 * admin can audit). Fetches the matching pending-approval notification
 * from the backend; if found, shows the action buttons. Aprobar is
 * one click; Rechazar opens the existing justificacion-rechazo-modal
 * to capture the reason, then submits.
 */
function setupAuditar(_incidentId, inc) {
  const cardEl = document.getElementById('detalle-auditar');
  if (!cardEl) return;

  const loadingEl = document.getElementById('detalle-auditar-loading');
  const sinNotifEl = document.getElementById('detalle-auditar-sin-notif');
  const actionsEl = document.getElementById('detalle-auditar-actions');
  const submittingEl = document.getElementById('detalle-auditar-submitting');
  const errorEl = document.getElementById('detalle-auditar-error');
  const errorMsgEl = document.getElementById('detalle-auditar-error-msg');
  const msgEl = document.getElementById('detalle-auditar-msg');
  const btnAprobar = document.getElementById('btn-auditar-aprobar');
  const btnRechazar = document.getElementById('btn-auditar-rechazar');

  let pendingNotifId = null;

  function showActions() {
    loadingEl?.classList.add('d-none');
    sinNotifEl?.classList.add('d-none');
    errorEl?.classList.add('d-none');
    actionsEl?.classList.remove('d-none');
    submittingEl?.classList.add('d-none');
    msgEl?.classList.remove('d-none');
  }

  // Load-time error: hides actions so the user can't click submit on
  // a card that never got a notification id.
  function showLoadError(msg) {
    if (errorMsgEl) errorMsgEl.textContent = msg;
    loadingEl?.classList.add('d-none');
    sinNotifEl?.classList.add('d-none');
    actionsEl?.classList.add('d-none');
    submittingEl?.classList.add('d-none');
    errorEl?.classList.remove('d-none');
    msgEl?.classList.add('d-none');
  }

  // Submit-time error: keep the action buttons visible so the user
  // can retry without reloading the page.
  function showSubmitError(msg) {
    if (errorMsgEl) errorMsgEl.textContent = msg;
    submittingEl?.classList.add('d-none');
    errorEl?.classList.remove('d-none');
  }

  function startSubmit() {
    actionsEl?.classList.add('d-none');
    errorEl?.classList.add('d-none');
    submittingEl?.classList.remove('d-none');
  }

  // Only admins can audit. The card is hidden by default (d-none in
  // HTML); we only ever unhide it after a confirmed role check. R7:
  // operador_organizacion may hold notifications.update but MUST NOT
  // see this card. Fail closed on any error.
  (async () => {
    if (inc.status !== 'resolved') return;

    let roleName = null;
    try {
      const me = await auth.me();
      roleName = resolveRoleName(me);
    } catch {
      return;
    }
    const isAdmin =
      roleName === 'admin_sistema' || roleName === 'admin_organizacion';
    if (!isAdmin) return;

    cardEl.classList.remove('d-none');
    loadingEl?.classList.remove('d-none');

    try {
      const resp = await notificationService.getPendingApprovals({
        page: 1,
        perPage: 100,
        unreadOnly: false,
      });
      const notifications = resp.data || [];
      const notif = notifications.find((n) => {
        const nid = n?.data?.incident_id ?? n?.incident_id;
        if (Number(nid) !== Number(inc.id)) return false;
        if (n?.type !== 'incident_pending_approval') return false;
        if (n?.processed_at) return false;
        return true;
      });
      if (!notif) {
        loadingEl?.classList.add('d-none');
        sinNotifEl?.classList.remove('d-none');
        msgEl?.classList.add('d-none');
        return;
      }
      pendingNotifId = notif.id;
      showActions();
    } catch (err) {
      showLoadError('No se pudo cargar la notificación pendiente.');
    }
  })();

  if (btnAprobar) {
    btnAprobar.addEventListener('click', async () => {
      if (!pendingNotifId) return;
      startSubmit();
      try {
        await notificationService.approve(pendingNotifId);
        mostrarToast('Resolución aprobada.', 'success');
        // SPA-reactive refresh: the PostgreSQL trigger has already written
        // the status_history row, so we just re-render with the fresh
        // incident payload (status badge / state dropdown / history).
        await refreshAfterAudit(_incidentId, 'approve');
      } catch (err) {
        showSubmitError(err?.message || 'No se pudo aprobar la resolución.');
        actionsEl?.classList.remove('d-none');
      }
    });
  }

  if (btnRechazar) {
    btnRechazar.addEventListener('click', async () => {
      if (!pendingNotifId) return;
      // Reuse the existing justificacion-rechazo-modal pattern: mount
      // it lazily if it isn't in the DOM yet (mirrors _openAuditModal
      // in the index page). show(callback) passes the trimmed reason.
      let modal = document.getElementById('justificacion-rechazo-modal');
      if (!modal) {
        await import('../../../shared/components/justificacion-rechazo-modal/justificacion-rechazo-modal.component.js');
        modal = document.createElement('justificacion-rechazo-modal');
        modal.id = 'justificacion-rechazo-modal';
        document.body.appendChild(modal);
        // Yield once so connectedCallback + _render can finish before show().
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await modal.show(async (reason) => {
        if (typeof reason !== 'string' || reason.trim().length === 0) return;
        startSubmit();
        try {
          await notificationService.reject(pendingNotifId, reason.trim());
          mostrarToast('Resolución rechazada.', 'success');
          await refreshAfterAudit(_incidentId, 'reject');
        } catch (err) {
          showSubmitError(err?.message || 'No se pudo rechazar la resolución.');
          actionsEl?.classList.remove('d-none');
        }
      });
    });
  }
}

// ── Buscar Responsables (CP-03-01-F) ────────────────────────────
// Card removed per product feedback (sc-123 / #150): with 1-3 responsibles
// in typical orgs the picker added noise without utility. The `Asignaciones`
// card below already exposes the operator select that powers assignment.

// ── Audit refresh helper (sc-123 / #150) ────────────────────────────

/**
 * Populates the rejection-reason banner from a refreshed incident payload.
 * Falls back to "—" for fields the backend may not expose via
 * IncidentResource today (rejection_reason / rejected_by / rejected_at);
 * the UI degrades gracefully and the banner stays hidden if everything is
 * empty.
 */
function populateRejectionBanner(updatedInc) {
  const reasonEl = document.getElementById('detalle-rejection-reason');
  const byEl = document.getElementById('detalle-rejection-by');
  const atEl = document.getElementById('detalle-rejection-at');

  if (reasonEl) reasonEl.textContent = updatedInc.rejection_reason || '';

  const rejectedBy =
    updatedInc.rejected_by_user?.name || updatedInc.rejected_by?.name || '—';
  if (byEl) byEl.textContent = rejectedBy;

  if (atEl && updatedInc.rejected_at) {
    atEl.textContent = new Date(updatedInc.rejected_at).toLocaleString(
      'es-EC',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    );
  }
}

/**
 * SPA-reactive refresh after Aprobar / Rechazar. Mirrors the pattern used
 * by setupEstado (status_history is already persisted server-side by the
 * PostgreSQL trigger on every UPDATE of incidents.status).
 */
async function refreshAfterAudit(
  incidentId,
  action /* 'approve' | 'reject' */,
) {
  try {
    const res = await http.get(`/incidents/${incidentId}`);
    const updatedInc = res.data ?? res;

    // 1. Status badge
    const statusEl = document.getElementById('detalle-status');
    if (statusEl) {
      statusEl.textContent =
        STATUS_LABEL[updatedInc.status] ?? updatedInc.status;
      statusEl.className = `ig-status-badge ig-status-${updatedInc.status}`;
    }

    // 2. State dropdown (valid transitions change)
    setupEstado(incidentId, updatedInc);

    // 3. Status history (server trigger already wrote the row)
    renderHistorial(updatedInc.status_history ?? []);

    // 4. Re-render incident header (in case other fields changed)
    renderizarIncidencia(updatedInc);

    // 5. Audit card: hide (state no longer 'resolved')
    const auditCard = document.getElementById('detalle-auditar');
    if (auditCard) auditCard.classList.add('d-none');

    // 6. Rejection banner: show if reject, hide if approve
    const banner = document.getElementById('detalle-rejection-banner');
    if (banner) {
      if (action === 'reject' && updatedInc.rejection_reason) {
        populateRejectionBanner(updatedInc);
        banner.classList.remove('d-none');
      } else {
        banner.classList.add('d-none');
      }
    }
  } catch (err) {
    console.error('Error al refrescar la incidencia:', err);
    mostrarToast('No se pudo refrescar la incidencia.', 'danger');
  }
}
