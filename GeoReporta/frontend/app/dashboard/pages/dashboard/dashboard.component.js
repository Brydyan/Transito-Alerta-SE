import template from './dashboard.component.html?raw';
import style from './dashboard.component.css?raw';
import { http } from '../../../core/http.service.js';
import { locationService } from '../../../shared/location.service.js';
import {
  badgeEstado,
  badgePrioridad,
  STATUS_COLOR,
} from '../../../utils/format.js';

const __ = (message) => message;

const dashboardMessages = {
  empty: '0',
  loadError: __(
    'No pudimos cargar las estadísticas. Revisá tu conexión e intentá nuevamente.',
  ),
  retry: __('Reintentar'),
  previousPeriod: __('respecto al período anterior'),
  resolutionRate: __('tasa de resolución'),
  noTrend: __('Sin comparación disponible'),
};

// ─────────────────────────────────────────────
// Estado global de filtros
// ─────────────────────────────────────────────
const filterState = {
  inicio: null,
  fin: null,
  tipo_id: null,
  ciudad_id: null,
  provincia_id: null,
  pais_id: null,
  countries: [], // loaded via locationService.getRoots({ level: 'country' })
  provinces: [], // loaded via locationService.getChildren({ parentId }) when country selected
  cities: [], // loaded via locationService.getChildren({ parentId }) when province selected
  categories: [],
};

// ─────────────────────────────────────────────
// Carga D3 + C3 de forma lazy (ya están en assets)
// ─────────────────────────────────────────────
function loadC3() {
  if (window.c3) return Promise.resolve();

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/extra-libs/c3/c3.min.css';
  document.head.appendChild(link);

  return new Promise((resolve, reject) => {
    const d3 = document.createElement('script');
    d3.src = '/assets/extra-libs/c3/d3.min.js';
    d3.onload = () => {
      const c3 = document.createElement('script');
      c3.src = '/assets/extra-libs/c3/c3.min.js';
      c3.onload = resolve;
      c3.onerror = reject;
      document.head.appendChild(c3);
    };
    d3.onerror = reject;
    document.head.appendChild(d3);
  });
}

// ─────────────────────────────────────────────
// Counter animation — cuenta desde 0 al valor final
// ─────────────────────────────────────────────
function renderEmptyMetric(el) {
  if (!el) return;
  el.classList.remove('is-loading', 'is-empty');
  el.textContent = '0';
}

