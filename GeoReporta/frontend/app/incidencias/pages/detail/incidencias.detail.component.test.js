/**
 * incidencias.detail component unit tests — public comments wiring
 * (Phase 3 — 33bd3210).
 *
 * The operator detail view gained a comment list + posting form backed by
 * commentService (GET/POST /incidents/{id}/comments). These tests pin:
 *   - the initial GET renders the returned comments into the list
 *   - submitting the form calls commentService.create with the right
 *     payload, then reloads the list so the newly posted comment appears
 *   - an empty comment shows a validation error instead of posting
 *   - an empty comment list renders the "no comments yet" placeholder
 *
 * Convention: mock http.service.js / router.js / auth.service.js directly
 * (perfil.test.js pattern) rather than the higher-level commentService, so
 * the request/response contract (endpoint, method, payload, response
 * envelope) is exercised end-to-end through the real commentService.
 *
 * DOM fixture: only the ids the component touches unconditionally
 * (detalle-loading, detalle-content, detalle-coords, detalle-comment-form,
 * detalle-comment-input, detalle-comments-list) plus the optional comment
 * ids used for a more complete assertion surface. Status-history and
 * status-change wiring are deliberately left out of the fixture — both are
 * individually guarded (`if (!select || !btnGuardar) return;` /
 * `if (!loadingEl || !listEl) return;`) so omitting their ids makes them
 * no-op instead of requiring an unrelated fixture for this test's scope.
 */

const mockHttp = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue(null),
  request: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('../../../core/http.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    setAccessToken: mod.setAccessToken,
    clearAuthState: mod.clearAuthState,
    http: mockHttp,
  };
});

const mockRouter = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../../../core/router.js', () => ({ router: mockRouter }));

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn(() => null),
  me: vi.fn(),
}));
vi.mock('../../../auth/auth.service.js', () => ({ auth: mockAuth }));

const mockPermissionService = vi.hoisted(() => ({
  getMyPermissions: vi.fn(),
}));
vi.mock('../../../shared/permission.service.js', () => ({
  permissionService: mockPermissionService,
}));

const mockNotificationService = vi.hoisted(() => ({
  getPendingApprovals: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));
vi.mock('../../../shared/notification.service.js', () => ({
  notificationService: mockNotificationService,
}));

const mockUi = vi.hoisted(() => ({ mostrarToast: vi.fn() }));
vi.mock('../../../utils/ui.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, mostrarToast: mockUi.mostrarToast };
});

// Stub the justificacion-rechazo-modal module so the dynamic import
// in setupAuditar returns a predictable class. The real module calls
// customElements.define() on import, which conflicts when the same
// custom element is registered more than once across the suite.
class StubRechazoModal extends HTMLElement {
  connectedCallback() {}
  show(cb) {
    StubRechazoModal._lastCallback = cb;
  }
}
StubRechazoModal._lastCallback = null;
if (!customElements.get('justificacion-rechazo-modal')) {
  customElements.define('justificacion-rechazo-modal', StubRechazoModal);
}
vi.mock(
  '../../../shared/components/justificacion-rechazo-modal/justificacion-rechazo-modal.component.js',
  () => ({ default: StubRechazoModal }),
);

