import template from './operator-dashboard.component.html?raw';
import style from './operator-dashboard.component.css?raw';
import { http } from '../../../core/http.service.js';
import { __, applyTranslations } from '../../../core/i18n.js';
import { escapeHtml } from '../../../utils/format.js';

const state = {
  page: 1,
  requestId: 0,
  controller: null,
};

function element(id) {
  return document.getElementById(id);
}

function dashboardPath() {
  const params = new URLSearchParams();
  const start = element('operator-filter-start')?.value;
  const end = element('operator-filter-end')?.value;
  const locationId = element('operator-filter-location')?.value;

  if (start) params.set('inicio', start);
  if (end) params.set('fin', end);
  if (locationId) params.set('location_id', locationId);
  params.set('page', String(state.page));
  params.set('per_page', '10');

  return `/operator/dashboard?${params.toString()}`;
}

function setLoading(loading) {
  const skeleton = element('operator-dashboard-skeleton');
  const content = element('operator-dashboard-content');
  const error = element('operator-dashboard-error');

  if (skeleton) skeleton.hidden = !loading;
  if (content) content.hidden = loading;
  if (error) error.hidden = true;
}

async function loadDashboard() {
  const requestId = ++state.requestId;
  setLoading(true);

  try {
    const data = await http.get(dashboardPath());
    if (requestId !== state.requestId) return;
    renderDashboard(data ?? {});
    element('operator-dashboard-skeleton').hidden = true;
    element('operator-dashboard-content').hidden = false;
  } catch {
    if (requestId !== state.requestId) return;
    element('operator-dashboard-skeleton').hidden = true;
    element('operator-dashboard-content').hidden = true;
    element('operator-dashboard-error').hidden = false;
  }
}

function renderDashboard(data) {
  const summary = data.summary_counts ?? {};
  const byStatus = summary.by_status ?? {};

  setText('operator-stat-assigned', summary.total_assigned ?? 0);
  setText('operator-stat-pending', byStatus.pending ?? 0);
  setText('operator-stat-progress', byStatus.in_progress ?? 0);
  setText('operator-stat-resolved', byStatus.resolved ?? 0);
  setText(
    'operator-stat-average',
    formatAverage(summary.average_resolution_time),
  );

  renderLocationOptions(data.filter_options?.locations ?? []);
  renderAssigned(data.assigned_incidents ?? {});
  renderNearby(
    data.nearby_recommendations ?? [],
    Boolean(data.has_recent_location),
    data.nearby_radius_km ?? 10,
  );

  const prompt = element('operator-dashboard-gps-prompt');
  if (prompt) prompt.hidden = Boolean(data.has_recent_location);
}

function renderLocationOptions(locations) {
  const select = element('operator-filter-location');
  if (!select) return;

  const selected = select.value;
  select.replaceChildren();

  const all = document.createElement('option');
  all.value = '';
  all.textContent = __('operatorDashboard.filters.allLocations');
  select.appendChild(all);

  const seen = new Set();
  locations.forEach((location) => {
    if (!location?.id || seen.has(location.id)) return;
    seen.add(location.id);
    const option = document.createElement('option');
    option.value = String(location.id);
    option.textContent =
      location.path || __('operatorDashboard.location.unknown');
    select.appendChild(option);
  });

  select.value = selected;
}

function renderAssigned(payload) {
  const list = element('operator-assigned-list');
  const empty = element('operator-assigned-empty');
  const incidents = Array.isArray(payload.data) ? payload.data : [];

  list.innerHTML = incidents
    .map((incident) => incidentMarkup(incident, true))
    .join('');
  empty.hidden = incidents.length > 0;

  const meta = payload.meta ?? {};
  state.page = Number(meta.current_page ?? state.page);
  renderPagination(meta);
}

function renderNearby(incidents, hasRecentLocation, radius) {
  const list = element('operator-nearby-list');
  const empty = element('operator-nearby-empty');
  const title = element('operator-nearby-empty-title');
  const body = element('operator-nearby-empty-body');

  element('operator-nearby-subtitle').textContent = __(
    'operatorDashboard.nearby.subtitle',
    { radius },
  );

  list.innerHTML = incidents
    .map((incident) => incidentMarkup(incident, false))
    .join('');
  empty.hidden = incidents.length > 0;

  if (incidents.length === 0) {
    title.textContent = hasRecentLocation
      ? __('operatorDashboard.nearby.emptyTitle')
      : __('operatorDashboard.nearby.noGpsTitle');
    body.textContent = hasRecentLocation
      ? __('operatorDashboard.nearby.emptyBody')
      : __('operatorDashboard.nearby.noGpsBody');
  }
}

