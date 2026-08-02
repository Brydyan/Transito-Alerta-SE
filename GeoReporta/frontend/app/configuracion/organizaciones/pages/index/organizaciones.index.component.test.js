/**
 * organizaciones.index.component — table-actions migration tests.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearAuthState,
  setAccessToken,
} from '../../../../core/http.service.js';

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

const routerNavigateSpy = vi.fn();
vi.mock('../../../../core/router.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, router: { ...mod.router, navigate: routerNavigateSpy } };
});

import { permissionService } from '../../../../shared/permission.service.js';

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
            fHasUpdate ? (editItem.style.display = '') : editItem.remove();
          }
          if (deleteItem) {
            fHasDelete ? (deleteItem.style.display = '') : deleteItem.remove();
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
        <a class="btn-ver" href="#" data-action="view" title="Ver detalle"><i class="fa-solid fa-eye"></i></a>
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown"
                  aria-expanded="false" aria-label="Acciones"
                  ${!hasUpdate && !hasDelete ? 'disabled title="No tenés acciones disponibles"' : ''}>
            <i class="fa-solid fa-ellipsis-v"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            ${hasUpdate ? `<li class="table-actions-edit-item"><a class="dropdown-item table-actions-edit" href="#" data-action="edit"><i class="fa-solid fa-edit"></i> Editar</a></li>` : ''}
            ${hasDelete ? `<li class="table-actions-delete-item"><a class="dropdown-item table-actions-delete text-danger" href="#" data-action="delete"><i class="fa-solid fa-trash-alt"></i> Eliminar</a></li>` : ''}
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

const FIXTURE_HTML = `
  <input id="filtro-buscar" />
  <div id="estado-cargando"></div>
  <div id="estado-vacio" class="d-none"></div>
  <div id="estado-error" class="d-none"></div>
  <div id="contenedor-tabla" class="d-none">
    <small id="info-resultados"></small>
    <ul id="paginacion"></ul>
  </div>
  <table><thead><tr><th></th><th></th><th></th><th></th><th></th></tr></thead><tbody id="tabla-body"></tbody></table>
  <div id="contenedor-cards"></div>
  <button id="btn-filtrar"></button>
  <button id="btn-limpiar"></button>
  <button id="btn-reintentar"></button>
  <div id="modal-eliminar"><strong id="modal-eliminar-nombre"></strong></div>
  <button id="btn-confirmar-eliminar"></button>
  <span id="eliminar-texto"></span>
  <span id="eliminar-loading" class="d-none"></span>
  <div id="toast-msg" class="toast align-items-center text-white border-0"><div id="toast-msg-texto"></div></div>
`;

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

const MOCK_ORGANIZACIONES = [
  {
    id: '1',
    name: 'Municipio de Quito',
    location: { name: 'Quito' },
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    name: 'ESSP',
    location: { name: 'Guayaquil' },
    created_at: '2024-01-16T14:30:00Z',
  },
];

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

  const permsToReturn = new Set([
    'organizations.update',
    'organizations.delete',
  ]);
  getMyPermissionsMock = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Set(permsToReturn)));
  vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
    getMyPermissionsMock,
  );
  vi.spyOn(permissionService, 'onInvalidate').mockReturnValue(() => {});

  const { http } = await import('../../../../core/http.service.js');
  http.get.mockImplementation((path) => {
    if (path.startsWith('/organizations'))
      return Promise.resolve({ data: MOCK_ORGANIZACIONES, meta: { total: 2 } });
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
    componentModule = await import('./organizaciones.index.component.js');
  }

  document.body.innerHTML = FIXTURE_HTML;
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function renderIndexWithPermissions(perms) {
  getMyPermissionsMock = vi.fn().mockResolvedValue(perms);
  vi.spyOn(permissionService, 'getMyPermissions').mockImplementation(
    getMyPermissionsMock,
  );
  permissionService.invalidateMyPermissions();
  await componentModule.default.onInit();
}

describe('Desktop — permission-driven action rendering', () => {
  it('renders Ver + Editar + Eliminar when user has both permissions', async () => {
    await renderIndexWithPermissions(
      new Set(['organizations.update', 'organizations.delete']),
    );

    const rows = document.querySelectorAll('#tabla-body tr');
    expect(rows).toHaveLength(2);

    const tableActions = document.querySelectorAll('#tabla-body table-actions');
    expect(tableActions).toHaveLength(2);

    const toggles = document.querySelectorAll('#tabla-body .dropdown-toggle');
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

  it('renders only Ver + Editar when user lacks delete permission', async () => {
    await renderIndexWithPermissions(new Set(['organizations.update']));

    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(editItems).toHaveLength(2);
    expect(deleteItems).toHaveLength(0);
  });

  it('renders only Ver + Eliminar when user lacks update permission', async () => {
    await renderIndexWithPermissions(new Set(['organizations.delete']));

    const editItems = document.querySelectorAll(
      '#tabla-body .table-actions-edit-item',
    );
    const deleteItems = document.querySelectorAll(
      '#tabla-body .table-actions-delete-item',
    );
    expect(editItems).toHaveLength(0);
    expect(deleteItems).toHaveLength(2);
  });

  it('renders kebab disabled when user has no action permissions', async () => {
    await renderIndexWithPermissions(new Set(['organizations.view']));

    const toggles = document.querySelectorAll('#tabla-body .dropdown-toggle');
    toggles.forEach((t) => {
      expect(t.hasAttribute('disabled')).toBe(true);
      expect(t.getAttribute('title')).toBe('No tenés acciones disponibles');
    });
  });
});

describe('Action handlers — CustomEvent delegation', () => {
  it('clicking Editar navigates to /organizaciones/crear?id={id}', async () => {
    await renderIndexWithPermissions(
      new Set(['organizations.update', 'organizations.delete']),
    );

    const firstRowActions = document.querySelector('#tabla-body table-actions');
    firstRowActions.querySelector('.dropdown-toggle').click();
    firstRowActions.querySelector('.table-actions-edit').click();

    expect(routerNavigateSpy).toHaveBeenCalledWith(
      '/organizaciones/crear?id=1',
    );
  });

  it('clicking Eliminar opens the Bootstrap Delete Modal', async () => {
    await renderIndexWithPermissions(
      new Set(['organizations.update', 'organizations.delete']),
    );

    const firstRowActions = document.querySelector('#tabla-body table-actions');
    firstRowActions.querySelector('.dropdown-toggle').click();
    firstRowActions.querySelector('.table-actions-delete').click();

    expect(shownModalEl).not.toBeNull();
    expect(shownModalEl.id).toBe('modal-eliminar');
    expect(document.getElementById('modal-eliminar-nombre').textContent).toBe(
      'Municipio de Quito',
    );
  });
});

describe('Mobile — actions render in card body', () => {
  it('at <768px actions render in card body', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    await renderIndexWithPermissions(
      new Set(['organizations.update', 'organizations.delete']),
    );

    expect(document.getElementById('tabla-body').innerHTML).toBe('');

    const cards = document.querySelectorAll('#contenedor-cards .card');
    expect(cards).toHaveLength(2);

    const tableActionsInCards = document.querySelectorAll(
      '#contenedor-cards table-actions',
    );
    expect(tableActionsInCards).toHaveLength(2);
  });
});
