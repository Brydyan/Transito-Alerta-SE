/**
 * Feed Detail Component — shows full incident details for /incidencias/:id.
 *
 * Fetches incident by ID from GET /incidents/{id}, renders full details
 * with Leaflet map (reusing feed-create patterns), comments section,
 * and back button to feed.
 *
 * Uses router.routeParams.id from the param-matching router.
 */
// This component's markup is an inline `template:` string (see the bottom
// of the default export) — only its CSS lives in a separate file.
import style from './feed-detail.component.css?raw';
import {
  escapeHtml,
  timeAgo,
  STATUS_LABEL,
  PRIORITY_LABEL,
} from '../../../utils/format.js';
import { getUserDisplayName, resolveAvatarSrc } from '../../../utils/avatar.js';
import { router } from '../../../core/router.js';
import { http } from '../../../core/http.service.js';
import initMapView from '../../../shared/init-map-view.js';
import setupCommentsForm from '../../../shared/setup-comments-form.js';
import {
  sortStatusHistoryDesc,
  statusHistoryEntry,
} from '../../../utils/status-history.js';

// ── Detect context: admin vs citizen ──
//
// The role is passed in via onInit({ role }) by the router. This keeps
// the component decoupled from router internals — it doesn't even need
// to import the router. If the role is missing (legacy call site), we
// default to citizen since /feed is the citizen-facing route.
function getFeedUrl(role) {
  return role === 'admin' ? '/incidencias/feed' : '/feed';
}

// ── Component ───────────────────────────────────────────────