function animateCounter(el, target, duration = 900) {
  if (!el) return;
  el.classList.remove('is-loading', 'is-empty');
  if (target === 0) {
    renderEmptyMetric(el);
    return;
  }
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ─────────────────────────────────────────────
// Top 5 Categories chart — barras apiladas (resueltas + por resolver)
// ─────────────────────────────────────────────
function initCategoriesChart(categories) {
  if (!window.c3 || !document.getElementById('chart-categorias')) return;

  if (!categories || categories.length === 0) {
    c3.generate({
      bindto: '#chart-categorias',
      data: { columns: [['Sin datos', 1]], type: 'bar' },
      legend: { hide: true },
      color: { pattern: ['#e9ecef'] },
    });
    return;
  }

  // Preparar dos series: Resueltas (oscuro) y Por resolver (claro)
  const resolved = ['Resueltas', ...categories.map((cat) => cat.resolved)];
  const pending = ['Por resolver', ...categories.map((cat) => cat.pending)];

  c3.generate({
    bindto: '#chart-categorias',
    data: {
      columns: [resolved, pending],
      type: 'bar',
      groups: [['Resueltas', 'Por resolver']],
    },
    axis: {
      rotated: true,
      x: {
        type: 'category',
        categories: categories.map((cat) => cat.name),
      },
      y: {
        label: { text: 'Cantidad', position: 'outer-middle' },
        tick: { format: (d) => Math.round(d) },
        padding: { top: 4, bottom: 0 },
      },
    },
    bar: {
      width: { ratio: 0.55 },
      padding: 0.15,
    },
    padding: {
      top: 8,
      right: 24,
      bottom: 0,
      // 150px reserved on the left so category names render in full
      // (the longest seed category — 'Recolección de Residuos',
      // 'Contaminación Ambiental', 'Construcciones Ilegales' — all need
      // ~22-25 chars at the 11px axis font-size).
      left: 150,
    },
    tooltip: {
      format: {
        title: (d) => categories[d]?.name || 'Categoría',
        value: (value, _ratio, id, index) => {
          const cat = categories[index];
          if (!cat) return value + ' incidencias';
          return id === 'Resueltas'
            ? `Resueltas: ${value} de ${cat.total}`
            : `Por resolver: ${value} de ${cat.total}`;
        },
      },
    },
    color: {
      pattern: ['#7d5af0', '#e4d8ff'],
    },
    legend: { position: 'bottom', padding: 8 },
    grid: {
      y: {
        show: true,
        ticks: 4,
      },
    },
  });
}

// ─────────────────────────────────────────────
// Activity feed — incidencias recientes
// ─────────────────────────────────────────────
function buildActivityFeed(items) {
  const feed = document.getElementById('activity-feed');
  if (!feed || !items || items.length === 0) return;

  document.getElementById('activity-empty')?.remove();

  items.slice(0, 5).forEach((inc) => {
    const dotColor = STATUS_COLOR[inc.status] || 'secondary';
    const fecha = inc.created_at
      ? new Date(inc.created_at).toLocaleDateString('es-EC', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '';
    const categoria = inc.category?.name || 'Sin título';

    const item = document.createElement('div');
    item.className = 'gr-activity__item';
    item.style.cursor = 'pointer';
    item.innerHTML = `
      <span class="gr-activity__dot bg-${dotColor}"></span>
      <div class="gr-activity__body">
        <div class="gr-activity__title">${categoria}</div>
        <div class="gr-activity__meta">${badgeEstado(inc.status)} ${badgePrioridad(inc.priority)}</div>
      </div>
      <span class="gr-activity__date">${fecha}</span>`;

    // Doble click para ver detalles
    item.addEventListener('dblclick', () => {
      window.location.hash = `#/incidencias/${inc.id}`;
    });

    feed.appendChild(item);
  });
}

// ─────────────────────────────────────────────
// Tiempo promedio de resolución (R: "Average Resolution Time Format")
// El backend devuelve { days, hours, seconds, formatted } o null cuando
// no hay incidencias resueltas todavía.
// ─────────────────────────────────────────────
function formatResolutionTime(avg) {
  if (!avg) return '0';
  const { days, hours } = avg;
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

// ─────────────────────────────────────────────
// Carga stats con filtros aplicados
// ─────────────────────────────────────────────
async function loadStats() {
  const params = new URLSearchParams();
  if (filterState.inicio) params.append('inicio', filterState.inicio);
  if (filterState.fin) params.append('fin', filterState.fin);
  if (filterState.tipo_id) params.append('tipo_id', filterState.tipo_id);
  if (filterState.ciudad_id) params.append('ciudad_id', filterState.ciudad_id);
  if (filterState.provincia_id)
    params.append('provincia_id', filterState.provincia_id);
  if (filterState.pais_id) params.append('pais_id', filterState.pais_id);

  const query = params.toString();
  const stats = await http.get(
    query ? `/incidents/stats?${query}` : '/incidents/stats',
  );
  return stats ?? {};
}

// ─────────────────────────────────────────────
// Carga estadísticas semanales con filtros
// ─────────────────────────────────────────────
async function loadWeeklyStats() {
  const params = new URLSearchParams();
  if (filterState.inicio) params.append('inicio', filterState.inicio);
  if (filterState.fin) params.append('fin', filterState.fin);
  if (filterState.tipo_id) params.append('tipo_id', filterState.tipo_id);
  if (filterState.ciudad_id) params.append('ciudad_id', filterState.ciudad_id);
  if (filterState.provincia_id)
    params.append('provincia_id', filterState.provincia_id);
  if (filterState.pais_id) params.append('pais_id', filterState.pais_id);

  const query = params.toString();
  const weekly = await http.get(
    query ? `/incidents/weekly-stats?${query}` : '/incidents/weekly-stats',
  );
  return weekly ?? { days: [] };
}

// ─────────────────────────────────────────────
// Gráfico de volumen mensual — línea de tendencia
// ─────────────────────────────────────────────
function initVolumeChart(days) {
  if (!window.c3 || !document.getElementById('chart-volumen')) return;

  const labels = days.map((d) => d.date.slice(8)); // Mostrar solo día (ej: "01", "15", "30")
  const recibidas = ['Recibidas', ...days.map((d) => d.recibidas)];

  c3.generate({
    bindto: '#chart-volumen',
    data: {
      columns: [recibidas],
      type: 'area',
    },
    axis: {
      x: {
        type: 'category',
        categories: labels,
        tick: {
          // C3's default shows every tick label; on a 30-day window that
          // gets crowded. Culling to ~8 keeps the axis readable.
          cull: { max: 8 },
          format: (i) => labels[i],
        },
      },
      y: {
        tick: { format: (d) => Math.round(d) },
        padding: { top: 8, bottom: 0 },
      },
    },
    color: {
      pattern: ['#7d5af0'],
    },
    point: {
      show: false,
      focus: { expand: { enabled: true, r: 5 } },
    },
    line: {
      connectNull: true,
    },
    area: {
      zerobased: true,
    },
    legend: {
      show: false,
    },
    grid: {
      y: {
        show: true,
        ticks: 4,
      },
    },
  });
}

// ─────────────────────────────────────────────
// Actualiza el dashboard con nuevos datos
// ─────────────────────────────────────────────
function setDashboardLoading(isLoading) {
  const statsRow = document.querySelector('.gr-stats-row');
  statsRow?.setAttribute('aria-busy', String(isLoading));
  document.querySelectorAll('[data-stat-card]').forEach((card) => {
    card.classList.toggle('is-loading', isLoading);
  });
  if (!isLoading) return;
  document.querySelectorAll('.gr-stat-card__num').forEach((value) => {
    value.className = 'gr-stat-card__num is-loading';
    value.innerHTML = '<span class="gr-skeleton gr-skeleton--value"></span>';
  });
  document.querySelectorAll('.gr-chart').forEach((chart) => {
    chart.classList.add('is-loading');
    chart.innerHTML = '<span class="gr-skeleton gr-skeleton--chart"></span>';
  });
}

function showDashboardError() {
  const error = document.getElementById('dashboard-error');
  const message = document.getElementById('dashboard-error-message');
  if (message) message.textContent = dashboardMessages.loadError;
  if (error) error.hidden = false;
}

function hideDashboardError() {
  const error = document.getElementById('dashboard-error');
  if (error) error.hidden = true;
}

function updateCardAccessibility(card, label, value, trend) {
  if (!card) return;
  const valueLabel = value === 0 ? dashboardMessages.empty : value;
  const trendLabel = trend || dashboardMessages.noTrend;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${label}: ${valueLabel}. ${trendLabel}`);
}

async function refreshDashboard() {
  setDashboardLoading(true);
  hideDashboardError();

  try {
    const [stats, weekly] = await Promise.all([loadStats(), loadWeeklyStats()]);

    const byStatus = stats.by_status ?? {};
    const total = stats.total ?? 0;
    const pendientes = byStatus.pending ?? 0;
    const en_proceso = byStatus.in_progress ?? 0;
    const resueltas = byStatus.resolved ?? 0;
    const ubicaciones = stats.locations_count ?? 0;
    const tiempoResolucion = stats.average_resolution_time ?? null;
    const trends = stats.trends ?? {};
    const topCategories = stats.top_categories ?? [];

    // Re-animar counters
    animateCounter(document.getElementById('stat-incidencias'), total);
    animateCounter(document.getElementById('stat-pendientes'), pendientes);
    animateCounter(document.getElementById('stat-en-proceso'), en_proceso);
    animateCounter(document.getElementById('stat-resueltas'), resueltas);
    animateCounter(document.getElementById('stat-ubicaciones'), ubicaciones);

    // Tiempo promedio
    const resolucionEl = document.getElementById('stat-tiempo-resolucion');
    if (resolucionEl) {
      resolucionEl.textContent = formatResolutionTime(tiempoResolucion);
    }

    // Trends (total, pendientes, resolution rate)
    const updateTrend = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (value === null || value === undefined) {
        el.textContent = dashboardMessages.noTrend;
        el.className = 'gr-stat-card__trend is-neutral';
      } else {
        const absValue = Math.abs(value);
        const direction = value >= 0 ? __('aumento') : __('disminución');
        el.className = `gr-stat-card__trend ${value >= 0 ? 'is-positive' : 'is-negative'}`;
        el.innerHTML = `<i class="fa-solid ${value >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}" aria-hidden="true"></i><span>${absValue}% ${dashboardMessages.previousPeriod}</span>`;
        el.setAttribute(
          'aria-label',
          `${direction} ${absValue}% ${dashboardMessages.previousPeriod}`,
        );
      }
    };

    updateTrend('trend-total', trends.total_pct);
    updateTrend('trend-pendientes', trends.pendientes_pct);

    // Trend resueltas muestra tasa de resolución (siempre porcentaje actual)
    const trendResueltasEl = document.getElementById('trend-resueltas');
    if (trendResueltasEl) {
      if (
        trends.resolution_rate_pct !== null &&
        trends.resolution_rate_pct !== undefined
      ) {
        trendResueltasEl.className = 'gr-stat-card__trend is-positive';
        trendResueltasEl.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>${trends.resolution_rate_pct}% ${dashboardMessages.resolutionRate}</span>`;
        trendResueltasEl.setAttribute(
          'aria-label',
          `${trends.resolution_rate_pct}% ${dashboardMessages.resolutionRate}`,
        );
      } else {
        trendResueltasEl.className = 'gr-stat-card__trend is-neutral';
        trendResueltasEl.textContent = dashboardMessages.noTrend;
      }
    }

    // Re-inicializar gráfico de top categorías
    initCategoriesChart(topCategories);

    // Gráfico de volumen mensual
    initVolumeChart(weekly.days ?? []);

    document.querySelectorAll('.gr-chart').forEach((chart) => {
      chart.classList.remove('is-loading');
    });

    const cards = document.querySelectorAll('[data-stat-card]');
    updateCardAccessibility(
      cards[0],
      __('Total de incidencias'),
      total,
      document.getElementById('trend-total')?.textContent,
    );
    updateCardAccessibility(
      cards[1],
      __('Incidencias en proceso'),
      en_proceso,
      null,
    );
    updateCardAccessibility(
      cards[2],
      __('Incidencias resueltas'),
      resueltas,
      trendResueltasEl?.textContent,
    );
    updateCardAccessibility(
      cards[3],
      __('Incidencias pendientes'),
      pendientes,
      document.getElementById('trend-pendientes')?.textContent,
    );
    updateCardAccessibility(
      cards[4],
      __('Tiempo promedio de resolución'),
      formatResolutionTime(tiempoResolucion),
      null,
    );

    const modal = bootstrap?.Modal?.getOrCreateInstance?.(
      document.getElementById('filter-modal'),
    );
    if (modal) modal.hide();
  } catch {
    showDashboardError();
  } finally {
    setDashboardLoading(false);
  }
}

