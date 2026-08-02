/**
 * incidencias.index.component — integration tests
 *
 * Tests the migration of the incidencias index page from hardcoded
 * action buttons to the shared table-actions component.
 *
 * Coverage:
 * - Permission-driven rendering of Ver + kebab actions in table and mobile cards
 * - CustomEvent delegation: view → router.navigate, edit → router.navigate,
 *   delete → bootstrap.Modal
 * - Mobile card rendering (<768px) renders actions in card body
 * - Re-hydration when permissionService.invalidateMyPermissions() is called
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAuthState, setAccessToken } from '../../../core/http.service.js';

// ---------------------------------------------------------------------------
// Mocked module imports
// ---------------------------------------------------------------------------

// Mock http.service — called by cargarIncidencias
vi.mock('../../../core/http.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    setAccessToken: mod.setAccessToken,
    clearAuthState: mod.clearAuthState,
    http: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue(null),
    },
  };
});

// Mock router — called by action handlers
const routerNavigateSpy = vi.fn();
vi.mock('../../../core/router.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    router: {
      ...mod.router,
      navigate: routerNavigateSpy,
    },
  };
});

// Mock TomSelect (called by onInit for filter selects)
vi.mock('../../../shared/select-search.js', () => ({
  initSelect: vi.fn(),
  clearSelect: vi.fn(),
  destroyAll: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocked external service — permissionService
// ---------------------------------------------------------------------------
import { permissionService } from '../../../shared/permission.service.js';

// ---------------------------------------------------------------------------
// Mocked external component — table-actions
// ---------------------------------------------------------------------------
const tableActionsInstances = [];
let getMyPermissionsMock = vi
  .fn()
  .mockResolvedValue(new Set(['incidents.update', 'incidents.delete']));

vi.mock(
  '../../../shared/table-actions/table-actions.component.js',
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      mount: vi.fn(async (el, ctx) => {
        // Determine which items to render based on user's CURRENT permissions
        const perms = await getMyPermissionsMock();
        const hasUpdate = perms.has(ctx.slugs.update);
        const hasDelete = perms.has(ctx.slugs.delete);

        // Re-hydration callback — re-fetches permissions and re-renders items
        const rehydrate = async () => {
          const freshPerms = await getMyPermissionsMock();
          const fHasUpdate = freshPerms.has(ctx.slugs.update);
          const fHasDelete = freshPerms.has(ctx.slugs.delete);

          const editItem = el.querySelector('.table-actions-edit-item');
          const deleteItem = el.querySelector('.table-actions-delete-item');
          const toggle = el.querySelector('.dropdown-toggle');

          if (editItem) {
            if (fHasUpdate) {
              editItem.style.display = '';
            } else {
              editItem.remove();
            }
          }
          if (deleteItem) {
            if (fHasDelete) {
              deleteItem.style.display = '';
            } else {
              deleteItem.remove();
            }
          }
          if (toggle) {
            if (fHasUpdate || fHasDelete) {
              toggle.removeAttribute('disabled');
              toggle.removeAttribute('title');
            } else {
              toggle.setAttribute('disabled', '');
              toggle.setAttribute('title', 'No tenés acciones disponibles');
            }
          }
        };

        // Subscribe to permission invalidation (enables re-hydration tests)
        permissionService.onInvalidate(rehydrate);

        // Inject minimal stub that fires CustomEvents when buttons are clicked
        el.innerHTML = `
        <a class="btn-ver" href="#" data-action="view" title="Ver detalle">
          <i class="fa-solid fa-eye"></i>
        </a>
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle"
                  type="button" data-bs-toggle="dropdown"
                  aria-expanded="false" aria-label="Acciones"
                  ${!hasUpdate && !hasDelete ? 'disabled title="No tenés acciones disponibles"' : ''}>
            <i class="fa-solid fa-ellipsis-v"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            ${
              hasUpdate
                ? `
            <li class="table-actions-edit-item">
              <a class="dropdown-item table-actions-edit" href="#" data-action="edit">
                <i class="fa-solid fa-edit"></i> Editar
              </a>
            </li>`
                : ''
            }
            ${
              hasDelete
                ? `
            <li class="table-actions-delete-item">
              <a class="dropdown-item table-actions-delete text-danger" href="#" data-action="delete">
                <i class="fa-solid fa-trash-alt"></i> Eliminar
              </a>
            </li>`
                : ''
            }
          </ul>
        </div>`;

        // Wire view
        const verBtn = el.querySelector('.btn-ver');
        if (verBtn) {
          verBtn.addEventListener('click', (e) => {
            e.preventDefault();
            el.dispatchEvent(
              new CustomEvent('table-actions:view', {
                bubbles: true,
                detail: { id: ctx.id, titulo: ctx.titulo },
              }),
            );
          });
        }

        // Wire edit
        const editItem = el.querySelector('.table-actions-edit');
        if (editItem) {
          editItem.addEventListener('click', (e) => {
            e.preventDefault();
            el.dispatchEvent(
              new CustomEvent('table-actions:edit', {
                bubbles: true,
                detail: { id: ctx.id, titulo: ctx.titulo },
              }),
            );
          });
        }

        // Wire delete
        const deleteItem = el.querySelector('.table-actions-delete');
        if (deleteItem) {
          deleteItem.addEventListener('click', (e) => {
            e.preventDefault();
            el.dispatchEvent(
              new CustomEvent('table-actions:delete', {
                bubbles: true,
                detail: { id: ctx.id, titulo: ctx.titulo },
              }),
            );
          });
        }

        tableActionsInstances.push({ el, ctx, _rehydrate: rehydrate });
      }),
      unmount: vi.fn((el) => {
        el.innerHTML = '';
      }),
    };
  },
);

// ---------------------------------------------------------------------------
// Table-actions HTML template mock (fetch returns this)
// ---------------------------------------------------------------------------
const TABLE_ACTIONS_HTML = `<div class="d-flex justify-content-center gap-1">
  <a class="btn btn-sm btn-outline-primary btn-ver" href="#" data-action="view" aria-label="Ver detalle">
    <i class="fa-solid fa-eye"></i>
  </a>
  <div class="dropdown">
    <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button"
            data-bs-toggle="dropdown" aria-expanded="false" aria-label="Acciones">
      <i class="fa-solid fa-ellipsis-v"></i>
    </button>
    <ul class="dropdown-menu dropdown-menu-end">
      <li class="table-actions-edit-item" data-action="edit" style="display:none">
        <a class="dropdown-item table-actions-edit" href="#" data-action="edit" aria-label="Editar">
          <i class="fa-solid fa-edit"></i> Editar
        </a>
      </li>
      <li class="table-actions-delete-item" data-action="delete" style="display:none">
        <a class="dropdown-item table-actions-delete text-danger" href="#" data-action="delete" aria-label="Eliminar">
          <i class="fa-solid fa-trash-alt"></i> Eliminar
        </a>
      </li>
    </ul>
  </div>
</div>`;

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
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fixture HTML — mirrors incidencias.index.component.html
// ---------------------------------------------------------------------------
const FIXTURE_HTML = `
<div class="gr-page">
  <div class="gr-page__header">
    <h1 class="gr-page__title">Incidencias</h1>
    <a href="#/incidencias/crear" id="btn-nueva-incidencia" class="d-none">Nueva incidencia</a>
  </div>
  <div class="gr-card gr-filters">
    <input type="text" id="filtro-buscar" />
    <select id="filtro-estado"><option value="">Estado</option></select>
    <select id="filtro-prioridad"><option value="">Prioridad</option></select>
    <button id="btn-filtrar">Filtrar</button>
    <button id="btn-limpiar">Limpiar</button>
  </div>
  <div class="gr-card">
    <div id="estado-cargando"></div>
    <div id="estado-vacio" class="d-none"></div>
    <div id="estado-error" class="d-none">
      <button type="button" id="btn-reintentar">Reintentar</button>
    </div>
    <div id="contenedor-tabla" class="d-none">
      <div class="gr-table-wrap">
        <table class="gr-table">
          <thead><tr><th></th><th>TÍTULO</th><th>PRIORIDAD</th><th>ESTADO</th><th>UBICACIÓN</th><th>FECHA</th><th></th></tr></thead>
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
<div class="modal fade" id="modal-eliminar" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Eliminar</h5></div>
      <div class="modal-body">
        <p id="modal-eliminar-titulo"></p>
      </div>
      <div class="modal-footer">
        <button id="btn-confirmar-eliminar">Eliminar</button>
        <span id="eliminar-texto"></span>
        <span id="eliminar-loading" class="d-none"></span>
      </div>
    </div>
  </div>
</div>
<div id="toast-msg"><div id="toast-msg-texto"></div></div>
`;

// ---------------------------------------------------------------------------
// Helper: mock window.matchMedia
// ---------------------------------------------------------------------------
function mockMatchMediaDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const MOCK_INCIDENCIAS = [
  {
    id: '1',
    title: 'Bache en Rivadavia',
    category: { name: 'Infraestructura' },
    location: { name: 'Centro' },
    priority: 'high',
    status: 'pending',
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    title: 'Semáforo dañado',
    category: { name: 'Tráfico' },
    location: { name: 'Norte' },
    priority: 'medium',
    status: 'in_progress',
    created_at: '2024-01-16T14:30:00Z',
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let componentModule;

beforeEach(async () => {
  clearAuthState();
  setAccessToken('test-token');

  // Manually reset call counts WITHOUT vi.clearAllMocks() — that would
  // reset mockImplementation on the permissionService spy, breaking re-hydration.
  if (routerNavigateSpy.mock) {
    routerNavigateSpy.mock.calls.length = 0;
    routerNavigateSpy.mock.results.length = 0;
  }

  tableActionsInstances.length = 0;
  shownModalEl = null;

  // Reset permissionService state
  permissionService.invalidateMyPermissions();

  // Default: desktop viewport
  mockMatchMediaDesktop();

  // Single permission mock using mockImplementation with call-counting.
  // First 2 calls = initial mount() for 2 incidents (full perms).
  // Subsequent calls = re-hydration (returns whatever perms were configured).
  // This approach survives vi.restoreAllMocks() in afterEach.
  const permsToReturn = new Set(['incidents.update', 'incidents.delete']);
  getMyPermissionsMock = vi.fn().mockImplementation(() => {
    // Return the current permsToReturn (can be updated per-test)
    return Promise.resolve(new Set(permsToReturn));
  });
  vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
    getMyPermissionsMock,
  );

  // HTTP mock for cargarIncidencias
  const { http } = await import('../../../core/http.service.js');
  http.get.mockResolvedValue({ data: MOCK_INCIDENCIAS, meta: { total: 2 } });
  http.delete.mockResolvedValue({});

  // Bootstrap mocks
  globalThis.bootstrap = {
    ...globalThis.bootstrap,
    Modal: MockModal,
    Dropdown: class Dropdown {
      constructor(el) {
        this._el = el;
        el._bootstrapDropdown = this;
      }
      show() {
        this._el.setAttribute('aria-expanded', 'true');
      }
      hide() {
        this._el.setAttribute('aria-expanded', 'false');
      }
      dispose() {
        delete this._el._bootstrapDropdown;
      }
      static getInstance(el) {
        return el._bootstrapDropdown || null;
      }
    },
    Toast: class Toast {
      constructor(el) {
        this._el = el;
      }
      show() {}
    },
  };

  // Fetch mock for table-actions template
  globalThis.fetch = vi.fn((url) => {
    if (url.endsWith('.html')) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(TABLE_ACTIONS_HTML),
      });
    }
    return Promise.reject(new Error('Unexpected fetch URL: ' + url));
  });

  // Load component module once
  if (!componentModule) {
    componentModule = await import('./incidencias.index.component.js');
  }

  // Mount fixture
  document.body.innerHTML = FIXTURE_HTML;
});

afterEach(() => {
  document.body.innerHTML = '';
  // Do NOT call vi.restoreAllMocks() — it removes spy wrappers from
  // permissionService.getMyPermissions, which breaks the re-hydration tests.
  // Spies are re-created in each beforeEach anyway.
});

// ---------------------------------------------------------------------------
// Helper: render the table with the given permissions
// ---------------------------------------------------------------------------
async function renderIndexWithPermissions(perms) {
  // Configure the existing mock (from beforeEach) to return the given permissions.
  // NOT reassigning permissionService.getMyPermissions — the existing spy
  // is configured to call getMyPermissionsMock, so updating the function
  // (without reassigning the property) ensures the spy uses the updated mock
  // even after vi.clearAllMocks() in the next test's beforeEach.
  getMyPermissionsMock = vi.fn().mockResolvedValue(perms);
  // Update the existing spy's implementation to use the new mock
  vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
    getMyPermissionsMock,
  );
  permissionService.invalidateMyPermissions();
  // Call onInit — it is async and returns a promise; await it so all
  // async operations (cargarIncidencias → renderTabla → mount) complete.
  await componentModule.default.onInit();
}

// ---------------------------------------------------------------------------
// DESKTOP — permission-driven action rendering
// ---------------------------------------------------------------------------

describe('Desktop — permission-driven action rendering', () => {
  it('renders Ver + Editar + Eliminar in kebab when user has both permissions', async () => {
    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    const rows = document.querySelectorAll('#tabla-body tr');
    expect(rows).toHaveLength(2);

    // Each row has a table-actions component
    const tableActions = document.querySelectorAll('#tabla-body table-actions');
    expect(tableActions).toHaveLength(2);

    // Kebab toggle is NOT disabled (has both actions)
    const toggles = document.querySelectorAll('#tabla-body .dropdown-toggle');
    expect(toggles).toHaveLength(2);
    toggles.forEach((t) => {
      expect(t.hasAttribute('disabled')).toBe(false);
    });

    // Both Edit and Delete items are present in the dropdown menu
    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(editItems).toHaveLength(2);
    expect(deleteItems).toHaveLength(2);
  });

  it('renders only Ver + Editar (no Eliminar) when user lacks delete permission', async () => {
    await renderIndexWithPermissions(new Set(['incidents.update']));

    const tableActionsEls = document.querySelectorAll(
      '#tabla-body table-actions',
    );
    expect(tableActionsEls).toHaveLength(2);

    // Edit item is present
    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    expect(editItems).toHaveLength(2);

    // Delete item is NOT in DOM
    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(deleteItems).toHaveLength(0);
  });

  it('renders only Ver + Eliminar (no Editar) when user lacks update permission', async () => {
    await renderIndexWithPermissions(new Set(['incidents.delete']));

    const tableActionsEls = document.querySelectorAll(
      '#tabla-body table-actions',
    );
    expect(tableActionsEls).toHaveLength(2);

    // Edit item is NOT in DOM
    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    expect(editItems).toHaveLength(0);

    // Delete item is present
    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(deleteItems).toHaveLength(2);
  });

  it('renders kebab disabled with tooltip when user has no action permissions', async () => {
    await renderIndexWithPermissions(new Set(['incidents.view']));

    const tableActionsEls = document.querySelectorAll(
      '#tabla-body table-actions',
    );
    expect(tableActionsEls).toHaveLength(2);

    // Kebab toggle is disabled
    const toggles = document.querySelectorAll('#tabla-body .dropdown-toggle');
    expect(toggles).toHaveLength(2);
    toggles.forEach((t) => {
      expect(t.hasAttribute('disabled')).toBe(true);
      expect(t.getAttribute('title')).toBe('No tenés acciones disponibles');
    });

    // No edit or delete items
    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(editItems).toHaveLength(0);
    expect(deleteItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Action handlers — routing from CustomEvents
// ---------------------------------------------------------------------------

describe('Action handlers — CustomEvent delegation', () => {
  it('clicking Editar in kebab navigates to /incidencias/crear?id={id}', async () => {
    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    // Open the dropdown then click Editar
    const firstRowActions = document.querySelector('#tabla-body table-actions');
    const toggle = firstRowActions.querySelector('.dropdown-toggle');
    toggle.click(); // Bootstrap dropdown toggle

    const editItem = firstRowActions.querySelector('.table-actions-edit');
    editItem.click();

    expect(routerNavigateSpy).toHaveBeenCalledWith('/incidencias/crear?id=1');
  });

  it('clicking Eliminar in kebab opens the Bootstrap Delete Modal', async () => {
    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    const firstRowActions = document.querySelector('#tabla-body table-actions');
    const toggle = firstRowActions.querySelector('.dropdown-toggle');
    toggle.click();

    const deleteItem = firstRowActions.querySelector('.table-actions-delete');
    deleteItem.click();

    // The delete modal should be opened
    expect(shownModalEl).not.toBeNull();
    expect(shownModalEl.id).toBe('modal-eliminar');
    // The modal title should be populated with the incidence title
    expect(document.getElementById('modal-eliminar-titulo').textContent).toBe(
      'Bache en Rivadavia',
    );
  });
});

// ---------------------------------------------------------------------------
// Mobile rendering
// ---------------------------------------------------------------------------

describe('Mobile — actions render in card body', () => {
  it('at <768px the table is hidden and actions render in card body', async () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    // Table body should be empty
    expect(document.getElementById('tabla-body').innerHTML).toBe('');

    // Cards should be rendered
    const cards = document.querySelectorAll('#contenedor-cards .lista-card');
    expect(cards).toHaveLength(2);

    // Each card has a table-actions component
    const tableActionsInCards = document.querySelectorAll(
      '#contenedor-cards table-actions',
    );
    expect(tableActionsInCards).toHaveLength(2);

    // Kebab toggle is NOT disabled
    const toggles = document.querySelectorAll(
      '#contenedor-cards .dropdown-toggle',
    );
    expect(toggles).toHaveLength(2);
    toggles.forEach((t) => expect(t.hasAttribute('disabled')).toBe(false));
  });

  it('mobile Editar click navigates to /incidencias/crear?id={id}', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    const firstCardActions = document.querySelector(
      '#contenedor-cards table-actions',
    );
    const toggle = firstCardActions.querySelector('.dropdown-toggle');
    toggle.click();
    const editItem = firstCardActions.querySelector('.table-actions-edit');
    editItem.click();

    expect(routerNavigateSpy).toHaveBeenCalledWith('/incidencias/crear?id=1');
  });

  it('mobile Eliminar click opens the Bootstrap Delete Modal', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    const firstCardActions = document.querySelector(
      '#contenedor-cards table-actions',
    );
    const toggle = firstCardActions.querySelector('.dropdown-toggle');
    toggle.click();
    const deleteItem = firstCardActions.querySelector('.table-actions-delete');
    deleteItem.click();

    expect(shownModalEl).not.toBeNull();
    expect(shownModalEl.id).toBe('modal-eliminar');
  });
});

// ---------------------------------------------------------------------------
// Re-hydration — permission invalidation re-renders actions
// ---------------------------------------------------------------------------

describe('Re-hydration — permission invalidation re-evaluates actions', () => {
  it('calling invalidateMyPermissions() re-evaluates the kebab state without page reload', async () => {
    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    // Verify initial state: kebab NOT disabled, Edit present, Delete present
    let toggle = document.querySelector('#tabla-body .dropdown-toggle');
    expect(toggle.hasAttribute('disabled')).toBe(false);
    let editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    let deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(editItems).toHaveLength(2);
    expect(deleteItems).toHaveLength(2);

    // Simulate permission change: after re-hydration, only delete remains.
    // Update the spy's implementation so the rehydrate callback sees fresh perms.
    getMyPermissionsMock = vi
      .fn()
      .mockResolvedValue(new Set(['incidents.delete']));
    vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
      getMyPermissionsMock,
    );

    // Trigger the real re-hydration flow (kebab-actions subscribes to
    // permissionService.onInvalidate).
    permissionService.invalidateMyPermissions();

    await vi.waitFor(() => {
      const items = document.querySelectorAll(
        '#tabla-body .table-actions-edit-item',
      );
      if (items.length !== 0)
        throw new Error(`edit items still present: ${items.length}`);
    });

    // After re-hydration: kebab is still NOT disabled (has delete)
    // but Edit item should be removed
    toggle = document.querySelector('#tabla-body .dropdown-toggle');
    expect(toggle.hasAttribute('disabled')).toBe(false);

    editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    expect(editItems).toHaveLength(0); // update permission gone

    deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(deleteItems).toHaveLength(2); // delete still there
  });

  it('kebab becomes disabled when all action permissions are revoked via invalidation', async () => {
    await renderIndexWithPermissions(
      new Set(['incidents.update', 'incidents.delete']),
    );

    // Verify initial: kebab NOT disabled
    let toggle = document.querySelector('#tabla-body .dropdown-toggle');
    expect(toggle.hasAttribute('disabled')).toBe(false);

    // Simulate: all action permissions revoked.
    getMyPermissionsMock = vi
      .fn()
      .mockResolvedValue(new Set(['incidents.view']));
    vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
      getMyPermissionsMock,
    );

    permissionService.invalidateMyPermissions();

    await vi.waitFor(() => {
      const t = document.querySelector('#tabla-body .dropdown-toggle');
      if (!t.hasAttribute('disabled'))
        throw new Error('toggle not disabled yet');
    });

    // Kebab should now be disabled
    toggle = document.querySelector('#tabla-body .dropdown-toggle');
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(toggle.getAttribute('title')).toBe('No tenés acciones disponibles');
  });
});
