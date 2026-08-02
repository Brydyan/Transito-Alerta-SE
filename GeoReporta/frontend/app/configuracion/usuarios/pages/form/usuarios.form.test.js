/**
 * usuarios.form component unit tests — admin user create/edit form.
 *
 * Avatar handling now lives inside the form submit (PUT /users/:id with
 * multipart FormData when an avatar is selected, or a `_delete_avatar`
 * flag in JSON when the user opts to remove the existing avatar). The
 * standalone POST /users/:id/avatar and DELETE /users/:id/avatar endpoints
 * are gone — see CHANGELOG.
 */

const mockHttp = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue(null),
}));

const mockRouter = vi.hoisted(() => ({
  queryParams: new URLSearchParams(),
  navigate: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({
  me: vi.fn(),
  _notifyAuthChange: vi.fn(),
}));

vi.mock('../../../../core/http.service.js', () => ({
  http: mockHttp,
  setAccessToken: vi.fn(),
  clearAuthState: vi.fn(),
}));
vi.mock('../../../../core/router.js', () => ({ router: mockRouter }));
vi.mock('../../../../auth/auth.service.js', () => ({ auth: mockAuth }));

// jsdom does not implement URL.createObjectURL — stub it globally
const mockBlobUrl = 'blob:mock-avatar-url';
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => mockBlobUrl),
  revokeObjectURL: vi.fn(),
});

// Stub window.confirm so click-on-delete doesn't block tests.
vi.stubGlobal(
  'confirm',
  vi.fn(() => true),
);

let usuariosFormComponent;

function _setupEditDom() {
  document.body.innerHTML = `
    <span id="form-titulo">Nuevo Usuario</span>
    <span id="card-titulo">Nuevo Usuario</span>
    <span id="breadcrumb-actual">Crear</span>
    <form id="form-user" novalidate>
      <input type="hidden" id="user-id" value="5" />
      <input type="hidden" id="user-delete-avatar-flag" value="0" />
      <input type="text" id="user-nombre" value="Juan" />
      <input type="text" id="user-apellido" value="Perez" />
      <input type="email" id="user-email" value="juan@example.com" />
      <input type="text" id="user-telefono" value="123456789" />
      <select id="user-rol"></select>
      <select id="user-org"></select>
      <div class="avatar-wrap" id="user-avatar-wrap-btn">
        <img id="user-avatar-preview" style="display:none" />
      </div>
      <input type="file" id="user-avatar" accept="image/jpeg,image/png,image/webp" />
      <button type="button" id="btn-eliminar-avatar" class="d-none">Eliminar foto</button>
      <button type="button" id="btn-cancelar">Cancelar</button>
      <button type="submit" id="btn-guardar-user">
        <span id="user-btn-texto">Guardar</span>
        <span id="user-btn-loading" class="d-none">Guardando...</span>
      </button>
    </form>
    <div id="toast-msg" class="toast align-items-center text-white border-0" role="alert">
      <div id="toast-msg-texto"></div>
    </div>
  `;
}

function _mockEditUserGet(extra = {}) {
  mockHttp.get.mockResolvedValue({
    data: {
      id: 5,
      first_name: 'Juan',
      last_name: 'Perez',
      email: 'juan@example.com',
      phone: '123456789',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
      roles: [{ id: 1, name: 'admin_sistema' }],
      organizations: [{ id: 1, name: 'Org1' }],
      ...extra,
    },
  });
  mockAuth.me.mockResolvedValue({
    id: 1,
    first_name: 'Admin',
    last_name: 'User',
    profile_image_path: null,
  });
}

function makeFakeFile(name = 'avatar.jpg', type = 'image/jpeg', size = 2048) {
  return new File(['x'.repeat(size)], name, { type });
}