function buildDetailDom() {
  document.body.innerHTML = `
    <h1 id="detalle-titulo"></h1>
    <span id="detalle-breadcrumb"></span>
    <div id="detalle-loading"></div>
    <div id="detalle-content" class="d-none"></div>
    <div id="detalle-coords"></div>
    <span id="detalle-status"></span>
    <span id="detalle-priority"></span>
    <small id="detalle-fecha"></small>
    <p id="detalle-descripcion"></p>
    <span id="detalle-categoria"></span>
    <span id="detalle-ubicacion"></span>
    <span id="detalle-usuario"></span>
    <span id="detalle-organizacion"></span>
    <div id="detalle-thumbnail" class="d-none"></div>

    <input type="file" id="detalle-file-input" />
    <button id="btn-subir-imagen" disabled></button>
    <div id="detalle-upload-progress" class="d-none"></div>
    <div id="detalle-imagenes">
      <p id="detalle-sin-imagenes" class="text-muted small mb-0">Sin imágenes</p>
    </div>

    <form id="detalle-comment-form">
      <textarea id="detalle-comment-input"></textarea>
      <input type="file" id="detalle-comment-images" />
      <button type="button" id="detalle-comment-attach-btn"></button>
      <div id="detalle-comment-error" class="d-none"></div>
      <button type="submit" id="detalle-comment-submit">Publicar</button>
    </form>
    <div id="detalle-comments-loading"></div>
    <ul id="detalle-comments-list"></ul>
    <p id="detalle-comments-vacio" class="d-none">Sin comentarios todavía.</p>

    <div id="detalle-auditar" class="d-none">
      <p id="detalle-auditar-msg"></p>
      <div id="detalle-auditar-loading" class="d-none"></div>
      <div id="detalle-auditar-sin-notif" class="d-none"></div>
      <div id="detalle-auditar-actions" class="d-none">
        <button id="btn-auditar-aprobar">Aprobar</button>
        <button id="btn-auditar-rechazar">Rechazar</button>
      </div>
      <div id="detalle-auditar-submitting" class="d-none"></div>
      <div id="detalle-auditar-error" class="d-none">
        <div id="detalle-auditar-error-msg"></div>
      </div>
    </div>

    <div id="detalle-rejection-banner" class="d-none">
      <div id="detalle-rejection-reason"></div>
      <span id="detalle-rejection-by">—</span>
      <span id="detalle-rejection-at">—</span>
    </div>

    <div id="toast-msg"><div id="toast-msg-texto"></div></div>

    <div id="detalle-asignaciones-card">
      <div id="detalle-asignaciones-loading"></div>
      <div id="detalle-asignaciones-list"></div>
      <p id="detalle-asignaciones-vacio" class="d-none">Sin operadores asignados.</p>
      <div id="detalle-asignaciones-error" class="d-none">
        <div id="detalle-asignaciones-msg"></div>
      </div>
      <form id="detalle-asignaciones-form" class="d-none">
        <select id="detalle-asignaciones-select"></select>
        <input type="radio" name="asignacion-rol" id="detalle-asignaciones-rol-responsable" value="responsable" checked />
        <input type="radio" name="asignacion-rol" id="detalle-asignaciones-rol-apoyo" value="apoyo" />
        <button type="submit" id="detalle-asignaciones-submit">Asignar</button>
      </form>
    </div>
  `;
}

const incidentFixture = {
  id: 42,
  title: 'Bache en la vía',
  description: 'Bache profundo',
  status: 'pending',
  priority: 'medium',
  created_at: '2026-07-01T10:00:00Z',
  category: { name: 'Infraestructura' },
  location: { name: 'Centro' },
  user: { first_name: 'Juan', last_name: 'Perez' },
  organization: null,
  images: [],
  // No geom — renderMap short-circuits to "Sin coordenadas" without
  // needing a mocked initMapView/Leaflet.
};

function commentFixture(overrides = {}) {
  return {
    id: 1,
    message: 'Primer comentario',
    user: { first_name: 'Ana', last_name: 'Lopez' },
    created_at: '2026-07-02T09:00:00Z',
    ...overrides,
  };
}