// ─────────────────────────────────────────────
// Setup de event listeners para filtros
// ─────────────────────────────────────────────

// Backend endpoints that return ResourceCollections wrap responses
// as { data: [...] }. Direct array responses are also possible when
// the controller returns a non-paginated bare collection. This helper
// normalises both to a plain array of items, and falls back to [] on
// any other shape (null, undefined, error envelope).
function unwrapCollection(response) {
  if (response == null) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.items)) return response.items;
  return [];
}

function populateSelectError(selectEl, message) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${message}</option>`;
  selectEl.disabled = true;
}

async function setupQuickFilterListeners() {
  const container = document.getElementById('gr-quick-filters');
  if (!container) return;

  container.querySelectorAll('.gr-quick-filter-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      container
        .querySelectorAll('.gr-quick-filter-btn')
        .forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const preset = e.currentTarget.dataset.preset;
      const now = new Date();
      const formatDate = (d) => d.toISOString().slice(0, 10);

      if (preset === 'today') {
        filterState.inicio = formatDate(now);
        filterState.fin = formatDate(now);
      } else if (preset === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        filterState.inicio = formatDate(weekAgo);
        filterState.fin = formatDate(now);
      } else if (preset === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filterState.inicio = formatDate(monthStart);
        filterState.fin = formatDate(now);
      } else {
        filterState.inicio = null;
        filterState.fin = null;
      }

      await refreshDashboard();
    });
  });
}

async function setupFilterListeners() {
  // Load categories (unchanged — still uses tree endpoint)
  http
    .get('/incident-categories/tree')
    .then((resp) => {
      filterState.categories = unwrapCollection(resp);
    })
    .catch(() => {
      console.warn('Failed to load categories');
    });

  // Load countries first (roots) via location.service
  try {
    filterState.countries = await locationService.getRoots({
      level: 'country',
    });
    populateCountrySelect();
  } catch {
    console.warn('Failed to load countries');
  }

  // Botón "Aplicar" — ejecuta refreshDashboard
  const btnAplicar = document.getElementById('btn-filter-apply');
  if (btnAplicar) {
    btnAplicar.addEventListener('click', refreshDashboard);
  }

  // Input fecha inicio
  const inputInicio = document.getElementById('filter-inicio');
  if (inputInicio) {
    inputInicio.addEventListener('change', (e) => {
      filterState.inicio = e.target.value;
    });
  }

  // Input fecha fin
  const inputFin = document.getElementById('filter-fin');
  if (inputFin) {
    inputFin.addEventListener('change', (e) => {
      filterState.fin = e.target.value;
    });
  }

  // Select tipo
  const selectTipo = document.getElementById('filter-tipo');
  if (selectTipo) {
    // Poblar con categorías raíz
    filterState.categories
      .filter((c) => !c.parent_id)
      .forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        selectTipo.appendChild(opt);
      });
    selectTipo.addEventListener('change', (e) => {
      filterState.tipo_id = e.target.value
        ? parseInt(e.target.value, 10)
        : null;
    });
  }

  // Select país (para ubicación) — progressive via location.service
  const selectPais = document.getElementById('filter-pais');
  if (selectPais) {
    selectPais.addEventListener('change', async (e) => {
      filterState.pais_id = e.target.value
        ? parseInt(e.target.value, 10)
        : null;
      // Limpiar provincia y ciudad
      filterState.provincia_id = null;
      filterState.ciudad_id = null;
      filterState.provinces = [];
      filterState.cities = [];

      const selectProvia = document.getElementById('filter-provincia');
      const selectCiudad = document.getElementById('filter-ciudad');

      if (selectCiudad) {
        selectCiudad.innerHTML =
          '<option value="">-- Seleccione ciudad --</option>';
        selectCiudad.disabled = true;
      }

      if (!filterState.pais_id) {
        // No country selected — disable province select
        if (selectProvia) {
          selectProvia.innerHTML =
            '<option value="">-- Seleccione provincia --</option>';
          selectProvia.disabled = true;
        }
        return;
      }

      // Country selected — enable province select and load provinces
      if (selectProvia) {
        selectProvia.innerHTML = '<option value="">Cargando...</option>';
        selectProvia.disabled = false;
      }

      try {
        filterState.provinces = await locationService.getChildren({
          parentId: filterState.pais_id,
        });
        if (selectProvia) {
          selectProvia.innerHTML =
            '<option value="">-- Seleccione provincia --</option>';
          filterState.provinces.forEach((prov) => {
            const opt = document.createElement('option');
            opt.value = prov.id;
            opt.textContent = prov.name;
            selectProvia.appendChild(opt);
          });
        }
      } catch {
        if (selectProvia) {
          populateSelectError(selectProvia, 'Error al cargar provincias');
        }
      }
    });
  }

  // Select provincia — progressive via location.service
  const selectProvia = document.getElementById('filter-provincia');
  if (selectProvia) {
    // Disable until a country is selected (already handled in country handler)
    selectProvia.disabled = true;
    selectProvia.innerHTML =
      '<option value="">-- Seleccione provincia --</option>';

    selectProvia.addEventListener('change', async (e) => {
      filterState.provincia_id = e.target.value
        ? parseInt(e.target.value, 10)
        : null;
      filterState.ciudad_id = null;

      const selectCiudad = document.getElementById('filter-ciudad');

      if (selectCiudad) {
        selectCiudad.innerHTML =
          '<option value="">-- Seleccione ciudad --</option>';
        selectCiudad.disabled = true;
      }

      if (!filterState.provincia_id) {
        return;
      }

      // Province selected — load cities
      if (selectCiudad) {
        selectCiudad.innerHTML = '<option value="">Cargando...</option>';
        selectCiudad.disabled = false;
      }

      try {
        filterState.cities = await locationService.getChildren({
          parentId: filterState.provincia_id,
        });
        if (selectCiudad) {
          selectCiudad.innerHTML =
            '<option value="">-- Seleccione ciudad --</option>';
          filterState.cities.forEach((city) => {
            const opt = document.createElement('option');
            opt.value = city.id;
            opt.textContent = city.name;
            selectCiudad.appendChild(opt);
          });
        }
      } catch {
        if (selectCiudad) {
          populateSelectError(selectCiudad, 'Error al cargar ciudades');
        }
      }
    });
  }

  // Select ciudad
  const selectCiudad = document.getElementById('filter-ciudad');
  if (selectCiudad) {
    selectCiudad.disabled = true;
    selectCiudad.addEventListener('change', (e) => {
      filterState.ciudad_id = e.target.value
        ? parseInt(e.target.value, 10)
        : null;
    });
  }
}

function populateCountrySelect() {
  const selectPais = document.getElementById('filter-pais');
  if (!selectPais) return;
  selectPais.innerHTML = '<option value="">-- Seleccione país --</option>';
  filterState.countries.forEach((country) => {
    const opt = document.createElement('option');
    opt.value = country.id;
    opt.textContent = country.name;
    selectPais.appendChild(opt);
  });
}

// ─────────────────────────────────────────────
// Export dropdown — hits GET /api/incidents/exportar with the active
// filterState. Browsers start the download via a temporary anchor so
// the user stays on the dashboard (no navigation).
// ─────────────────────────────────────────────
// Only the real backend filters live here. `locationTree` and
// `categories` are dropdown data cached on filterState for the picker
// UI — they are NOT query params the endpoint accepts, and serialising
// them via URLSearchParams would yield "locationTree=[object Object]"
// which 422s the request.
const EXPORT_FILTER_KEYS = [
  'inicio',
  'fin',
  'tipo_id',
  'ciudad_id',
  'provincia_id',
  'pais_id',
];

function setupExportListeners() {
  document.querySelectorAll('[data-export-format]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const format = e.currentTarget.dataset.exportFormat;
      if (!format) return;

      const params = new URLSearchParams();
      params.set('format', format);
      for (const key of EXPORT_FILTER_KEYS) {
        const value = filterState[key];
        if (value !== null && value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }

      triggerDownload(`/incidents/exportar?${params.toString()}`);
    });
  });
}

async function triggerDownload(path) {
  try {
    // Reuse the shared http service so JWT header / refresh flow is
    // identical to every other dashboard call. `responseType: 'blob'`
    // tells the service not to JSON-parse.
    // `path` must be a RELATIVE path (e.g. `/incidents/exportar?...`)
    // because http.get() prepends API_URL = '/api' for us. Passing a
    // full URL would double the prefix and 404.
    const blob = await http.get(path, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    // The server sets the filename via Content-Disposition, but a
    // deterministic local fallback keeps the file usable when the
    // header is stripped (e.g. some corporate proxies).
    const format =
      new URLSearchParams(path.split('?')[1] || '').get('format') || 'reporte';
    const date = new Date().toISOString().slice(0, 10);
    a.download = `incidencias-${date}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    // The previous fallback (`window.location.assign(url)`) navigated
    // full-page without the JWT header, so the request came back as
    // 401 'Token de autenticación no proporcionado.' — confusing
    // because the user IS logged in, the request just can't carry
    // headers on a top-level navigation. Show the error instead and
    // let the user retry.
    console.error('Error al exportar:', err);
    const message =
      err && err.status
        ? `No se pudo exportar (HTTP ${err.status}). Reintentá.`
        : 'No se pudo exportar. Reintentá o revisá tu conexión.';
    window.alert(message);
  }
}

// ─────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────
export default {
  template,
  style,

  async onInit() {
    // C3 y feed de actividad en paralelo
    const [, feedResult] = await Promise.allSettled([
      loadC3(),
      http.get('/incidents?per_page=5'),
    ]);

    // Setup de filtros (carga listener e inicializa opciones)
    setupFilterListeners();
    setupQuickFilterListeners();
    setupExportListeners();

    const retryButton = document.getElementById('dashboard-retry');
    if (retryButton) {
      retryButton.textContent = dashboardMessages.retry;
      retryButton.addEventListener('click', refreshDashboard);
    }

    // Cargar stats iniciales (sin filtros)
    await refreshDashboard();

    // Activity feed — últimas 5 incidencias (independiente de stats)
    try {
      const resp =
        feedResult.status === 'fulfilled' ? (feedResult.value ?? {}) : {};
      const items =
        resp.data ?? resp.items ?? (Array.isArray(resp) ? resp : []);
      buildActivityFeed(items);
    } catch {
      /* mantener estado vacío */
    }
  },

  onDestroy() {},
};