function _selectAvatarFile(file) {
  const fileInput = document.getElementById('user-avatar');
  Object.defineProperty(fileInput, 'files', {
    value: [file],
    configurable: true,
  });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('usuariosFormComponent — contract & load', () => {
  beforeAll(async () => {
    const mod = await import('./usuarios.form.component.js');
    usuariosFormComponent = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.queryParams.has = vi.fn((key) => key === 'id');
    mockRouter.queryParams.get = vi.fn((key) => (key === 'id' ? '5' : null));
    document.body.innerHTML = '';
  });

  afterEach(() => {
    usuariosFormComponent?.onDestroy?.();
  });

  it('exports defineComponent contract (template, style, onInit, onDestroy)', () => {
    expect(usuariosFormComponent).not.toBeNull();
    expect(usuariosFormComponent).toHaveProperty('template');
    expect(usuariosFormComponent).toHaveProperty('style');
    expect(usuariosFormComponent).toHaveProperty('onInit');
    expect(usuariosFormComponent).toHaveProperty('onDestroy');
    expect(typeof usuariosFormComponent.onInit).toBe('function');
    expect(typeof usuariosFormComponent.onDestroy).toBe('function');
  });

  it('bundles the shared-scoped stylesheet as a style string', () => {
    expect(typeof usuariosFormComponent.style).toBe('string');
    expect(usuariosFormComponent.style.length).toBeGreaterThan(0);
  });
});

describe('usuariosFormComponent — avatar preview', () => {
  beforeAll(async () => {
    const mod = await import('./usuarios.form.component.js');
    usuariosFormComponent = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.queryParams.has = vi.fn((key) => key === 'id');
    mockRouter.queryParams.get = vi.fn((key) => (key === 'id' ? '5' : null));
    _setupEditDom();
  });

  afterEach(() => {
    usuariosFormComponent?.onDestroy?.();
  });

  it('shows preview via URL.createObjectURL when a file is selected', async () => {
    _mockEditUserGet();
    await usuariosFormComponent.onInit();

    const file = makeFakeFile();
    _selectAvatarFile(file);

    const preview = document.getElementById('user-avatar-preview');
    expect(preview.getAttribute('src')).toBe(mockBlobUrl);
    expect(preview.style.display).not.toBe('none');
  });

  it('renders existing avatar from profile_image_path on init', async () => {
    _mockEditUserGet({ profile_image_path: 'users/5/abc123.webp' });
    await usuariosFormComponent.onInit();

    const preview = document.getElementById('user-avatar-preview');
    expect(preview.getAttribute('src')).toBe('/storage/users/5/abc123.webp');
    expect(preview.style.display).not.toBe('none');
  });

  it('exposes the delete button when an existing avatar is loaded', async () => {
    _mockEditUserGet({ profile_image_path: 'users/5/abc123.webp' });
    await usuariosFormComponent.onInit();

    expect(
      document
        .getElementById('btn-eliminar-avatar')
        .classList.contains('d-none'),
    ).toBe(false);
  });

  it('hides the delete button when no existing avatar is loaded', async () => {
    _mockEditUserGet({ profile_image_path: null });
    await usuariosFormComponent.onInit();

    expect(
      document
        .getElementById('btn-eliminar-avatar')
        .classList.contains('d-none'),
    ).toBe(true);
  });

  it('marks delete flag and clears preview when delete button is clicked', async () => {
    _mockEditUserGet({ profile_image_path: 'users/5/abc123.webp' });
    await usuariosFormComponent.onInit();

    const deleteBtn = document.getElementById('btn-eliminar-avatar');
    deleteBtn.dispatchEvent(new Event('click', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('user-delete-avatar-flag').value).toBe('1');
    expect(deleteBtn.classList.contains('d-none')).toBe(true);
    expect(document.getElementById('user-avatar-preview').style.display).toBe(
      'none',
    );
  });
});

describe('usuariosFormComponent — submit', () => {
  beforeAll(async () => {
    const mod = await import('./usuarios.form.component.js');
    usuariosFormComponent = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.queryParams.has = vi.fn((key) => key === 'id');
    mockRouter.queryParams.get = vi.fn((key) => (key === 'id' ? '5' : null));
    _setupEditDom();
  });

  afterEach(() => {
    usuariosFormComponent?.onDestroy?.();
  });

  async function _triggerSubmit() {
    document.getElementById('form-user').dispatchEvent(new Event('submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('sends PUT /users/5 as plain JSON when no avatar is selected', async () => {
    _mockEditUserGet();
    mockHttp.put.mockResolvedValue({ data: { id: 5 } });

    await usuariosFormComponent.onInit();
    await _triggerSubmit();

    expect(mockHttp.put).toHaveBeenCalledTimes(1);
    const [path, body] = mockHttp.put.mock.calls[0];
    expect(path).toBe('/users/5');
    expect(body).not.toBeInstanceOf(FormData);
    expect(body.first_name).toBe('Juan');
    expect(body.last_name).toBe('Perez');
    expect(body.email).toBe('juan@example.com');
    expect(body._delete_avatar).toBeUndefined();
  });

  it('sends PUT /users/5 as FormData when an avatar file is selected', async () => {
    _mockEditUserGet();
    mockHttp.put.mockResolvedValue({ data: { id: 5 } });

    await usuariosFormComponent.onInit();
    const file = makeFakeFile();
    _selectAvatarFile(file);
    await _triggerSubmit();

    const [path, body] = mockHttp.put.mock.calls[0];
    expect(path).toBe('/users/5');
    expect(body).toBeInstanceOf(FormData);
    expect(body.has('avatar')).toBe(true);
    expect(body.get('avatar')).toBe(file);
    expect(body.get('first_name')).toBe('Juan');
    expect(body.get('email')).toBe('juan@example.com');
  });

  it('sends _delete_avatar=true when the user opted to remove the existing avatar', async () => {
    _mockEditUserGet({ profile_image_path: 'users/5/abc123.webp' });
    mockHttp.put.mockResolvedValue({ data: { id: 5 } });

    await usuariosFormComponent.onInit();
    document
      .getElementById('btn-eliminar-avatar')
      .dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await _triggerSubmit();

    const [path, body] = mockHttp.put.mock.calls[0];
    expect(path).toBe('/users/5');
    expect(body).not.toBeInstanceOf(FormData);
    expect(body._delete_avatar).toBe(true);
  });

  it('refreshes auth state and navigates back to the user list on save', async () => {
    _mockEditUserGet();
    mockHttp.put.mockResolvedValue({ data: { id: 5 } });

    await usuariosFormComponent.onInit();
    await _triggerSubmit();

    expect(mockAuth.me).toHaveBeenCalledTimes(2);
    expect(mockAuth._notifyAuthChange).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith('/usuarios');
  });

  it('shows error toast and does NOT navigate when save fails', async () => {
    _mockEditUserGet();
    mockHttp.put.mockRejectedValue(new Error('Error de conexión'));

    await usuariosFormComponent.onInit();
    await _triggerSubmit();

    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });
});

describe('usuariosFormComponent — destroy', () => {
  beforeAll(async () => {
    const mod = await import('./usuarios.form.component.js');
    usuariosFormComponent = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.queryParams.has = vi.fn((key) => key === 'id');
    mockRouter.queryParams.get = vi.fn((key) => (key === 'id' ? '5' : null));
    _setupEditDom();
  });

  it('revokes the open object URL on destroy', async () => {
    _mockEditUserGet();
    await usuariosFormComponent.onInit();

    _selectAvatarFile(makeFakeFile());

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    usuariosFormComponent.onDestroy();

    expect(revokeSpy).toHaveBeenCalled();
  });
});