describe('incidencias.detail — public comments', () => {
  let component;

  beforeAll(async () => {
    const mod = await import('./incidencias.detail.component.js');
    component = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.getUser.mockReturnValue(null);
    // Default: no assignments permissions — most tests in this file don't
    // exercise the assignments card, so it should render read-only/empty
    // without extra setup. The assignments-specific describe block below
    // overrides this per-test.
    mockPermissionService.getMyPermissions.mockResolvedValue(new Set());
    buildDetailDom();
  });

  afterEach(() => {
    component.onDestroy?.();
  });

  it('renders the comments returned by the initial GET', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/comments')) {
        return Promise.resolve({ data: [commentFixture()] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-comments-list').children.length > 0,
    );

    const list = document.getElementById('detalle-comments-list');
    expect(list.children).toHaveLength(1);
    expect(list.textContent).toContain('Primer comentario');
    expect(list.textContent).toContain('Ana Lopez');
    expect(
      document
        .getElementById('detalle-comments-vacio')
        .classList.contains('d-none'),
    ).toBe(true);
  });

  it('shows the empty-state message when there are no comments yet', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/comments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        !document
          .getElementById('detalle-comments-vacio')
          .classList.contains('d-none'),
    );

    expect(
      document
        .getElementById('detalle-comments-vacio')
        .classList.contains('d-none'),
    ).toBe(false);
    expect(
      document.getElementById('detalle-comments-list').children,
    ).toHaveLength(0);
  });

  it('posts a new comment via POST /incidents/{id}/comments and appends it after reload', async () => {
    let commentsCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/comments')) {
        commentsCallCount += 1;
        if (commentsCallCount === 1) {
          return Promise.resolve({ data: [commentFixture()] });
        }
        return Promise.resolve({
          data: [
            commentFixture(),
            commentFixture({
              id: 2,
              message: 'Segundo comentario',
              user: { first_name: 'Luis' },
            }),
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockHttp.post.mockResolvedValue({
      data: commentFixture({ id: 2, message: 'Segundo comentario' }),
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-comments-list').children.length > 0,
    );

    document.getElementById('detalle-comment-input').value =
      'Segundo comentario';
    document
      .getElementById('detalle-comment-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitUntil(() => mockHttp.post.mock.calls.length > 0);

    expect(mockHttp.post).toHaveBeenCalledWith('/incidents/42/comments', {
      message: 'Segundo comentario',
    });

    await vi.waitUntil(
      () =>
        document.getElementById('detalle-comments-list').children.length === 2,
    );
    expect(
      document.getElementById('detalle-comments-list').textContent,
    ).toContain('Segundo comentario');
    // Input is cleared after a successful post.
    expect(document.getElementById('detalle-comment-input').value).toBe('');
  });

  it('shows a validation error and does not call the API when the comment is empty', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/comments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    // The submit handler is only wired up AFTER the initial
    // `await cargarComentarios()` resolves — waiting on the http.get call
    // count alone races that promise chain. #detalle-comments-loading
    // flips to hidden only once the initial load (and listener wiring)
    // has fully completed, which is a reliable synchronization point.
    await vi.waitUntil(() =>
      document
        .getElementById('detalle-comments-loading')
        .classList.contains('d-none'),
    );

    document.getElementById('detalle-comment-input').value = '   ';
    document
      .getElementById('detalle-comment-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    // Give any (incorrect) async post a tick to fire before asserting it didn't.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockHttp.post).not.toHaveBeenCalled();
    const errorEl = document.getElementById('detalle-comment-error');
    expect(errorEl.classList.contains('d-none')).toBe(false);
    expect(errorEl.textContent).toBe('El comentario no puede estar vacío.');
  });

  it('triggers the file input when clicking the camera photo attach button', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/comments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });

    const attachBtn = document.getElementById('detalle-comment-attach-btn');
    const fileInput = document.getElementById('detalle-comment-images');
    expect(attachBtn).not.toBeNull();

    const clickSpy = vi.spyOn(fileInput, 'click');
    attachBtn.click();

    expect(clickSpy).toHaveBeenCalled();
  });
});

/**
 * incidencias.detail — assignments wiring (Phase 3 —
 * historial-asignacion-operadores).
 *
 * The operator detail view gained an "Asignaciones" card backed by
 * assignmentService (GET/POST/DELETE /incidents/{id}/assignments) plus an
 * operator-picker sourced from /roles + /users. permissionService is
 * mocked entirely (mirrors permission.guard.test.js) so each test can pin
 * an exact permission set instead of exercising the real caching service.
 */
function assignmentFixture(overrides = {}) {
  return {
    id: 1,
    incident_id: 42,
    user_id: 7,
    role: 'responsable',
    user: { first_name: 'Carla', last_name: 'Ruiz' },
    ...overrides,
  };
}

const incidentWithOrgFixture = {
  ...incidentFixture,
  organization: { id: 9, name: 'Org X' },
};