export default {
  style,

  async onInit({ params, role } = {}) {
    const detailEl = document.getElementById('fd-detail');
    const loadingEl = document.getElementById('fd-loading');
    const emptyEl = document.getElementById('fd-empty');
    const errorEl = document.getElementById('fd-error');

    // Backwards-compat: tests pin the role on router.currentRoute when
    // bypassing the router. Real navigation always passes the role via
    // the onInit argument, so prefer it when present.
    this._role = role ?? router.currentRoute?.role;
    const incidentId = params?.id;
    const feedUrl = getFeedUrl(this._role);

    // Fix back-to-feed links based on context
    document.querySelectorAll('.fd-back-feed').forEach((link) => {
      link.setAttribute('href', `#${feedUrl}`);
    });

    if (!incidentId) {
      if (loadingEl) loadingEl.classList.add('d-none');
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    try {
      const resp = await http.get(`/incidents/${incidentId}`);
      const inc = resp.data || resp;
      this._incidentId = incidentId;

      // Populate header
      this._renderHeader(inc);

      // Populate body
      this._renderBody(inc);

      // Load and render Leaflet map
      await this._renderMap(inc);

      // Images gallery
      this._renderImages(inc.images ?? []);

      // Status history timeline
      this._renderStatusHistory(inc.status_history ?? []);

      // Assignments list (read-only)
      this._renderAssignments(inc.assignments ?? []);

      // Comments — public, visible/postable by both citizens and operators
      await this._setupComments(incidentId);

      // Operations bar (print, export, share, report)
      this._setupOperations(inc);

      // Show detail, hide loading
      if (loadingEl) loadingEl.classList.add('d-none');
      if (detailEl) detailEl.classList.remove('d-none');
    } catch (err) {
      if (loadingEl) loadingEl.classList.add('d-none');
      if (err.status === 404 || err.status === 422) {
        if (emptyEl) emptyEl.classList.remove('d-none');
      } else {
        if (errorEl) errorEl.classList.remove('d-none');
      }
    }
  },

  _renderHeader(inc) {
    const reporter = inc.user || inc.reporter;
    const userName = getUserDisplayName(reporter);
    const avatarSrc = resolveAvatarSrc(
      reporter?.profile_image_path ?? reporter?.avatar,
    );
    const statusLabel = STATUS_LABEL[inc.status] ?? inc.status;
    const priorityLabel = PRIORITY_LABEL[inc.priority] ?? inc.priority;
    const tiempo = timeAgo(inc.created_at);

    const incId = `INC-${String(inc.id).padStart(4, '0')}`;
    const locCode =
      inc.location?.code || inc.location_code || inc.city_code || '';
    const titlePrefix = locCode ? `${escapeHtml(locCode)} ${incId}` : incId;

    const priorityIcon =
      inc.priority === 'high'
        ? '<i class="fas fa-exclamation-triangle text-warning me-1" aria-hidden="true"></i>'
        : '';

    const el = document.getElementById('fd-header-content');
    if (!el) return;

    // Status and priority badges using existing gr-* classes
    const statusBadgeClass =
      inc.status === 'pending'
        ? 'gr-status gr-status--pendiente'
        : inc.status === 'in_progress'
          ? 'gr-status gr-status--proceso'
          : 'gr-status gr-status--resuelto';

    const priorityBadgeClass =
      inc.priority === 'high'
        ? 'badge bg-danger ms-2'
        : inc.priority === 'medium'
          ? 'badge bg-warning text-dark ms-2'
          : 'badge bg-success ms-2';

    // Only admins/operators see action buttons
    const isAdmin = ['admin', 'operator'].includes(this._role);
    const actionButtons = isAdmin
      ? `
        <button id="fd-btn-edit" class="btn btn-outline-secondary btn-sm" data-incident-id="${inc.id}">
          <i class="fas fa-pen me-1"></i>Editar
        </button>
        <button id="fd-btn-resolve" class="btn btn-success btn-sm" data-incident-id="${inc.id}">
          <i class="fas fa-check-circle me-1"></i>Resolver
        </button>`
      : '';

    el.innerHTML = `
      <div class="p-3">
        <nav class="gr-breadcrumb small mb-2" aria-label="Ruta de navegación">
          <span class="text-muted">Incidencias</span>
          <span class="gr-breadcrumb__sep mx-2">/</span>
          <span class="gr-breadcrumb__item--active">Detalle</span>
        </nav>
        <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
          <div class="fd-back-link" id="fd-back-btn" style="cursor:pointer;color:var(--color-primary)">
            <i class="fas fa-arrow-left me-1"></i>Volver
          </div>
          <div class="ms-auto d-flex align-items-center gap-2">${actionButtons}</div>
          <div class="${statusBadgeClass}" style="font-size:0.75rem"><span class="gr-status__dot"></span>${escapeHtml(statusLabel)}</div>
          <span class="${priorityBadgeClass}">${priorityIcon}${escapeHtml(priorityLabel)}</span>
        </div>
        <div class="d-flex align-items-center gap-3 mb-2">
          <img src="${avatarSrc}" alt="${escapeHtml(userName)}" class="rounded-circle" style="width:42px;height:42px;object-fit:cover" />
          <div class="flex-grow-1">
            <div class="fw-bold" style="font-size:0.9rem">${escapeHtml(userName)}</div>
            <div class="text-muted" style="font-size:0.75rem">${tiempo}</div>
          </div>
          <div class="text-muted" style="font-size:0.72rem">${titlePrefix}</div>
        </div>
        <h1 class="gr-page__title mb-0" style="font-size:1.25rem">${escapeHtml(inc.title || 'Sin título')}</h1>
      </div>
    `;

    // Back button — navigate to the correct feed URL
    const backBtn = document.getElementById('fd-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        router.navigate(getFeedUrl(this._role));
      });
    }

    // Wire action buttons (admin/operator only)
    if (isAdmin) {
      const editBtn = document.getElementById('fd-btn-edit');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          router.navigate(`/incidencias/edit/${inc.id}`);
        });
      }

      const resolveBtn = document.getElementById('fd-btn-resolve');
      if (resolveBtn) {
        resolveBtn.addEventListener('click', async () => {
          resolveBtn.disabled = true;
          resolveBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Resolviendo…';
          try {
            await http.patch(`/incidents/${inc.id}`, { status: 'resolved' });
            // Refresh the view
            window.location.reload();
          } catch {
            resolveBtn.disabled = false;
            resolveBtn.innerHTML =
              '<i class="fas fa-check-circle" aria-hidden="true"></i> Resolver';
            alert('No se pudo resolver la incidencia. Intente de nuevo.');
          }
        });
      }
    }
  },

  _renderBody(inc) {
    const catName = inc.category?.name || inc.incident_category_name || '';
    const locName = inc.location_name || inc.location?.name || '';
    const coords =
      inc.geom?.type === 'Point' && Array.isArray(inc.geom?.coordinates)
        ? `${inc.geom.coordinates[1].toFixed(4)}, ${inc.geom.coordinates[0].toFixed(4)}`
        : '';
    const orgName = inc.organization?.name || '';

    // Description
    const descEl = document.getElementById('fd-description');
    if (descEl) {
      descEl.textContent = inc.description || 'Sin descripción';
    }

    // Meta details using Bootstrap grid
    const metaEl = document.getElementById('fd-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="col-6">
          <small class="text-muted d-block" style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px">Categoría</small>
          <span class="fw-medium">${escapeHtml(catName) || 'No asignada'}</span>
        </div>
        <div class="col-6">
          <small class="text-muted d-block" style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px">Ubicación</small>
          <span class="fw-medium">${escapeHtml(locName) || 'No especificada'}</span>
        </div>
        <div class="col-6">
          <small class="text-muted d-block" style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px">Coordenadas</small>
          <span class="fw-medium small">${escapeHtml(coords) || 'No disponibles'}</span>
        </div>
        <div class="col-6">
          <small class="text-muted d-block" style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px">Organización</small>
          <span class="fw-medium">${escapeHtml(orgName) || 'Sin asignar'}</span>
        </div>
      `;
    }

    // Store coordinates for map
    if (inc.geom?.type === 'Point' && Array.isArray(inc.geom?.coordinates)) {
      const [lng, lat] = inc.geom.coordinates;
      this._mapCoords = { lat, lng };
    }
  },

  async _renderMap(inc) {
    if (!this._mapCoords) return;

    const { lat, lng } = this._mapCoords;
    const { map, remove } = await initMapView({
      container: 'fd-map',
      center: { lat, lng },
      zoom: 15,
      errorClass: 'fd-map-error',
    });
    if (!map) return;

    L.marker([lat, lng]).addTo(map);

    // Build Open-in-GIS deep link. We use the standard OpenStreetMap
    // permalink format as a sensible default. If a custom GIS endpoint
    // is configured via window.GIS_BASE_URL we prefer that one.
    const gisLink = document.getElementById('fd-open-gis');
    if (gisLink) {
      const base = window.GIS_BASE_URL || 'https://www.openstreetmap.org';
      const params = new URLSearchParams({
        mlat: String(lat),
        mlon: String(lng),
        zoom: '17',
      });
      gisLink.href = `${base}/?${params.toString()}#map=17/${lat}/${lng}`;
    }

    // Show zone name when location is known
    const zoneEl = document.getElementById('fd-location-zone');
    const locName = inc.location?.name || inc.location_name;
    if (zoneEl && locName) {
      zoneEl.textContent = `Zona: ${locName}`;
      zoneEl.classList.remove('d-none');
    }

    // Store map reference for cleanup
    this._detailMap = map;
    this._detailMapRemove = remove;
  },

  async _setupComments(incidentId) {
    return setupCommentsForm({
      incidentId,
      loadingId: 'fd-comments-loading',
      formId: 'fd-comment-form',
      inputId: 'fd-comment-input',
      submitId: 'fd-comment-submit',
      listId: 'fd-comments-list',
      emptyId: 'fd-comments-empty',
      errorId: 'fd-comment-error',
      previewId: 'fd-comment-previews',
      fileInputId: 'fd-comment-images',
      attachButtonId: 'fd-comment-attach-btn',
      replyBadgeId: 'fd-reply-badge',
      replyParentIdId: 'fd-reply-parent-id',
      lightboxId: 'fd-lightbox',
      lightboxCloseId: 'fd-lightbox-close',
      thumbnailSelector: '.incid-detail__thumbnail-wrapper[data-src]',
      getUserName: (user) => (user ? getUserDisplayName(user) : 'Usuario'),
    });
  },

  /**
   * Wire up the bottom operations bar (print, export, share, report).
   */
  _setupOperations(inc) {
    const printBtn = document.getElementById('fd-op-print');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    const exportBtn = document.getElementById('fd-op-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        exportBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Exportando…';
        try {
          // Trigger browser PDF save via a temporary link
          const url = `${window.location.origin}/incidents/${inc.id}/export-pdf`;
          const a = document.createElement('a');
          a.href = url;
          a.download = `INC-${String(inc.id).padStart(4, '0')}.pdf`;
          a.click();
        } finally {
          exportBtn.disabled = false;
          exportBtn.innerHTML =
            '<i class="fas fa-file-pdf" aria-hidden="true"></i> Exportar PDF';
        }
      });
    }

    const shareBtn = document.getElementById('fd-op-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const url = window.location.href;
        if (navigator.share) {
          try {
            await navigator.share({ title: inc.title, url });
          } catch {
            // User cancelled or share failed — silently ignore
          }
        } else {
          // Fallback: copy to clipboard
          await navigator.clipboard.writeText(url);
          const original = shareBtn.innerHTML;
          shareBtn.innerHTML =
            '<i class="fas fa-check" aria-hidden="true"></i> Copiado';
          setTimeout(() => {
            shareBtn.innerHTML = original;
          }, 2000);
        }
      });
    }

    const reportBtn = document.getElementById('fd-op-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        router.navigate(`/incidencias/report/${inc.id}`);
      });
    }
  },

  _renderImages(images) {
    const container = document.getElementById('fd-images');
    const emptyEl = document.getElementById('fd-images-empty');
    const countEl = document.getElementById('fd-images-count');
    if (!container) return;

    if (!images || images.length === 0) {
      emptyEl?.classList.remove('d-none');
      countEl?.classList.add('d-none');
      return;
    }

    emptyEl?.classList.add('d-none');
    if (countEl) {
      countEl.textContent = `(${images.length})`;
      countEl.classList.remove('d-none');
    }

    const visibleImages = images.slice(0, 3);
    const remaining = images.length - visibleImages.length;

    const tilesHtml = visibleImages
      .map(
        (img) => `
      <div class="col-4">
        <a href="${escapeHtml(img.url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.original_name || '')}" class="img-thumbnail" loading="lazy" style="aspect-ratio:4/3;object-fit:cover;width:100%" />
        </a>
      </div>`,
      )
      .join('');

    const overflowHtml =
      remaining > 0
        ? `<div class="col-4 d-flex align-items-center justify-content-center bg-light rounded"><span class="text-muted fw-bold">+${remaining}</span></div>`
        : '';

    container.innerHTML = tilesHtml + overflowHtml;
  },

  _renderStatusHistory(items) {
    const loadingEl = document.getElementById('fd-history-loading');
    const listEl = document.getElementById('fd-history-list');
    const emptyEl = document.getElementById('fd-history-empty');
    if (!loadingEl || !listEl) return;

    loadingEl.classList.add('d-none');

    if (!items || items.length === 0) {
      emptyEl?.classList.remove('d-none');
      return;
    }

    // Sort DESC (most recent first)
    const sorted = sortStatusHistoryDesc(items);

    // Group by day label
    const dayLabel = (dateStr) => {
      const date = new Date(dateStr);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isToday = date.toDateString() === now.toDateString();
      const isYesterday = date.toDateString() === yesterday.toDateString();
      if (isToday) return 'Hoy';
      if (isYesterday) return 'Ayer';
      return date.toLocaleDateString('es-EC', {
        month: 'short',
        day: 'numeric',
      });
    };

    // Build grouped timeline
    const groups = [];
    let currentGroup = null;

    for (const item of sorted) {
      const label = dayLabel(item.created_at);
      if (!currentGroup || currentGroup.label !== label) {
        currentGroup = { label, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    }

    const timeStr = (dateStr) =>
      new Date(dateStr).toLocaleTimeString('es-EC', {
        hour: '2-digit',
        minute: '2-digit',
      });

    listEl.innerHTML = groups
      .map(
        (group) => `
        <div class="fd-timeline-group">
          <div class="fd-timeline-day">${escapeHtml(group.label)}</div>
          ${group.items
            .map((item) => {
              const { prev, next, userName } = statusHistoryEntry(item);
              const time = timeStr(item.created_at);
              const avatarSrc = resolveAvatarSrc(
                item.user?.profile_image_path ?? item.user?.avatar,
              );
              return `
            <div class="fd-timeline-item">
              <div class="fd-timeline-dot" aria-hidden="true"></div>
              <div class="fd-timeline-content">
                <div class="fd-timeline-action">
                  <span class="fd-timeline-badge">${escapeHtml(prev)} → ${escapeHtml(next)}</span>
                  <span class="fd-timeline-time">${time}</span>
                </div>
                <div class="fd-timeline-actor">
                  <img class="fd-timeline-avatar" src="${avatarSrc}" alt="${escapeHtml(userName)}" />
                  ${escapeHtml(userName)}
                </div>
              </div>
            </div>`;
            })
            .join('')}
        </div>`,
      )
      .join('');

    // "View full log" link — always shown when there are items
    const viewAllEl = document.getElementById('fd-history-viewall');
    if (viewAllEl) viewAllEl.classList.remove('d-none');
  },

  _renderAssignments(items) {
    const loadingEl = document.getElementById('fd-assignments-loading');
    const listEl = document.getElementById('fd-assignments-list');
    const emptyEl = document.getElementById('fd-assignments-empty');
    if (!loadingEl || !listEl) return;

    loadingEl.classList.add('d-none');

    if (!items || items.length === 0) {
      emptyEl?.classList.remove('d-none');
      return;
    }

    const roleBadge = {
      responsable:
        '<span class="badge bg-primary-subtle text-primary">Responsable</span>',
      apoyo:
        '<span class="badge bg-secondary-subtle text-secondary">Apoyo</span>',
    };

    listEl.innerHTML = items
      .map((a) => {
        const nombre = a.user
          ? [a.user.first_name, a.user.last_name].filter(Boolean).join(' ')
          : 'Usuario';
        const badge =
          roleBadge[a.role] ??
          `<span class="badge bg-light text-muted">${escapeHtml(String(a.role ?? ''))}</span>`;
        const avatarSrc = resolveAvatarSrc(
          a.user?.profile_image_path ?? a.user?.avatar,
        );
        const avatarHtml = `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(nombre)}" class="rounded-circle" style="width:40px;height:40px;object-fit:cover" loading="lazy" />`;

        return `
        <div class="d-flex align-items-center gap-3 py-2 border-bottom">
          <div class="flex-shrink-0">${avatarHtml}</div>
          <div class="flex-grow-1">
            <div class="fw-bold" style="font-size:0.9rem">${escapeHtml(nombre)}</div>
            <div>${badge}</div>
          </div>
          <button class="btn btn-light btn-sm rounded-circle" aria-label="Más opciones">
            <i class="fas fa-ellipsis-v text-muted"></i>
          </button>
        </div>`;
      })
      .join('');

    // "Add Team Member" button for admins
    if (['admin', 'operator'].includes(this._role)) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-outline-primary btn-sm w-100 mt-3';
      addBtn.id = 'fd-btn-add-member';
      addBtn.innerHTML =
        '<i class="fas fa-user-plus me-2"></i>Asignar Personal';
      addBtn.addEventListener('click', () => {
        router.navigate(`/incidencias/assign/${this._incidentId}`);
      });
      listEl.parentElement.appendChild(addBtn);
    }
  },

  onDestroy() {
    // Cleanup Leaflet map via the helper's returned disposer
    if (this._detailMapRemove) {
      this._detailMapRemove();
      this._detailMapRemove = null;
      this._detailMap = null;
    }
  },

  template: `
    <div id="fd-loading" class="d-flex justify-content-center align-items-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <span class="ms-3 text-muted">Cargando incidencia...</span>
    </div>

    <div id="fd-empty" class="d-none text-center py-5">
      <i class="fas fa-search text-muted" style="font-size:3rem"></i>
      <h2 class="h5 mt-3">Incidencia no encontrada</h2>
      <p class="text-muted">La incidencia que buscas no existe o fue eliminada.</p>
      <a href="#" class="btn btn-primary fd-back-feed"><i class="fas fa-arrow-left me-2"></i>Volver al feed</a>
    </div>

    <div id="fd-error" class="d-none text-center py-5">
      <i class="fas fa-exclamation-triangle text-warning" style="font-size:3rem"></i>
      <h2 class="h5 mt-3">Error al cargar</h2>
      <p class="text-muted">No se pudo cargar la incidencia. Intente de nuevo más tarde.</p>
      <a href="#" class="btn btn-primary fd-back-feed"><i class="fas fa-arrow-left me-2"></i>Volver al feed</a>
    </div>

    <div id="fd-detail" class="fd-detail d-none">
      <!-- 2-column layout: left (main info) + right (sidebar) -->
      <div class="row g-4">

        <!-- ── LEFT COLUMN (main content) ── -->
        <div class="col-lg-8">

          <!-- Header -->
          <div class="gr-card mb-3" id="fd-header-content"></div>

          <!-- Meta information -->
          <div class="gr-card mb-3 p-3">
            <div class="row g-3" id="fd-meta"></div>
          </div>

          <!-- Description -->
          <div class="gr-card mb-3 p-3">
            <h3 class="h6 fw-bold mb-2">Descripción</h3>
            <p class="text-muted mb-0" id="fd-description"></p>
          </div>

          <!-- Map -->
          <div class="gr-card mb-3 p-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h6 fw-bold mb-0">Ubicación</h3>
              <a
                href="#"
                id="fd-open-gis"
                class="gr-btn-outline btn btn-sm"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir ubicación en sistema GIS externo"
              >
                <i class="fas fa-external-link-alt me-1"></i> GIS
              </a>
            </div>
            <p id="fd-location-zone" class="text-muted mb-2 d-none"></p>
            <div
              class="feed-detail__map-region"
              role="region"
              aria-label="Mapa de ubicación de la incidencia"
            >
              <div id="fd-map" class="fd-map-container feed-detail__map-canvas rounded-3 overflow-hidden"></div>
              <div class="feed-detail__map-coords visually-hidden">
                <div class="feed-detail__map-field">
                  <label for="lat">Latitud</label>
                  <input id="lat" name="lat" type="text" readonly aria-live="off" />
                </div>
                <div class="feed-detail__map-field">
                  <label for="lng">Longitud</label>
                  <input id="lng" name="lng" type="text" readonly aria-live="off" />
                </div>
              </div>
              <div
                class="feed-detail__map-status visually-hidden"
                id="map-status"
                aria-live="polite"
              ></div>
            </div>
          </div>

          <!-- Images -->
          <div class="gr-card mb-3 p-3">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h3 class="h6 fw-bold mb-0"><i class="fas fa-images me-2"></i>Galería de Evidencia</h3>
              <span id="fd-images-count" class="badge bg-light text-muted d-none"></span>
            </div>
            <p id="fd-images-empty" class="text-muted mb-0">Sin imágenes</p>
            <div id="fd-images" class="row g-2"></div>
          </div>

          <!-- Comments -->
          <div class="gr-card mb-3 p-3">
            <h3 class="h6 fw-bold mb-3"><i class="fas fa-comments me-2"></i>Comentarios</h3>
            <form id="fd-comment-form" class="mb-3">
              <div id="fd-reply-badge" class="alert alert-secondary py-1 px-2 small d-none mb-2" style="cursor:pointer" title="Clic para cancelar"></div>
              <input type="hidden" id="fd-reply-parent-id" value="" />
              <textarea
                id="fd-comment-input"
                class="form-control mb-2"
                rows="2"
                maxlength="5000"
                placeholder="Escribe un comentario público..."
              ></textarea>
              <input
                type="file"
                id="fd-comment-images"
                multiple
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                class="d-none"
              />
              <div class="mb-2">
                <button
                  type="button"
                  id="fd-comment-attach-btn"
                  class="btn btn-outline-secondary btn-sm"
                  title="Adjuntar o tomar foto"
                  aria-label="Adjuntar o tomar foto"
                >
                  <i class="fas fa-camera"></i>
                </button>
              </div>
              <div id="fd-comment-previews" class="d-flex flex-wrap gap-2 mb-2"></div>
              <div id="fd-comment-error" class="text-danger small mb-2 d-none"></div>
              <div class="d-flex justify-content-end">
                <button
                  type="submit"
                  id="fd-comment-submit"
                  class="btn btn-primary btn-sm"
                >
                  Publicar
                </button>
              </div>
            </form>
            <div id="fd-comments-loading" class="d-flex justify-content-center py-2">
              <div class="spinner-border spinner-border-sm text-primary"></div>
            </div>
            <ul id="fd-comments-list" class="list-unstyled mb-0 comment-list"></ul>
            <p id="fd-comments-empty" class="text-muted d-none mb-0" style="font-size:0.875rem">
              Sin comentarios todavía.
            </p>
          </div>

          <!-- Lightbox overlay for comment images -->
          <div id="fd-lightbox" class="incid-detail__lightbox d-none" role="dialog" aria-modal="true">
            <img id="fd-lightbox-img" src="" alt="" />
            <div id="fd-lightbox-caption" class="position-absolute text-white text-center w-100" style="bottom:40px;font-size:0.85rem"></div>
            <button id="fd-lightbox-close" class="incid-detail__lightbox-close" aria-label="Cerrar">&times;</button>
          </div>

        </div><!-- /col-lg-8 -->

        <!-- ── RIGHT COLUMN (sidebar) ── -->
        <div class="col-lg-4">

          <!-- Timeline -->
          <div class="gr-card mb-3 p-3">
            <h3 class="h6 fw-bold mb-3"><i class="fas fa-clock-rotate-left me-2"></i>Línea de Tiempo</h3>
            <div id="fd-history-loading" class="d-flex justify-content-center py-3">
              <div class="spinner-border spinner-border-sm text-primary"></div>
            </div>
            <div id="fd-history-list"></div>
            <p id="fd-history-empty" class="text-muted d-none mb-0">Sin cambios registrados.</p>
            <a
              href="#"
              id="fd-history-viewall"
              class="d-none mt-2 d-inline-flex align-items-center gap-2 text-primary fw-medium"
              style="font-size:0.8rem"
              aria-label="Ver registro completo de cambios"
            >
              Ver todo <i class="fas fa-arrow-right"></i>
            </a>
          </div>

          <!-- Assignments -->
          <div class="gr-card mb-3 p-3">
            <h3 class="h6 fw-bold mb-3"><i class="fas fa-user-check me-2"></i>Asignaciones</h3>
            <div id="fd-assignments-loading" class="d-flex justify-content-center py-3">
              <div class="spinner-border spinner-border-sm text-primary"></div>
            </div>
            <div id="fd-assignments-list"></div>
            <p id="fd-assignments-empty" class="text-muted d-none mb-0">Sin operadores asignados.</p>
          </div>

          <!-- Operations bar -->
          <div class="gr-card p-3" role="toolbar" aria-label="Acciones disponibles">
            <div class="d-flex flex-column gap-2">
              <button id="fd-op-print" class="btn btn-outline-secondary btn-sm w-100 text-start" title="Imprimir">
                <i class="fas fa-print me-2"></i>Imprimir
              </button>
              <button id="fd-op-export" class="btn btn-outline-secondary btn-sm w-100 text-start" title="Exportar PDF">
                <i class="fas fa-file-pdf me-2"></i>Exportar PDF
              </button>
              <button id="fd-op-share" class="btn btn-outline-secondary btn-sm w-100 text-start" title="Compartir">
                <i class="fas fa-share-alt me-2"></i>Compartir
              </button>
              <button id="fd-op-report" class="btn btn-outline-danger btn-sm w-100 text-start" title="Reportar">
                <i class="fas fa-flag me-2"></i>Reportar
              </button>
            </div>
          </div>

        </div><!-- /col-lg-4 -->
      </div><!-- /row -->
    </div>
  `,
};
