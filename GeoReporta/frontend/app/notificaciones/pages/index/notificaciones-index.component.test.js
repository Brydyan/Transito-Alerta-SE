/**
 * notificaciones-index.component — integration tests
 *
 * @vitest-environment jsdom
 *
 * Mock strategy: reassign http service properties in beforeEach (same pattern as
 * incidencias.index.component.test.js).  This approach survives vi.restoreAllMocks()
 * in the global afterEach because the property is re-assigned in every beforeEach.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock auth.service.js — reassigned in beforeEach
// ---------------------------------------------------------------------------
vi.mock('../../../auth/auth.service.js', () => ({
  auth: {
    me: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock select-search.js
// ---------------------------------------------------------------------------
vi.mock('../../../shared/select-search.js', () => ({
  initSelect: vi.fn(),
  clearSelect: vi.fn(),
  destroyAll: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Bootstrap Modal mock
// ---------------------------------------------------------------------------
let shownModalEl = null;

class MockModal {
  constructor(el) {
    this._el = el;
  }
  show() {
    shownModalEl = this._el;
  }
  hide() {
    shownModalEl = null;
  }
  static getInstance() {
    return shownModalEl ? { hide: () => {} } : null;
  }
}

// ---------------------------------------------------------------------------
// Fixture HTML
// ---------------------------------------------------------------------------
const FIXTURE_HTML = `
<div class="gr-page">
  <div class="gr-page__header">
    <h1 class="gr-page__title">Notificaciones</h1>
  </div>
  <ul class="nav nav-tabs mb-3" id="notif-tabs">
    <li class="nav-item">
      <button class="nav-link active" data-tab="pending" id="tab-pending" type="button">Pendientes de aprobación</button>
    </li>
    <li class="nav-item">
      <button class="nav-link" data-tab="read" id="tab-read" type="button">Leídas</button>
    </li>
    <li class="nav-item">
      <button class="nav-link" data-tab="all" id="tab-all" type="button">Todas</button>
    </li>
  </ul>
  <div class="gr-card gr-filters">
    <div class="gr-filters__selects">
      <div class="gr-select-wrap" id="filtro-organizacion-wrap">
        <select class="gr-select" id="filtro-organizacion"><option value="">Organización</option></select>
      </div>
      <button id="btn-filtrar">Filtrar</button>
      <button id="btn-limpiar">Limpiar</button>
    </div>
  </div>
  <div class="gr-card">
    <div id="estado-cargando" class="gr-estado-center"></div>
    <div id="estado-vacio" class="gr-estado-center d-none"></div>
    <div id="estado-error" class="gr-estado-center d-none">
      <button id="btn-reintentar">Reintentar</button>
    </div>
    <div id="contenedor-tabla" class="d-none">
      <div class="gr-table-wrap d-none d-md-block">
        <table class="gr-table">
          <thead><tr><th></th><th>TÍTULO</th><th>FECHA</th><th></th></tr></thead>
          <tbody id="tabla-body"></tbody>
        </table>
      </div>
      <div id="contenedor-cards"></div>
      <div class="gr-table-footer">
        <small id="info-resultados"></small>
        <ul class="pagination pagination-sm mb-0" id="paginacion"></ul>
      </div>
    </div>
  </div>
</div>
<div class="modal fade" id="modal-rechazar" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Rechazar</h5></div>
      <div class="modal-body">
        <textarea id="rechazo-motivo"></textarea>
      </div>
      <div class="modal-footer">
        <button id="btn-confirmar-rechazar">
          <span id="rechazo-texto">Rechazar</span>
          <span id="rechazo-loading" class="d-none"></span>
        </button>
      </div>
    </div>
  </div>
</div>
<div id="toast-msg"><div id="toast-msg-texto"></div></div>
`;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const MOCK_PENDING_NOTIFS = [
  {
    id: '1',
    type: 'incident_pending_approval',
    read_at: null,
    title: 'Bache en Rivadavia',
    data: {
      title: 'Bache en Rivadavia',
      organization: { name: 'Municipalidad' },
    },
    organization: { name: 'Municipalidad' },
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    type: 'incident_pending_approval',
    read_at: null,
    title: 'Semáforo dañado',
    data: { title: 'Semáforo dañado', organization: { name: 'Gobierno' } },
    organization: { name: 'Gobierno' },
    created_at: '2024-01-16T14:30:00Z',
  },
];

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------
let componentModule;

// ---------------------------------------------------------------------------
// beforeEach — reassign http service properties (survives vi.restoreAllMocks)
// ---------------------------------------------------------------------------

beforeEach(async () => {
  shownModalEl = null;

  // Desktop viewport for isDesktop()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });

  globalThis.bootstrap = {
    ...globalThis.bootstrap,
    Modal: MockModal,
  };

  document.body.innerHTML = FIXTURE_HTML;

  // Reassign http service properties — survives vi.restoreAllMocks() because
  // the property is re-assigned in every beforeEach (same pattern as
  // incidencias.index.component.test.js)
  const { http } = await import('../../../core/http.service.js');
  const { auth } = await import('../../../auth/auth.service.js');

  // Default: empty pending, empty list
  http.get = vi.fn((url) => {
    if (url === '/me') {
      return Promise.resolve({ id: '1', role: 'admin_sistema' });
    }
    if (url.includes('type=incident_pending_approval')) {
      return Promise.resolve({ data: [], meta: { total: 0 } });
    }
    if (url.includes('/notifications?')) {
      return Promise.resolve({ data: [], meta: { total: 0 }, unread_count: 0 });
    }
    return Promise.reject(new Error('Unexpected GET: ' + url));
  });
  http.post = vi.fn((url) => {
    if (url.includes('/approve')) {
      return Promise.resolve({ data: { success: true } });
    }
    if (url.includes('/reject')) {
      return Promise.resolve({ data: { success: true } });
    }
    return Promise.reject(new Error('Unexpected POST: ' + url));
  });
  http.patch = vi.fn().mockResolvedValue({});

  auth.me = vi.fn(() => Promise.resolve({ id: '1', role: 'admin_sistema' }));

  // Load component module once and cache
  if (!componentModule) {
    componentModule = await import('./notificaciones-index.component.js');
  }
});

// ---------------------------------------------------------------------------
// afterEach — do NOT call vi.restoreAllMocks()
// ---------------------------------------------------------------------------

afterEach(() => {
  document.body.innerHTML = '';
  // Do NOT call vi.restoreAllMocks() — it removes spy wrappers from
  // reassigned properties, breaking subsequent tests.
  // Do NOT call vi.resetModules() — it breaks vi.mock caching.
});

// ---------------------------------------------------------------------------
// Helper: configure pending notifications and load component
// ---------------------------------------------------------------------------

async function loadComponentWithPending(pendingNotifs, pendingTotal) {
  const { http } = await import('../../../core/http.service.js');
  http.get = vi.fn((url) => {
    if (url === '/me') {
      return Promise.resolve({ id: '1', role: 'admin_sistema' });
    }
    if (url.includes('type=incident_pending_approval')) {
      return Promise.resolve({
        data: pendingNotifs,
        meta: { total: pendingTotal },
      });
    }
    if (url.includes('/notifications?')) {
      return Promise.resolve({ data: [], meta: { total: 0 }, unread_count: 0 });
    }
    return Promise.reject(new Error('Unexpected GET: ' + url));
  });
  await componentModule.default.onInit();
  return componentModule.default;
}

// ---------------------------------------------------------------------------
// Tests — default tab
// ---------------------------------------------------------------------------

describe('Default tab', () => {
  it('sets currentTab to pending on init', async () => {
    const component = await loadComponentWithPending([], 0);
    expect(component.currentTab).toBe('pending');
  });

  it('shows pending tab as active after init', async () => {
    await loadComponentWithPending([], 0);
    const pendingTab = document.getElementById('tab-pending');
    expect(pendingTab.classList.contains('active')).toBe(true);
  });

  it('renders pending notifications in table after init', async () => {
    await loadComponentWithPending(MOCK_PENDING_NOTIFS, 2);
    const rows = document.querySelectorAll('#tabla-body tr');
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — approve action
// ---------------------------------------------------------------------------

describe('Approve action', () => {
  it('calls notificationService.approve(id=1) when approve button is clicked', async () => {
    const { http } = await import('../../../core/http.service.js');
    const postSpy = http.post;

    await loadComponentWithPending(MOCK_PENDING_NOTIFS, 2);

    const firstRow = document.querySelector('#tabla-body tr[data-id="1"]');
    expect(firstRow).not.toBeNull();

    const approveBtn = firstRow.querySelector('[data-action="approve"]');
    approveBtn.click();

    // Wait for async approve to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(postSpy).toHaveBeenCalledWith('/notifications/1/approve');
  });
});

// ---------------------------------------------------------------------------
// Tests — reject action
// ---------------------------------------------------------------------------

describe('Reject action', () => {
  it('opens the reject modal when reject button is clicked', async () => {
    await loadComponentWithPending(MOCK_PENDING_NOTIFS, 2);

    const firstRow = document.querySelector('#tabla-body tr[data-id="1"]');
    expect(firstRow).not.toBeNull();

    const rejectBtn = firstRow.querySelector('[data-action="reject"]');
    rejectBtn.click();

    expect(shownModalEl).not.toBeNull();
    expect(shownModalEl.id).toBe('modal-rechazar');
  });
});

// ---------------------------------------------------------------------------
// Tests — organization filter visibility
// ---------------------------------------------------------------------------

describe('Organization filter', () => {
  it('organization filter is visible for admin_sistema users', async () => {
    await loadComponentWithPending([], 0);

    const orgFilterWrap = document.getElementById('filtro-organizacion-wrap');
    expect(orgFilterWrap.classList.contains('d-none')).toBe(false);
  });
});