describe('incidencias.detail — assignments', () => {
  let component;

  beforeAll(async () => {
    const mod = await import('./incidencias.detail.component.js');
    component = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.getUser.mockReturnValue(null);
    buildDetailDom();
  });

  afterEach(() => {
    component.onDestroy?.();
  });

  it('renders the assignment list returned by the initial GET', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(new Set());
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [assignmentFixture()] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() =>
      document
        .getElementById('detalle-asignaciones-loading')
        .classList.contains('d-none'),
    );

    const listEl = document.getElementById('detalle-asignaciones-list');
    expect(listEl.textContent).toContain('Carla Ruiz');
    expect(listEl.textContent).toContain('Responsable');
    expect(
      document
        .getElementById('detalle-asignaciones-vacio')
        .classList.contains('d-none'),
    ).toBe(true);
  });

  it('hides the assignment form when assignments.create is absent', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view']),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() =>
      document
        .getElementById('detalle-asignaciones-loading')
        .classList.contains('d-none'),
    );

    expect(
      document
        .getElementById('detalle-asignaciones-form')
        .classList.contains('d-none'),
    ).toBe(true);
    // No role-lookup calls should fire when the form stays hidden.
    expect(mockHttp.get).not.toHaveBeenCalledWith(
      expect.stringContaining('/roles'),
    );
  });

  it('shows the form, creates an assignment, and refreshes the list on submit', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.create']),
    );
    let assignmentsCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentWithOrgFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        assignmentsCallCount += 1;
        if (assignmentsCallCount === 1) {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: [assignmentFixture()] });
      }
      if (path.startsWith('/incidents/42/available-operators')) {
        return Promise.resolve({
          data: [{ id: 7, first_name: 'Carla', last_name: 'Ruiz' }],
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockHttp.post.mockResolvedValue({ data: assignmentFixture() });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-asignaciones-select').children.length >
        0,
    );

    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/incidents/42/available-operators'),
    );

    document.getElementById('detalle-asignaciones-select').value = '7';
    document
      .getElementById('detalle-asignaciones-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitUntil(() => mockHttp.post.mock.calls.length > 0);

    expect(mockHttp.post).toHaveBeenCalledWith('/incidents/42/assignments', {
      user_id: 7,
      role: 'responsable',
    });

    await vi.waitUntil(
      () =>
        document.getElementById('detalle-asignaciones-list').textContent
          .length > 0,
    );
    expect(
      document.getElementById('detalle-asignaciones-list').textContent,
    ).toContain('Carla Ruiz');
  });

  it('shows a 422 error inline when a second responsable is attempted', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.create']),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentWithOrgFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [assignmentFixture()] });
      }
      if (path.startsWith('/incidents/42/available-operators')) {
        return Promise.resolve({
          data: [{ id: 8, first_name: 'Luis', last_name: 'Mora' }],
        });
      }
      return Promise.resolve({ data: [] });
    });
    const conflictErr = new Error(
      'Esta incidencia ya tiene un responsable asignado.',
    );
    conflictErr.status = 422;
    mockHttp.post.mockRejectedValue(conflictErr);

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-asignaciones-select').children.length >
        0,
    );

    document.getElementById('detalle-asignaciones-select').value = '8';
    document
      .getElementById('detalle-asignaciones-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitUntil(() => mockHttp.post.mock.calls.length > 0);
    await vi.waitUntil(
      () =>
        !document
          .getElementById('detalle-asignaciones-error')
          .classList.contains('d-none'),
    );

    expect(
      document.getElementById('detalle-asignaciones-msg').textContent,
    ).toBe('Esta incidencia ya tiene un responsable asignado.');
  });

  it('shows a delete button when assignments.delete is present, and clicking it removes the assignment then refreshes the list', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.delete']),
    );
    let assignmentsCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        assignmentsCallCount += 1;
        if (assignmentsCallCount === 1) {
          return Promise.resolve({ data: [assignmentFixture()] });
        }
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
    mockHttp.delete.mockResolvedValue(null);

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() =>
      document.querySelector('.btn-eliminar-asignacion'),
    );

    const btn = document.querySelector('.btn-eliminar-asignacion');
    expect(btn.dataset.id).toBe('1');
    btn.dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitUntil(() => mockHttp.delete.mock.calls.length > 0);
    expect(mockHttp.delete).toHaveBeenCalledWith('/incidents/42/assignments/1');

    await vi.waitUntil(
      () =>
        !document
          .getElementById('detalle-asignaciones-vacio')
          .classList.contains('d-none'),
    );
    expect(document.querySelector('.btn-eliminar-asignacion')).toBeNull();
  });

  it('shows a visible error (not hidden by the create-form ancestor) when removing an assignment fails for a delete-only user', async () => {
    // Deliberately no assignments.create — reproduces the R4-001 bug
    // scenario: create-form stays hidden, but the delete error banner
    // (which used to live inside that form) must still be visible.
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.delete']),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [assignmentFixture()] });
      }
      return Promise.resolve({ data: [] });
    });
    mockHttp.delete.mockRejectedValue(
      new Error('No se pudo eliminar la asignación.'),
    );

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() =>
      document.querySelector('.btn-eliminar-asignacion'),
    );

    document
      .querySelector('.btn-eliminar-asignacion')
      .dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitUntil(() => mockHttp.delete.mock.calls.length > 0);
    await vi.waitUntil(
      () =>
        !document
          .getElementById('detalle-asignaciones-error')
          .classList.contains('d-none'),
    );

    const errorEl = document.getElementById('detalle-asignaciones-error');
    const formEl = document.getElementById('detalle-asignaciones-form');
    expect(
      document.getElementById('detalle-asignaciones-msg').textContent,
    ).toBe('No se pudo eliminar la asignación.');
    // The create-form stays hidden (no assignments.create)...
    expect(formEl.classList.contains('d-none')).toBe(true);
    // ...but the error banner is NOT a descendant of it, so it's visible
    // regardless. This is the actual regression check for R4-001.
    expect(formEl.contains(errorEl)).toBe(false);
    expect(errorEl.classList.contains('d-none')).toBe(false);
    // The delete button re-enables so the user can retry.
    expect(document.querySelector('.btn-eliminar-asignacion').disabled).toBe(
      false,
    );
  });

  it('disables the operator select and submit button, and shows an error option, when the /roles fetch fails', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.create']),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentWithOrgFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [] });
      }
      if (path.startsWith('/incidents/42/available-operators')) {
        return Promise.reject(new Error('roles fetch failed'));
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-asignaciones-select').textContent
          .length > 0,
    );

    const selectEl = document.getElementById('detalle-asignaciones-select');
    expect(selectEl.disabled).toBe(true);
    expect(selectEl.textContent).toContain('Error al cargar operadores');
    expect(
      document.getElementById('detalle-asignaciones-submit').disabled,
    ).toBe(true);
  });

  it('shows "sin organización" and disables the picker + submit when the incident has no organization', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.create']),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        // incidentFixture.organization is null.
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-asignaciones-select').textContent
          .length > 0,
    );

    const selectEl = document.getElementById('detalle-asignaciones-select');
    expect(selectEl.disabled).toBe(true);
    expect(selectEl.textContent).toContain('Sin organización asignada');
    expect(
      document.getElementById('detalle-asignaciones-submit').disabled,
    ).toBe(true);
    expect(mockHttp.get).not.toHaveBeenCalledWith(
      expect.stringContaining('/roles'),
    );
  });

  it('shows "sin operadores disponibles" and disables the picker + submit when /users returns zero operators', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(
      new Set(['assignments.view', 'assignments.create']),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentWithOrgFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.resolve({ data: [] });
      }
      if (path === '/roles?per_page=100') {
        return Promise.resolve({
          data: [{ id: 4, name: 'operador_organizacion' }],
        });
      }
      if (path.startsWith('/users?')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(
      () =>
        document.getElementById('detalle-asignaciones-select').textContent
          .length > 0,
    );

    const selectEl = document.getElementById('detalle-asignaciones-select');
    expect(selectEl.disabled).toBe(true);
    expect(selectEl.textContent).toContain('Sin operadores disponibles');
    expect(
      document.getElementById('detalle-asignaciones-submit').disabled,
    ).toBe(true);
  });

  it('shows an error message and clears the list when the assignments GET fails', async () => {
    mockPermissionService.getMyPermissions.mockResolvedValue(new Set());
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/42/assignments')) {
        return Promise.reject(new Error('list failed'));
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() =>
      document
        .getElementById('detalle-asignaciones-loading')
        .classList.contains('d-none'),
    );

    const vacioEl = document.getElementById('detalle-asignaciones-vacio');
    expect(vacioEl.classList.contains('d-none')).toBe(false);
    expect(vacioEl.textContent).toBe('Error al cargar asignaciones.');
    expect(document.getElementById('detalle-asignaciones-list').innerHTML).toBe(
      '',
    );
  });
});