function incidentMarkup(incident, includePriority) {
  const status = ['pending', 'in_progress', 'resolved'].includes(
    incident.status,
  )
    ? incident.status
    : 'pending';
  const priority = ['high', 'medium', 'low'].includes(incident.priority)
    ? incident.priority
    : 'medium';
  const title = escapeHtml(incident.title || '');
  const location = escapeHtml(
    incident.location?.path || __('operatorDashboard.location.unknown'),
  );
  const createdAt = formatDate(incident.created_at);
  const distance = formatDistance(incident.distance_km);
  const priorityMarkup = includePriority
    ? `<span class="operator-incident__priority operator-incident__priority--${priority}">${escapeHtml(__(`operatorDashboard.priority.${priority}`))}</span>`
    : '';
  const variant = includePriority ? '' : ' operator-incident--nearby';

  return `<article class="operator-incident${variant}">
    <div class="operator-incident__main">
      <strong class="operator-incident__title">${title}</strong>
      <div class="operator-incident__meta"><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="${escapeHtml(incident.created_at || '')}">${escapeHtml(createdAt)}</time></div>
    </div>
    <span class="operator-incident__status operator-incident__status--${status}">${escapeHtml(__(`operatorDashboard.status.${status}`))}</span>
    ${priorityMarkup}
    <span class="operator-incident__location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${location}</span>
    <span class="operator-incident__distance">${escapeHtml(distance)}</span>
    <button class="operator-incident__open" type="button" data-open-incident="${Number(incident.id)}" aria-label="${escapeHtml(__('operatorDashboard.common.openLabel', { title: incident.title || '' }))}">${escapeHtml(__('operatorDashboard.common.open'))}</button>
  </article>`;
}

function renderPagination(meta) {
  const pagination = element('operator-pagination');
  const current = Number(meta.current_page ?? 1);
  const last = Number(meta.last_page ?? 1);

  pagination.hidden = last <= 1;
  element('operator-page-previous').disabled = current <= 1;
  element('operator-page-next').disabled = current >= last;
  element('operator-page-label').textContent = __(
    'operatorDashboard.pagination.page',
    { current, total: last },
  );
}

function formatAverage(average) {
  if (!average) return __('operatorDashboard.stats.noData');

  const days = Number(average.days ?? 0);
  const hours = Number(average.hours ?? 0);

  if (days > 0 && hours > 0) {
    return __('operatorDashboard.average.daysHours', { days, hours });
  }
  if (days > 0) return __('operatorDashboard.average.days', { days });
  return __('operatorDashboard.average.hours', { hours });
}

function formatDistance(distance) {
  if (distance === null || distance === undefined) {
    return __('operatorDashboard.distance.unavailable');
  }

  const value = new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(distance));

  return __('operatorDashboard.distance.km', { value });
}

function formatDate(value) {
  if (!value) return '';

  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function setText(id, value) {
  const target = element(id);
  if (target) target.textContent = String(value);
}

function validateDateRange() {
  const start = element('operator-filter-start');
  const end = element('operator-filter-end');
  const invalid = start.value && end.value && end.value < start.value;

  end.setCustomValidity(
    invalid ? __('operatorDashboard.filters.invalidRange') : '',
  );
  if (invalid) end.reportValidity();

  return !invalid;
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(__('operatorDashboard.location.unavailable')));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

async function updateLocation() {
  const buttons = [
    element('operator-location-update'),
    element('operator-location-enable'),
  ].filter(Boolean);
  const status = element('operator-location-status');
  const headerLabel = element('operator-location-update')?.querySelector(
    'span',
  );

  buttons.forEach((button) => {
    button.disabled = true;
  });
  if (headerLabel) {
    headerLabel.textContent = __('operatorDashboard.location.updating');
  }
  status.textContent = __('operatorDashboard.location.updating');

  try {
    const position = await currentPosition();
    await http.post('/operator/location', {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
    status.textContent = __('operatorDashboard.location.success');
    await loadDashboard();
  } catch (error) {
    status.textContent = navigator.geolocation
      ? __('operatorDashboard.location.error')
      : error.message;
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
    if (headerLabel) {
      headerLabel.textContent = __('operatorDashboard.location.update');
    }
  }
}

function wireInteractions() {
  state.controller?.abort();
  state.controller = new AbortController();
  const signal = state.controller.signal;

  element('operator-filter-apply').addEventListener(
    'click',
    () => {
      if (!validateDateRange()) return;
      state.page = 1;
      loadDashboard();
    },
    { signal },
  );

  element('operator-filter-clear').addEventListener(
    'click',
    () => {
      element('operator-filter-start').value = '';
      element('operator-filter-end').value = '';
      element('operator-filter-end').setCustomValidity('');
      element('operator-filter-location').value = '';
      state.page = 1;
      loadDashboard();
    },
    { signal },
  );

  element('operator-dashboard-retry').addEventListener('click', loadDashboard, {
    signal,
  });
  element('operator-location-update').addEventListener(
    'click',
    updateLocation,
    {
      signal,
    },
  );
  element('operator-location-enable').addEventListener(
    'click',
    updateLocation,
    {
      signal,
    },
  );

  element('operator-page-previous').addEventListener(
    'click',
    () => {
      if (state.page <= 1) return;
      state.page -= 1;
      loadDashboard();
    },
    { signal },
  );

  element('operator-page-next').addEventListener(
    'click',
    () => {
      state.page += 1;
      loadDashboard();
    },
    { signal },
  );

  const openIncident = (event) => {
    const button = event.target.closest('[data-open-incident]');
    if (!button) return;
    window.location.hash = `#/incidencias/${button.dataset.openIncident}`;
  };

  element('operator-assigned-list').addEventListener('click', openIncident, {
    signal,
  });
  element('operator-nearby-list').addEventListener('click', openIncident, {
    signal,
  });
}

export default {
  template,
  style,

  async onInit() {
    const root = element('operator-dashboard');
    if (!root) return;

    state.page = 1;
    applyTranslations(root);
    wireInteractions();
    await loadDashboard();
  },

  onDestroy() {
    state.requestId += 1;
    state.controller?.abort();
    state.controller = null;
  },
};
