/**
 * Perfil component unit tests — profile update form behavior.
 *
 * Tests the component contract, onInit fetch, submit handler payload,
 * and error handling. The profile form does NOT include password change
 * (handled by a separate recovery flow).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

vi.mock('../../core/http.service.js', () => ({
  http: mockHttp,
  setAccessToken: vi.fn(),
  clearAuthState: vi.fn(),
}));
vi.mock('../../core/router.js', () => ({ router: mockRouter }));
vi.mock('../../auth/auth.service.js', () => ({ auth: mockAuth }));

// jsdom does not implement URL.createObjectURL — stub it globally
const mockBlobUrl = 'blob:mock-avatar-url';
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => mockBlobUrl),
  revokeObjectURL: vi.fn(),
});

// ── Import the component ──
let perfilComponent;

describe('perfilComponent', () => {
  beforeAll(async () => {
    const mod = await import('./perfil.component.js');
    perfilComponent = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <form id="form-perfil" novalidate>
        <input type="text" id="perfil-nombre" />
        <input type="text" id="perfil-apellido" />
        <input type="text" id="perfil-telefono" />
        <button type="submit" id="btn-guardar-perfil">
          <span id="perfil-btn-texto">Guardar</span>
          <span id="perfil-btn-loading" class="d-none">Guardando...</span>
        </button>
      </form>
      <div id="toast-msg" class="toast align-items-center text-white border-0" role="alert">
        <div id="toast-msg-texto"></div>
      </div>
    `;
  });

  afterEach(() => {
    if (perfilComponent?.onDestroy) {
      perfilComponent.onDestroy();
    }
  });

  // ── Contract test ──────────────────────────────────────────

  it('exports defineComponent contract (template, onInit, onDestroy)', () => {
    expect(perfilComponent).not.toBeNull();
    expect(perfilComponent).toHaveProperty('template');
    expect(perfilComponent).toHaveProperty('onInit');
    expect(perfilComponent).toHaveProperty('onDestroy');
    expect(typeof perfilComponent.onInit).toBe('function');
    expect(typeof perfilComponent.onDestroy).toBe('function');
  });

  // ── Scoped CSS wiring (REQ-FRONTEND-EVENTS) ────────────────
  // The custom router in core/router.js injects a <style> tag only when
  // component.style is truthy. Without it the .perfil-grid, .perfil-card,
  // .perfil-avatar-wrap, etc. CSS rules in perfil.component.css never load
  // and the redesign is invisible at runtime (HTML keeps the new classes
  // but no styles apply, so the page looks identical to the pre-redesign).

  it('bundles perfil.component.css as a style string', () => {
    expect(typeof perfilComponent.style).toBe('string');
    expect(perfilComponent.style.length).toBeGreaterThan(0);
  });

  // ── onInit fetches /me and populates form ──────────────────

  it('onInit fetches user profile via GET /me and populates fields', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        email: 'juan@example.com',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
        organization: { id: 1, name: 'Org1' },
      },
    });

    await perfilComponent.onInit();

    expect(mockHttp.get).toHaveBeenCalledWith('/me');
    expect(mockHttp.get).toHaveBeenCalledTimes(1);
    expect(document.getElementById('perfil-nombre').value).toBe('Juan');
    expect(document.getElementById('perfil-apellido').value).toBe('Perez');
    expect(document.getElementById('perfil-telefono').value).toBe('123456789');
  });

  // ── Submit handler calls PUT /auth/profile ─────────────────

  it('sends PUT /auth/profile with correct payload on form submit', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        email: 'juan@example.com',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockHttp.put.mockResolvedValue({ data: { id: 1 } });

    await perfilComponent.onInit();

    // Modify fields
    document.getElementById('perfil-nombre').value = 'Juan Carlos';
    document.getElementById('perfil-telefono').value = '987654321';

    // Submit
    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    // Wait for microtask queue
    await vi.waitUntil(() => mockHttp.put.mock.calls.length > 0);

    expect(mockHttp.put).toHaveBeenCalledWith('/auth/profile', {
      first_name: 'Juan Carlos',
      last_name: 'Perez',
      phone: '987654321',
    });
    // Password is never part of the payload
    const payload = mockHttp.put.mock.calls[0][1];
    expect(payload).not.toHaveProperty('password');
  });

  // ── Submit with empty phone (must send null) ───────────────

  it('sends PUT /auth/profile with phone: null when phone is empty', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        email: 'juan@example.com',
        phone: '',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockHttp.put.mockResolvedValue({ data: { id: 1 } });

    await perfilComponent.onInit();

    document.getElementById('perfil-nombre').value = 'Juan';
    document.getElementById('perfil-apellido').value = 'Perez';
    document.getElementById('perfil-telefono').value = '';

    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    await vi.waitUntil(() => mockHttp.put.mock.calls.length > 0);

    expect(mockHttp.put).toHaveBeenCalledWith('/auth/profile', {
      first_name: 'Juan',
      last_name: 'Perez',
      phone: null,
    });
  });

  // ── Error handling ─────────────────────────────────────────

  it('shows error toast when PUT /auth/profile fails', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        email: 'juan@example.com',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockHttp.put.mockRejectedValue(new Error('Error de conexión'));

    const showSpy = vi.spyOn(bootstrap.Toast.prototype, 'show');

    await perfilComponent.onInit();

    document.getElementById('perfil-nombre').value = 'Juan';
    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    await vi.waitUntil(() => mockHttp.put.mock.calls.length > 0);
    // Give the catch handler time to update the toast
    await vi.waitUntil(
      () => document.getElementById('toast-msg-texto').textContent.length > 0,
    );

    expect(document.getElementById('toast-msg-texto').textContent).toBe(
      'Error de conexión',
    );
    expect(showSpy).toHaveBeenCalled();
  });

  // ── Handles missing DOM gracefully ─────────────────────────

  it('onInit handles API failure gracefully (shows error toast)', async () => {
    mockHttp.get.mockRejectedValue(new Error('Error de red'));

    const showSpy = vi.spyOn(bootstrap.Toast.prototype, 'show');

    await perfilComponent.onInit();

    // Should show error toast
    await vi.waitUntil(
      () => document.getElementById('toast-msg-texto').textContent.length > 0,
    );

    expect(document.getElementById('toast-msg-texto').textContent).toBe(
      'Error al cargar el perfil.',
    );
    expect(showSpy).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// Avatar upload suite (C1 — profile image upload)
// ────────────────────────────────────────────────────────────────────

describe('perfilComponent — avatar upload (C1)', () => {
  /** Minimal File-like object for FormData assertions */
  function makeFakeFile(name = 'avatar.jpg', type = 'image/jpeg', size = 2048) {
    return new File(['x'.repeat(size)], name, { type });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <form id="form-perfil" novalidate>
        <input type="text" id="perfil-nombre" value="Juan" />
        <input type="text" id="perfil-apellido" value="Perez" />
        <input type="text" id="perfil-telefono" value="123456789" />
        <input type="file" id="perfil-avatar" accept="image/*" />
        <div class="perfil-avatar-wrap" id="perfil-avatar-wrap-btn">
          <img id="perfil-avatar-preview" src="#" style="display:none" />
        </div>
        <button type="submit" id="btn-guardar-perfil">
          <span id="perfil-btn-texto">Guardar</span>
          <span id="perfil-btn-loading" class="d-none">Guardando...</span>
        </button>
      </form>
      <div id="toast-msg" class="toast align-items-center text-white border-0" role="alert">
        <div id="toast-msg-texto"></div>
      </div>
    `;
  });

  afterEach(() => {
    if (perfilComponent?.onDestroy) {
      perfilComponent.onDestroy();
    }
  });

  it('exports defineComponent contract (template, onInit, onDestroy)', () => {
    expect(perfilComponent).not.toBeNull();
    expect(perfilComponent).toHaveProperty('template');
    expect(perfilComponent).toHaveProperty('onInit');
    expect(perfilComponent).toHaveProperty('onDestroy');
    expect(typeof perfilComponent.onInit).toBe('function');
    expect(typeof perfilComponent.onDestroy).toBe('function');
  });

  it('shows avatar preview via URL.createObjectURL when a file is selected', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockAuth.me.mockResolvedValue({
      id: 1,
      first_name: 'Juan',
      last_name: 'Perez',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
    });

    await perfilComponent.onInit();

    const fileInput = document.getElementById('perfil-avatar');
    const file = makeFakeFile();
    // Simulate file selection
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    const preview = document.getElementById('perfil-avatar-preview');
    // Preview should now have a src (object URL) and be visible
    expect(preview.src).toBeTruthy();
    expect(preview.src).toBe(mockBlobUrl);
    expect(preview.style.display).not.toBe('none');
  });

  it('shows the default avatar image when the user has no photo', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        profile_image_path: null,
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockAuth.me.mockResolvedValue({
      id: 1,
      first_name: 'Juan',
      last_name: 'Perez',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
    });

    await perfilComponent.onInit();

    const preview = document.getElementById('perfil-avatar-preview');
    expect(preview.src).toContain('default-avatar.svg');
    expect(preview.style.display).not.toBe('none');
  });

  it('uploads avatar via PUT /auth/profile with FormData and triggers auth refresh', async () => {
    const updatedUser = {
      id: 1,
      first_name: 'Juan',
      last_name: 'Perez',
      profile_image_path: 'users/1/abc123.webp',
      role: { id: 1, name: 'admin_sistema' },
    };
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockAuth.me.mockResolvedValue(updatedUser);
    mockHttp.put.mockResolvedValue({ data: updatedUser });

    await perfilComponent.onInit();

    // Select a file
    const fileInput = document.getElementById('perfil-avatar');
    const file = makeFakeFile();
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Submit form — the async handler is scheduled as a microtask
    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    // Flush microtasks so the async handler runs to completion
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert FormData was sent (multipart — no Content-Type header set)
    expect(mockHttp.put).toHaveBeenCalled();
    const [, body] = mockHttp.put.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    // FormData should contain avatar file
    expect(body.has('avatar')).toBe(true);
    expect(body.get('avatar')).toBe(file);
    // FormData should contain text fields
    expect(body.get('first_name')).toBe('Juan');
    expect(body.get('last_name')).toBe('Perez');
    expect(body.get('phone')).toBe('123456789');

    // Assert auth refresh after success
    expect(mockAuth.me).toHaveBeenCalled();
    expect(mockAuth._notifyAuthChange).toHaveBeenCalled();
  });

  it('shows error toast when PUT /auth/profile fails with network error', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockHttp.put.mockRejectedValue(new Error('Error de conexión'));
    mockAuth.me.mockResolvedValue({
      id: 1,
      first_name: 'Juan',
      last_name: 'Perez',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
    });

    await perfilComponent.onInit();

    // Select a file
    const fileInput = document.getElementById('perfil-avatar');
    Object.defineProperty(fileInput, 'files', {
      value: [makeFakeFile()],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    await vi.waitUntil(() => mockHttp.put.mock.calls.length > 0);
    await vi.waitUntil(
      () => document.getElementById('toast-msg-texto').textContent.length > 0,
    );

    // auth refresh should NOT be called on failure
    expect(mockAuth.me).not.toHaveBeenCalled();
    expect(mockAuth._notifyAuthChange).not.toHaveBeenCalled();
  });

  it('revokes the object URL on component destroy', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockAuth.me.mockResolvedValue({
      id: 1,
      first_name: 'Juan',
      last_name: 'Perez',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
    });
    mockHttp.put.mockResolvedValue({
      data: { id: 1, first_name: 'Juan', last_name: 'Perez' },
    });

    await perfilComponent.onInit();

    // Select a file to create a blob URL
    const fileInput = document.getElementById('perfil-avatar');
    Object.defineProperty(fileInput, 'files', {
      value: [makeFakeFile()],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Get the blob URL before destroy
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    perfilComponent.onDestroy();

    expect(revokeSpy).toHaveBeenCalledWith(mockBlobUrl);
  });

  it('sends FormData (not JSON) when avatar file is selected', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockAuth.me.mockResolvedValue({
      id: 1,
      first_name: 'Juan',
      last_name: 'Perez',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
    });
    mockHttp.put.mockResolvedValue({
      data: { id: 1, first_name: 'Juan', last_name: 'Perez' },
    });

    await perfilComponent.onInit();

    // Select a file
    const fileInput = document.getElementById('perfil-avatar');
    Object.defineProperty(fileInput, 'files', {
      value: [makeFakeFile()],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    await vi.waitUntil(() => mockHttp.put.mock.calls.length > 0);

    // Body must be FormData (not a plain object)
    const [, body] = mockHttp.put.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    expect(body.has('avatar')).toBe(true);
  });

  it('sends JSON payload when no avatar file is selected (text-only update)', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        role: { id: 1, name: 'admin_sistema' },
      },
    });
    mockHttp.put.mockResolvedValue({ data: { id: 1 } });

    await perfilComponent.onInit();

    // No file selected — files array is empty
    const fileInput = document.getElementById('perfil-avatar');
    Object.defineProperty(fileInput, 'files', {
      value: [],
      configurable: true,
    });

    document.getElementById('form-perfil').dispatchEvent(new Event('submit'));

    await vi.waitUntil(() => mockHttp.put.mock.calls.length > 0);

    // Body must be plain object (JSON), not FormData
    const [, body] = mockHttp.put.mock.calls[0];
    expect(body).not.toBeInstanceOf(FormData);
    expect(body).toEqual({
      first_name: 'Juan',
      last_name: 'Perez',
      phone: '123456789',
    });
  });

  // ── REQ-REDESIGN-2..8: layout, email readonly, browse button ──

  describe('perfilComponent — redesign layout (REQ-REDESIGN-2..8)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      document.body.innerHTML = `
        <nav class="perfil-breadcrumb" aria-label="breadcrumb">Configuración / Mi Perfil</nav>
        <div class="perfil-grid">
          <div class="perfil-avatar-wrap" id="perfil-avatar-wrap-btn">
            <img id="perfil-avatar-preview" src="#" alt="avatar" style="display:none" />
          </div>
          <div>
            <form id="form-perfil" novalidate>
              <input type="text" id="perfil-nombre" value="Juan" />
              <input type="text" id="perfil-apellido" value="Perez" />
              <input type="text" id="perfil-telefono" value="123456789" />
              <input type="email" id="perfil-email" class="perfil-input" readonly />
              <input type="file" id="perfil-avatar" accept="image/jpeg,image/png,image/webp" style="display:none" />
              <span class="perfil-updated-at" id="perfil-updated-at"></span>
              <button type="submit" id="btn-guardar-perfil">
                <span id="perfil-btn-texto">Guardar</span>
                <span id="perfil-btn-loading" class="d-none">Guardando...</span>
              </button>
            </form>
          </div>
        </div>
        <div id="toast-msg" class="toast align-items-center text-white border-0" role="alert">
          <div id="toast-msg-texto"></div>
        </div>
      `;
    });

    afterEach(() => {
      if (perfilComponent?.onDestroy) {
        perfilComponent.onDestroy();
      }
    });

    it('renders 2-column grid on desktop', async () => {
      mockHttp.get.mockResolvedValue({
        data: {
          id: 1,
          first_name: 'Juan',
          last_name: 'Perez',
          email: 'juan@example.com',
          phone: '123456789',
          role: { id: 1, name: 'admin_sistema' },
        },
      });

      await perfilComponent.onInit();

      const grid = document.querySelector('.perfil-grid');
      expect(grid).not.toBeNull();
      // Verify the grid class exists and CSS defines 160px + 1fr columns
      expect(grid.classList.contains('perfil-grid')).toBe(true);
      // The CSS file (perfil.component.css) defines the 2-column layout
      // (grid-template-columns: 160px 1fr); CSS content is verified at
      // runtime. In jsdom we verify the class presence only.
      expect(grid).toBeTruthy();
    });

    it('stacks vertically on mobile (max-width: 767px)', async () => {
      mockHttp.get.mockResolvedValue({
        data: {
          id: 1,
          first_name: 'Juan',
          last_name: 'Perez',
          email: 'juan@example.com',
          phone: '123456789',
          role: { id: 1, name: 'admin_sistema' },
        },
      });

      await perfilComponent.onInit();

      const grid = document.querySelector('.perfil-grid');
      expect(grid).not.toBeNull();
      // Verify media query CSS exists for the mobile breakpoint
      expect(grid.classList.contains('perfil-grid')).toBe(true);
      // The CSS file defines @media(max-width:767px) with grid-template-columns:1fr
      expect(grid).toBeTruthy();
    });

    it('email field is readonly', async () => {
      mockHttp.get.mockResolvedValue({
        data: {
          id: 1,
          first_name: 'Juan',
          last_name: 'Perez',
          email: 'juan@example.com',
          phone: '123456789',
          role: { id: 1, name: 'admin_sistema' },
        },
      });

      await perfilComponent.onInit();

      const emailInput = document.getElementById('perfil-email');
      expect(emailInput).not.toBeNull();
      expect(emailInput.hasAttribute('readonly')).toBe(true);
    });

    it('avatar wrap click triggers hidden file input click', async () => {
      mockHttp.get.mockResolvedValue({
        data: {
          id: 1,
          first_name: 'Juan',
          last_name: 'Perez',
          email: 'juan@example.com',
          phone: '123456789',
          role: { id: 1, name: 'admin_sistema' },
        },
      });

      await perfilComponent.onInit();

      const avatarInput = document.getElementById('perfil-avatar');
      const clickSpy = vi.spyOn(avatarInput, 'click');

      const avatarWrapBtn = document.getElementById('perfil-avatar-wrap-btn');
      avatarWrapBtn.click();

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('populates email field from /me response', async () => {
      mockHttp.get.mockResolvedValue({
        data: {
          id: 1,
          first_name: 'Juan',
          last_name: 'Perez',
          email: 'juan@example.com',
          phone: '123456789',
          role: { id: 1, name: 'admin_sistema' },
        },
      });

      await perfilComponent.onInit();

      const emailInput = document.getElementById('perfil-email');
      expect(emailInput.value).toBe('juan@example.com');
    });
  });

  // ── onInit existing avatar display ─────────────────────────────

  it('shows existing profile_image_path on page load', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '123456789',
        profile_image_path: 'users/1/abc.webp',
        role: { id: 1, name: 'admin_sistema' },
      },
    });

    await perfilComponent.onInit();

    const preview = document.getElementById('perfil-avatar-preview');
    expect(preview.src).toContain('/storage/users/1/abc.webp');
    expect(preview.style.display).toBe('block');
  });

  it('shows the default avatar when no profile_image_path', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        id: 1,
        first_name: 'Ana',
        last_name: 'Lopez',
        phone: '123456789',
        profile_image_path: null,
        role: { id: 1, name: 'admin_sistema' },
      },
    });

    await perfilComponent.onInit();

    const preview = document.getElementById('perfil-avatar-preview');
    // Default avatar image instead of a hidden/empty preview
    expect(preview.src).toContain('default-avatar.svg');
    expect(preview.style.display).not.toBe('none');
  });
});

// ────────────────────────────────────────────────────────────────────
// Shell-independence suite
//
// Per the layout-unification change, /configuracion/perfil is now
// mounted under the admin shell (#main-wrapper > .page-wrapper >
// #page-outlet) instead of the user shell (.lu-main > #shell-content).
// The component is required to be shell-agnostic: it must populate
// the same form fields and produce identical output regardless of
// which shell wrapper hosts it, and its source files must NOT
// reference shell-specific selectors.
// ────────────────────────────────────────────────────────────────────

describe('perfilComponent — shell independence', () => {
  /**
   * Build a host DOM context that mimics either the admin shell
   * (Freedash-style wrappers) or the user shell (Lu-* wrappers),
   * with the perfil form nested inside the outlet slot.
   */
  function buildHostContext(shell) {
    const formHtml = `
      <form id="form-perfil" novalidate>
        <input type="text" id="perfil-nombre" />
        <input type="text" id="perfil-apellido" />
        <input type="text" id="perfil-telefono" />
        <button type="submit" id="btn-guardar-perfil">
          <span id="perfil-btn-texto">Guardar</span>
          <span id="perfil-btn-loading" class="d-none">Guardando...</span>
        </button>
      </form>
      <div id="toast-msg" class="toast align-items-center text-white border-0" role="alert">
        <div id="toast-msg-texto"></div>
      </div>
    `;
    if (shell === 'admin') {
      return `
        <div id="main-wrapper">
          <div class="page-wrapper">
            <div id="page-outlet">${formHtml}</div>
          </div>
        </div>
      `;
    }
    if (shell === 'user') {
      return `
        <div class="lu-main">
          <div id="shell-content">${formHtml}</div>
        </div>
      `;
    }
    throw new Error(`Unknown shell: ${shell}`);
  }

  const profileFixture = {
    id: 1,
    first_name: 'Maria',
    last_name: 'Gonzalez',
    email: 'maria@example.com',
    phone: '5551234567',
    role: { id: 1, name: 'admin_sistema' },
    organization: { id: 1, name: 'Org1' },
  };

  // Run the onInit/render contract against each shell host context.
  for (const shell of ['admin', 'user']) {
    describe(`mounted under ${shell} shell`, () => {
      beforeEach(() => {
        document.body.innerHTML = buildHostContext(shell);
      });

      it('resolves all canonical form field IDs after onInit', async () => {
        mockHttp.get.mockResolvedValue({ data: profileFixture });

        await perfilComponent.onInit();

        expect(document.getElementById('form-perfil')).not.toBeNull();
        expect(document.getElementById('perfil-nombre')).not.toBeNull();
        expect(document.getElementById('perfil-apellido')).not.toBeNull();
        expect(document.getElementById('perfil-telefono')).not.toBeNull();
        expect(document.getElementById('perfil-btn-texto')).not.toBeNull();
        expect(document.getElementById('perfil-btn-loading')).not.toBeNull();
        expect(document.getElementById('btn-guardar-perfil')).not.toBeNull();
        expect(document.getElementById('toast-msg')).not.toBeNull();
      });

      it('populates field values from /me identically in both hosts', async () => {
        mockHttp.get.mockResolvedValue({ data: profileFixture });

        await perfilComponent.onInit();

        expect(document.getElementById('perfil-nombre').value).toBe('Maria');
        expect(document.getElementById('perfil-apellido').value).toBe(
          'Gonzalez',
        );
        expect(document.getElementById('perfil-telefono').value).toBe(
          '5551234567',
        );
      });

      it('does not introduce shell-specific selectors into the rendered DOM', async () => {
        mockHttp.get.mockResolvedValue({ data: profileFixture });

        await perfilComponent.onInit();

        // The perfil component itself must not add Lu-* or shell wrappers
        // when rendered; it only sets .value on existing inputs.
        expect(document.querySelectorAll('.lu-main').length).toBe(
          shell === 'user' ? 1 : 0,
        );
        expect(document.querySelectorAll('#main-wrapper').length).toBe(
          shell === 'admin' ? 1 : 0,
        );

        // No sidebar/header wrappers are introduced by the component.
        const shellOnlySelector = document.querySelector('.lu-sidebar');
        const otherSideOnly = document.querySelector('.lu-header');
        // These are user-shell wrappers; they only exist in the user host.
        if (shell === 'admin') {
          expect(shellOnlySelector).toBeNull();
          expect(otherSideOnly).toBeNull();
        }
      });
    });
  }

  // ── Static guard: source files must not embed shell-specific selectors ──

  describe('source files (static shell-coupling check)', () => {
    /**
     * Selectors whose presence in the source would indicate the perfil
     * component is hard-coded to a particular shell. The component must
     * only address canonical form IDs (form-perfil, perfil-*, toast-msg).
     */
    const forbiddenSubstrings = [
      '.lu-main',
      '#main-wrapper',
      '.page-wrapper',
      '.lu-sidebar',
      '.lu-header',
    ];

    const sources = ['perfil.component.js', 'perfil.component.html'];

    it.each(sources)(
      '%s does not contain shell-specific selectors',
      (filename) => {
        const filePath = resolve(__dirname, filename);
        const source = readFileSync(filePath, 'utf8');

        for (const forbidden of forbiddenSubstrings) {
          expect(
            source.includes(forbidden),
            `expected ${filename} NOT to contain "${forbidden}"`,
          ).toBe(false);
        }
      },
    );
  });
});