/**
 * incidencias.detail — inline "Aprobar / Rechazar" card (sc-123 / #150).
 *
 * Replaces the kebab "Auditar" entry from the index page. Visibility:
 *   - incident.status === 'resolved' AND user is admin
 * Behavior:
 *   - fetches pending-approval notifications for the incident
 *   - shows the action buttons when one matches
 *   - shows the empty-state when the operator hasn't marked the
 *     incident as resolved yet (or the notification was already
 *     processed)
 *   - Aprobar calls notificationService.approve and reloads
 *   - Rechazar opens justificacion-rechazo-modal and, on confirm,
 *     calls notificationService.reject with the trimmed reason
 */
function resolvedIncidentFixture(overrides = {}) {
  return { ...incidentFixture, status: 'resolved', ...overrides };
}

describe('incidencias.detail — Aprobar / Rechazar card', () => {
  let component;

  beforeAll(async () => {
    const mod = await import('./incidencias.detail.component.js');
    component = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.getUser.mockReturnValue(null);
    // Default: anonymous user → the IIFE inside setupAuditar returns
    // early and the card stays hidden. Per-test override sets the
    // admin role to flip the gate.
    mockAuth.me.mockResolvedValue(null);
    mockPermissionService.getMyPermissions.mockResolvedValue(new Set());
    // Default: no pending notifications, so the "sin notif" branch
    // is what the not-admin-by-default tests observe.
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
    mockNotificationService.approve.mockResolvedValue(null);
    mockNotificationService.reject.mockResolvedValue(null);
    StubRechazoModal._lastCallback = null;
    buildDetailDom();
  });

  afterEach(() => {
    component.onDestroy?.();
  });

  it('keeps #detalle-auditar hidden when status is not "resolved"', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: incidentFixture }); // status: 'pending'
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    // Give the IIFE a tick to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(
      document.getElementById('detalle-auditar').classList.contains('d-none'),
    ).toBe(true);
    expect(mockNotificationService.getPendingApprovals).not.toHaveBeenCalled();
  });

  it('keeps #detalle-auditar hidden when status is "resolved" but the user is not admin', async () => {
    mockAuth.me.mockResolvedValue({ role: 'operador_organizacion' });
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await new Promise((r) => setTimeout(r, 0));

    expect(
      document.getElementById('detalle-auditar').classList.contains('d-none'),
    ).toBe(true);
    expect(mockNotificationService.getPendingApprovals).not.toHaveBeenCalled();
  });

  it('unhides #detalle-auditar and shows the action buttons when admin + pending notification exists', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar');
      return el && !el.classList.contains('d-none');
    });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    expect(mockNotificationService.getPendingApprovals).toHaveBeenCalledWith(
      expect.objectContaining({ unreadOnly: false }),
    );
    expect(
      document
        .getElementById('detalle-auditar-loading')
        .classList.contains('d-none'),
    ).toBe(true);
    expect(
      document
        .getElementById('detalle-auditar-sin-notif')
        .classList.contains('d-none'),
    ).toBe(true);
    expect(
      document
        .getElementById('detalle-auditar-actions')
        .classList.contains('d-none'),
    ).toBe(false);
  });

  it('shows the "sin notif" branch when admin but the backend has no matching pending notification', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_organizacion' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        { id: 100, data: { incident_id: 99 } }, // different incident
      ],
      meta: { total: 1 },
    });
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-sin-notif');
      return el && !el.classList.contains('d-none');
    });

    expect(
      document
        .getElementById('detalle-auditar-actions')
        .classList.contains('d-none'),
    ).toBe(true);
  });

  it('shows an inline error when getPendingApprovals rejects', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockRejectedValue(
      new Error('boom'),
    );
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-error');
      return el && !el.classList.contains('d-none');
    });

    expect(
      document.getElementById('detalle-auditar-error-msg').textContent,
    ).toContain('No se pudo cargar la notificación pendiente.');
  });

  it('clicking Aprobar calls notificationService.approve and updates the page reactively (no full reload)', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockNotificationService.approve.mockResolvedValue({ id: 303 });
    let getCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        getCallCount += 1;
        if (getCallCount === 1) {
          return Promise.resolve({ data: resolvedIncidentFixture() });
        }
        // The refresh GET — backend now reports the incident as 'closed'
        // (auto-generated status_history row lives in DB via the trigger).
        return Promise.resolve({
          data: {
            ...resolvedIncidentFixture(),
            status: 'closed',
            status_history: [
              {
                id: 9,
                user_id: 1,
                previous_status: 'resolved',
                new_status: 'closed',
                notes: null,
                created_at: '2026-07-31T10:00:00Z',
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    document.getElementById('btn-auditar-aprobar').click();

    await vi.waitUntil(
      () => mockNotificationService.approve.mock.calls.length > 0,
    );
    expect(mockNotificationService.approve).toHaveBeenCalledWith(303);
    // The refresh path: confirm a second GET /incidents/42 fired.
    await vi.waitUntil(() => getCallCount >= 2);
    expect(mockHttp.get).toHaveBeenCalledWith('/incidents/42');
    // Status badge reflects the new status (closed → "Cerrada").
    expect(document.getElementById('detalle-status').textContent).toBe(
      'Cerrada',
    );
    // Audit card is hidden now that the incident is no longer 'resolved'.
    expect(
      document.getElementById('detalle-auditar').classList.contains('d-none'),
    ).toBe(true);
    // No full reload was triggered.
    expect(reloadSpy).not.toHaveBeenCalled();
    // Rejection banner stays hidden on approve.
    expect(
      document
        .getElementById('detalle-rejection-banner')
        .classList.contains('d-none'),
    ).toBe(true);
  });

  it('clicking Rechazar opens the justificacion-rechazo-modal, submits reject, and refreshes reactively (no full reload)', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockNotificationService.reject.mockResolvedValue({ id: 303 });
    let getCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        getCallCount += 1;
        if (getCallCount === 1) {
          return Promise.resolve({ data: resolvedIncidentFixture() });
        }
        // Post-reject: status reverts to in_progress and the rejection
        // metadata is exposed (resource may not expose every field yet —
        // the banner handles missing fields gracefully).
        return Promise.resolve({
          data: {
            ...resolvedIncidentFixture(),
            status: 'in_progress',
            rejection_reason:
              'La descripción no es clara respecto a la ubicación exacta.',
            rejected_by_user: { name: 'Admin Test' },
            rejected_at: '2026-07-31T10:30:00Z',
            status_history: [
              {
                id: 9,
                user_id: 1,
                previous_status: 'resolved',
                new_status: 'in_progress',
                notes:
                  'La descripción no es clara respecto a la ubicación exacta.',
                created_at: '2026-07-31T10:30:00Z',
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    document.getElementById('btn-auditar-rechazar').click();

    await vi.waitUntil(
      () => typeof StubRechazoModal._lastCallback === 'function',
    );
    // Simulate the modal handing the reason back.
    await StubRechazoModal._lastCallback(
      'La descripción no es clara respecto a la ubicación exacta.',
    );

    await vi.waitUntil(
      () => mockNotificationService.reject.mock.calls.length > 0,
    );
    expect(mockNotificationService.reject).toHaveBeenCalledWith(
      303,
      'La descripción no es clara respecto a la ubicación exacta.',
    );
    await vi.waitUntil(() => getCallCount >= 2);
    expect(mockHttp.get).toHaveBeenCalledWith('/incidents/42');
    // Status badge reflects the new status (in_progress → "En proceso").
    expect(document.getElementById('detalle-status').textContent).toBe(
      'En proceso',
    );
    // Audit card is hidden now that the incident is no longer 'resolved'.
    expect(
      document.getElementById('detalle-auditar').classList.contains('d-none'),
    ).toBe(true);
    // Rejection banner is visible with the reason and the actor metadata.
    const banner = document.getElementById('detalle-rejection-banner');
    expect(banner.classList.contains('d-none')).toBe(false);
    expect(
      document.getElementById('detalle-rejection-reason').textContent,
    ).toBe('La descripción no es clara respecto a la ubicación exacta.');
    expect(document.getElementById('detalle-rejection-by').textContent).toBe(
      'Admin Test',
    );
    expect(
      document.getElementById('detalle-rejection-at').textContent,
    ).not.toBe('—');
    // No full reload was triggered.
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('shows an inline error and re-enables actions when approve fails', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockNotificationService.approve.mockRejectedValue(new Error('forbidden'));
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    document.getElementById('btn-auditar-aprobar').click();

    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-error');
      return el && !el.classList.contains('d-none');
    });
    expect(
      document.getElementById('detalle-auditar-error-msg').textContent,
    ).toBe('forbidden');
    expect(
      document
        .getElementById('detalle-auditar-actions')
        .classList.contains('d-none'),
    ).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('hides the welcome msg when no notification is found', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 100,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 99 },
        },
      ],
      meta: { total: 1 },
    });
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-sin-notif');
      return el && !el.classList.contains('d-none');
    });

    expect(
      document
        .getElementById('detalle-auditar-msg')
        .classList.contains('d-none'),
    ).toBe(true);
    expect(
      document
        .getElementById('detalle-auditar-sin-notif')
        .classList.contains('d-none'),
    ).toBe(false);
  });

  it('shows the welcome msg only when actions are revealed', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        return Promise.resolve({ data: resolvedIncidentFixture() });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    expect(
      document
        .getElementById('detalle-auditar-msg')
        .classList.contains('d-none'),
    ).toBe(false);
    expect(
      document
        .getElementById('detalle-auditar-actions')
        .classList.contains('d-none'),
    ).toBe(false);
  });

  it('shows rejection reason banner after rejecting', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockNotificationService.reject.mockResolvedValue({ id: 303 });
    let getCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        getCallCount += 1;
        if (getCallCount === 1) {
          return Promise.resolve({ data: resolvedIncidentFixture() });
        }
        return Promise.resolve({
          data: {
            ...resolvedIncidentFixture(),
            status: 'in_progress',
            rejection_reason: 'Faltan imágenes',
            rejected_by_user: { name: 'Admin Test' },
            rejected_at: '2026-07-31T10:30:00Z',
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    // Banner starts hidden on initial load.
    expect(
      document
        .getElementById('detalle-rejection-banner')
        .classList.contains('d-none'),
    ).toBe(true);

    document.getElementById('btn-auditar-rechazar').click();
    await vi.waitUntil(
      () => typeof StubRechazoModal._lastCallback === 'function',
    );
    await StubRechazoModal._lastCallback('Faltan imágenes');

    await vi.waitUntil(() => getCallCount >= 2);
    const banner = document.getElementById('detalle-rejection-banner');
    expect(banner.classList.contains('d-none')).toBe(false);
    expect(
      document.getElementById('detalle-rejection-reason').textContent,
    ).toBe('Faltan imágenes');
    expect(document.getElementById('detalle-rejection-by').textContent).toBe(
      'Admin Test',
    );
    expect(document.getElementById('detalle-rejection-at').textContent).toMatch(
      /\d{2}\/\d{2}\/\d{4}/,
    );
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('updates status badge and hides audit card after approving (no reload)', async () => {
    mockAuth.me.mockResolvedValue({ role: 'admin_sistema' });
    mockNotificationService.getPendingApprovals.mockResolvedValue({
      data: [
        {
          id: 303,
          type: 'incident_pending_approval',
          processed_at: null,
          data: { incident_id: 42 },
        },
      ],
      meta: { total: 1 },
    });
    mockNotificationService.approve.mockResolvedValue({ id: 303 });
    let getCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/42') {
        getCallCount += 1;
        if (getCallCount === 1) {
          return Promise.resolve({ data: resolvedIncidentFixture() });
        }
        return Promise.resolve({
          data: {
            ...resolvedIncidentFixture(),
            status: 'closed',
            status_history: [
              {
                id: 9,
                user_id: 1,
                previous_status: 'resolved',
                new_status: 'closed',
                notes: null,
                created_at: '2026-07-31T10:00:00Z',
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    await component.onInit({ params: { id: 42 } });
    await vi.waitUntil(() => {
      const el = document.getElementById('detalle-auditar-actions');
      return el && !el.classList.contains('d-none');
    });

    // Before approving: badge says "Resuelto" and audit card is visible.
    expect(document.getElementById('detalle-status').textContent).toBe(
      'Resuelto',
    );
    expect(
      document.getElementById('detalle-auditar').classList.contains('d-none'),
    ).toBe(false);

    document.getElementById('btn-auditar-aprobar').click();

    await vi.waitUntil(() => getCallCount >= 2);
    expect(document.getElementById('detalle-status').textContent).toBe(
      'Cerrada',
    );
    expect(
      document.getElementById('detalle-auditar').classList.contains('d-none'),
    ).toBe(true);
    // Confirm SPA-reactive refresh: GET /incidents/{id} was the refresh path.
    const refreshCalls = mockHttp.get.mock.calls.filter(
      ([url]) => url === '/incidents/42',
    );
    expect(refreshCalls.length).toBeGreaterThanOrEqual(2);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
