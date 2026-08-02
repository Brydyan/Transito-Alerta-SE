/**
 * usuarios.index.component — tests
 *
 * Two suites:
 * 1. R-24 403 differentiation (pre-existing)
 * 2. table-actions migration — permission-driven Ver + kebab actions
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearAuthState,
  setAccessToken,
  http,
} from '../../../../core/http.service.js';

// ---------------------------------------------------------------------------
// Mocked module imports
// ---------------------------------------------------------------------------

// Mock http.service
vi.mock('../../../../core/http.service.js', async (importOriginal) => {
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

// Mock router
const routerNavigateSpy = vi.fn();
vi.mock('../../../../core/router.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    router: {
      ...mod.router,
      navigate: routerNavigateSpy,
    },
  };
});

// ---------------------------------------------------------------------------
// Mocked external service — permissionService
// ---------------------------------------------------------------------------
import { permissionService } from '../../../../shared/permission.service.js';

// ---------------------------------------------------------------------------
// Mocked external component — table-actions
// ---------------------------------------------------------------------------
const tableActionsInstances = [];
let getMyPermissionsMock = vi.fn().mockResolvedValue(new Set());

vi.mock(
  '../../../../shared/table-actions/table-actions.component.js',
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      mount: vi.fn(async (el, ctx) => {
        const perms = await getMyPermissionsMock();
        const hasUpdate = perms.has(ctx.slugs.update);
        const hasDelete = perms.has(ctx.slugs.delete);

        const rehydrate = async () => {
          const freshPerms = await getMyPermissionsMock();
          const fHasUpdate = freshPerms.has(ctx.slugs.update);
          const fHasDelete = freshPerms.has(ctx.slugs.delete);

          const editItem = el.querySelector('.table-actions-edit-item');
          const deleteItem = el.querySelector('.table-actions-delete-item');
          const toggle = el.querySelector('.dropdown-toggle');

          if (editItem) {
            if (fHasUpdate) editItem.style.display = '';
            else editItem.remove();
          }
          if (deleteItem) {
            if (fHasDelete) deleteItem.style.display = '';
            else deleteItem.remove();
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

        permissionService.onInvalidate(rehydrate);

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

/**
 * Build the slice of DOM that usuarios.index.component.js's onInit() reads
 * with document.getElementById. The component is wired to a real Bootstrap
 * template; here we just create the IDs it touches.
 */
function mountUsuariosDom() {
  document.body.innerHTML = `
    <input id="filtro-buscar" />
    <select id="filtro-rol"><option value="">Todos</option></select>
    <select id="filtro-org"><option value="">Todas</option></select>
    <div id="estado-cargando"></div>
    <div id="estado-vacio" class="d-none"></div>
    <div id="estado-error" class="d-none"></div>
    <div id="contenedor-tabla" class="d-none">
      <small id="info-resultados"></small>
      <ul id="paginacion"></ul>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 48px" data-testid="col-foto">FOTO</th>
          <th style="width: 40px" class="text-center">
            <input type="checkbox" class="form-check-input check-select-all" />
          </th>
          <th>NOMBRE</th>
          <th>EMAIL</th>
          <th style="width: 170px">ROL</th>
          <th style="width: 200px">ORGANIZACI&#211;N</th>
          <th style="width: 130px">TEL&#201;FONO</th>
          <th style="width: 70px"></th>
        </tr>
      </thead>
      <tbody id="tabla-body"></tbody>
    </table>
    <div id="contenedor-cards"></div>
    <button id="btn-filtrar"></button>
    <button id="btn-limpiar"></button>
    <button id="btn-reintentar"></button>
    <div id="modal-eliminar"></div>
    <strong id="modal-eliminar-nombre"></strong>
    <button id="btn-confirmar-eliminar"></button>
    <span id="eliminar-texto"></span>
    <span id="eliminar-loading" class="d-none"></span>
    <div id="toast-msg" class="toast align-items-center text-white border-0">
      <div id="toast-msg-texto"></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// DOM fixture
// ---------------------------------------------------------------------------
const FIXTURE_HTML = `
  <input id="filtro-buscar" />
  <select id="filtro-rol"><option value="">Todos</option></select>
  <select id="filtro-org"><option value="">Todas</option></select>
  <div id="estado-cargando"></div>
  <div id="estado-vacio" class="d-none"></div>
  <div id="estado-error" class="d-none"></div>
  <div id="contenedor-tabla" class="d-none">
    <small id="info-resultados"></small>
    <ul id="paginacion"></ul>
  </div>
  <table><tbody id="tabla-body"></tbody></table>
  <div id="contenedor-cards"></div>
  <button id="btn-filtrar"></button>
  <button id="btn-limpiar"></button>
  <button id="btn-reintentar"></button>
  <div id="modal-eliminar">
    <strong id="modal-eliminar-nombre"></strong>
  </div>
  <button id="btn-confirmar-eliminar"></button>
  <span id="eliminar-texto"></span>
  <span id="eliminar-loading" class="d-none"></span>
  <div id="toast-msg" class="toast align-items-center text-white border-0">
    <div id="toast-msg-texto"></div>
  </div>
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
const MOCK_USUARIOS = [
  {
    id: '1',
    first_name: 'Juan',
    last_name: 'Pérez',
    email: 'juan@example.com',
    role: { name: 'admin_sistema' },
    organization: { name: 'Municipio' },
    phone: '0991234567',
  },
  {
    id: '2',
    first_name: 'María',
    last_name: 'García',
    email: 'maria@example.com',
    role: { name: 'operador_sistema' },
    organization: { name: 'ESSP' },
    phone: '0987654321',
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let componentModule;

beforeEach(async () => {
  clearAuthState();
  setAccessToken('test-token');

  if (routerNavigateSpy.mock) {
    routerNavigateSpy.mock.calls.length = 0;
    routerNavigateSpy.mock.results.length = 0;
  }

  tableActionsInstances.length = 0;
  shownModalEl = null;
  permissionService.invalidateMyPermissions();
  mockMatchMediaDesktop();

  const permsToReturn = new Set(['users.update', 'users.delete']);
  getMyPermissionsMock = vi.fn().mockImplementation(() => {
    return Promise.resolve(new Set(permsToReturn));
  });
  vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
    getMyPermissionsMock,
  );
  vi.spyOn(permissionService, 'onInvalidate').mockReturnValue(() => {});

  const { http } = await import('../../../../core/http.service.js');
  http.get.mockImplementation((path) => {
    if (path.startsWith('/users'))
      return Promise.resolve({ data: MOCK_USUARIOS, meta: { total: 2 } });
    if (path.startsWith('/roles')) return Promise.resolve({ data: [] });
    if (path.startsWith('/organizations')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  http.delete.mockResolvedValue({});

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

  if (!componentModule) {
    componentModule = await import('./usuarios.index.component.js');
  }

  document.body.innerHTML = FIXTURE_HTML;
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Helper: render with given permissions
// ---------------------------------------------------------------------------
async function renderIndexWithPermissions(perms) {
  getMyPermissionsMock = vi.fn().mockResolvedValue(perms);
  vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
    getMyPermissionsMock,
  );
  permissionService.invalidateMyPermissions();
  await componentModule.default.onInit();
}

// ---------------------------------------------------------------------------
// DESKTOP — permission-driven action rendering
// ---------------------------------------------------------------------------

describe('Desktop — permission-driven action rendering', () => {
  it('renders Ver + Editar + Eliminar when user has both permissions', async () => {
    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

    const rows = document.querySelectorAll('#tabla-body tr');
    expect(rows).toHaveLength(2);

    const tableActions = document.querySelectorAll('#tabla-body table-actions');
    expect(tableActions).toHaveLength(2);

    const toggles = document.querySelectorAll('#tabla-body .dropdown-toggle');
    expect(toggles).toHaveLength(2);
    toggles.forEach((t) => expect(t.hasAttribute('disabled')).toBe(false));

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
    await renderIndexWithPermissions(new Set(['users.update']));

    const tableActionsEls = document.querySelectorAll(
      '#tabla-body table-actions',
    );
    expect(tableActionsEls).toHaveLength(2);

    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    expect(editItems).toHaveLength(2);

    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(deleteItems).toHaveLength(0);
  });

  it('renders only Ver + Eliminar (no Editar) when user lacks update permission', async () => {
    await renderIndexWithPermissions(new Set(['users.delete']));

    const tableActionsEls = document.querySelectorAll(
      '#tabla-body table-actions',
    );
    expect(tableActionsEls).toHaveLength(2);

    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    expect(editItems).toHaveLength(0);

    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(deleteItems).toHaveLength(2);
  });

  it('renders kebab disabled with tooltip when user has no action permissions', async () => {
    await renderIndexWithPermissions(new Set(['users.view']));

    const tableActionsEls = document.querySelectorAll(
      '#tabla-body table-actions',
    );
    expect(tableActionsEls).toHaveLength(2);

    const toggles = document.querySelectorAll('#tabla-body .dropdown-toggle');
    expect(toggles).toHaveLength(2);
    toggles.forEach((t) => {
      expect(t.hasAttribute('disabled')).toBe(true);
      expect(t.getAttribute('title')).toBe('No tenés acciones disponibles');
    });

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
// Action handlers
// ---------------------------------------------------------------------------

describe('Action handlers — CustomEvent delegation', () => {
  it('clicking Editar navigates to /usuarios/crear?id={id}', async () => {
    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

    const firstRowActions = document.querySelector('#tabla-body table-actions');
    const toggle = firstRowActions.querySelector('.dropdown-toggle');
    toggle.click();

    const editItem = firstRowActions.querySelector('.table-actions-edit');
    editItem.click();

    expect(routerNavigateSpy).toHaveBeenCalledWith('/usuarios/crear?id=1');
  });

  it('clicking Eliminar opens the Bootstrap Delete Modal', async () => {
    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

    const firstRowActions = document.querySelector('#tabla-body table-actions');
    const toggle = firstRowActions.querySelector('.dropdown-toggle');
    toggle.click();

    const deleteItem = firstRowActions.querySelector('.table-actions-delete');
    deleteItem.click();

    expect(shownModalEl).not.toBeNull();
    expect(shownModalEl.id).toBe('modal-eliminar');
    expect(document.getElementById('modal-eliminar-nombre').textContent).toBe(
      'Juan Pérez',
    );
  });
});

// ---------------------------------------------------------------------------
// Mobile rendering
// ---------------------------------------------------------------------------

describe('Mobile — actions render in card body', () => {
  it('at <768px the table is hidden and actions render in card body', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

    expect(document.getElementById('tabla-body').innerHTML).toBe('');

    const cards = document.querySelectorAll('#contenedor-cards .card');
    expect(cards).toHaveLength(2);

    const tableActionsInCards = document.querySelectorAll(
      '#contenedor-cards table-actions',
    );
    expect(tableActionsInCards).toHaveLength(2);

    const toggles = document.querySelectorAll(
      '#contenedor-cards .dropdown-toggle',
    );
    expect(toggles).toHaveLength(2);
    toggles.forEach((t) => expect(t.hasAttribute('disabled')).toBe(false));
  });

  it('mobile Editar click navigates to /usuarios/crear?id={id}', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

    const firstCardActions = document.querySelector(
      '#contenedor-cards table-actions',
    );
    const toggle = firstCardActions.querySelector('.dropdown-toggle');
    toggle.click();
    const editItem = firstCardActions.querySelector('.table-actions-edit');
    editItem.click();

    expect(routerNavigateSpy).toHaveBeenCalledWith('/usuarios/crear?id=1');
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

    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

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
// Double-click removal — Ver button replaces row double-click
// ---------------------------------------------------------------------------

describe('Double-click removal — Ver button replaces row double-click', () => {
  it('double-clicking the row does NOT navigate (double-click handler removed)', async () => {
    await renderIndexWithPermissions(new Set(['users.update', 'users.delete']));

    const row = document.querySelector('#tabla-body tr');
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(routerNavigateSpy).not.toHaveBeenCalled();
  });
});

describe('usuarios.index.component — FOTO column (REQ-REDESIGN-9, 11)', () => {
  let componentModule;

  beforeEach(async () => {
    clearAuthState();
    setAccessToken('test-token');
    vi.clearAllMocks();
    http.get.mockImplementation((path) => {
      if (path.startsWith('/users/form-data'))
        return Promise.resolve({ roles: [], organizations: [] });
      if (path.startsWith('/users'))
        return Promise.resolve({ data: [], meta: { total: 0 } });
      return Promise.resolve({ data: [] });
    });
    mountUsuariosDom();
    if (!componentModule) {
      componentModule = await import('./usuarios.index.component.js');
    }
  });

  it('renders FOTO column header at index 0', async () => {
    http.get.mockImplementation((path) => {
      if (path.startsWith('/users/form-data'))
        return Promise.resolve({ roles: [], organizations: [] });
      if (path.startsWith('/users'))
        return Promise.resolve({ data: [], meta: { total: 0 } });
      return Promise.resolve({ data: [] });
    });
    await componentModule.default.onInit();
    const th = document.querySelector('th[data-testid="col-foto"]');
    expect(th).not.toBeNull();
    expect(th.textContent).toContain('FOTO');
  });

  it('renders avatar image when user has profile_image_path', async () => {
    const mockUser = {
      id: 1,
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      profile_image_path: 'users/1/avatar.webp',
      role: { name: 'admin_sistema' },
    };
    http.get.mockImplementation((path) => {
      if (path.startsWith('/users/form-data'))
        return Promise.resolve({ roles: [], organizations: [] });
      if (path.startsWith('/users'))
        return Promise.resolve({ data: [mockUser], meta: { total: 1 } });
      return Promise.resolve({ data: [] });
    });
    await componentModule.default.onInit();
    const firstRow = document.querySelector('#tabla-body tr');
    expect(firstRow).not.toBeNull();
    const img = firstRow.querySelector(
      'img[src="/storage/users/1/avatar.webp"]',
    );
    expect(img).not.toBeNull();
  });

  it('renders the default avatar image when user has no profile_image_path', async () => {
    const mockUser = {
      id: 2,
      first_name: 'Grace',
      last_name: 'Hopper',
      email: 'grace@example.com',
      profile_image_path: null,
      role: { name: 'operador_sistema' },
    };
    http.get.mockImplementation((path) => {
      if (path.startsWith('/users/form-data'))
        return Promise.resolve({ roles: [], organizations: [] });
      if (path.startsWith('/users'))
        return Promise.resolve({ data: [mockUser], meta: { total: 1 } });
      return Promise.resolve({ data: [] });
    });
    await componentModule.default.onInit();
    const firstRow = document.querySelector('#tabla-body tr');
    expect(firstRow).not.toBeNull();
    // No initials badge — the default avatar image is rendered instead
    const img = firstRow.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('/images/default-avatar.svg');
  });
});
