/**
 * feed-detail component unit tests — citizen-side public comments wiring
 * (Phase 3 — 33bd3210).
 *
 * Split into its own file (mirrors the app-shell.*.test.js convention of
 * one file per concern) rather than extending feed-detail.test.js, since
 * that file's fixtures deliberately call `onInit()` with no `params.id` to
 * exercise the back-link contract without touching the network layer —
 * mixing in a full http.service.js mock there would be an unrelated
 * change to a passing, narrowly-scoped test file.
 *
 * Mirrors incidencias.detail.component.test.js: mock http.service.js
 * directly (perfil.test.js pattern), build a minimal DOM fixture with only
 * the ids the component touches unconditionally, then drive onInit({
 * params, role }) directly.
 */

const mockHttp = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue(null),
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

function buildFeedDetailDom() {
  document.body.innerHTML = `
    <div id="fd-loading"></div>
    <div id="fd-empty" class="d-none"></div>
    <div id="fd-error" class="d-none"></div>
    <div id="fd-detail" class="d-none">
      <div id="fd-header-content"></div>
      <div id="fd-description"></div>
      <div id="fd-meta"></div>
      <div id="fd-map"></div>
    </div>
    <a class="fd-back-feed" href="#/feed"></a>

    <form id="fd-comment-form">
      <textarea id="fd-comment-input"></textarea>
      <div id="fd-comment-error" class="d-none"></div>
      <button type="submit" id="fd-comment-submit">Publicar</button>
    </form>
    <div id="fd-comments-loading"></div>
    <ul id="fd-comments-list"></ul>
    <p id="fd-comments-empty" class="d-none">Sin comentarios todavía.</p>
  `;
}

const incidentFixture = {
  id: 7,
  title: 'Semáforo dañado',
  description: 'No enciende',
  status: 'pending',
  priority: 'low',
  created_at: '2026-07-01T08:00:00Z',
  user: { first_name: 'Rosa', last_name: 'Diaz' },
  // No geom — renderMap short-circuits (this._mapCoords never gets set).
};

function commentFixture(overrides = {}) {
  return {
    id: 1,
    message: 'Sigue sin funcionar',
    user: { first_name: 'Carlos', last_name: 'Ruiz' },
    created_at: '2026-07-02T09:00:00Z',
    ...overrides,
  };
}

describe('feed-detail — citizen comments', () => {
  let component;

  beforeAll(async () => {
    const mod = await import('./feed-detail.component.js');
    component = mod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    buildFeedDetailDom();
  });

  afterEach(() => {
    component.onDestroy?.();
  });

  it('renders the comments returned by the initial GET', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/7') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/7/comments')) {
        return Promise.resolve({ data: [commentFixture()] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 7 }, role: 'citizen' });
    await vi.waitUntil(
      () => document.getElementById('fd-comments-list').children.length > 0,
    );

    const list = document.getElementById('fd-comments-list');
    expect(list.children).toHaveLength(1);
    expect(list.textContent).toContain('Sigue sin funcionar');
    expect(list.textContent).toContain('Carlos Ruiz');
    expect(
      document.getElementById('fd-comments-empty').classList.contains('d-none'),
    ).toBe(true);
  });

  it('shows the empty-state message when there are no comments yet', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/7') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/7/comments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 7 }, role: 'citizen' });
    await vi.waitUntil(
      () =>
        !document
          .getElementById('fd-comments-empty')
          .classList.contains('d-none'),
    );

    expect(document.getElementById('fd-comments-list').children).toHaveLength(
      0,
    );
  });

  it('posts a new comment via POST /incidents/{id}/comments and appends it after reload', async () => {
    let commentsCallCount = 0;
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/7') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/7/comments')) {
        commentsCallCount += 1;
        if (commentsCallCount === 1) {
          return Promise.resolve({ data: [commentFixture()] });
        }
        return Promise.resolve({
          data: [
            commentFixture(),
            commentFixture({
              id: 2,
              message: 'Ya lo reportamos',
              user: { first_name: 'Ana' },
            }),
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockHttp.post.mockResolvedValue({
      data: commentFixture({ id: 2, message: 'Ya lo reportamos' }),
    });

    await component.onInit({ params: { id: 7 }, role: 'citizen' });
    await vi.waitUntil(
      () => document.getElementById('fd-comments-list').children.length > 0,
    );

    document.getElementById('fd-comment-input').value = 'Ya lo reportamos';
    document
      .getElementById('fd-comment-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitUntil(() => mockHttp.post.mock.calls.length > 0);

    expect(mockHttp.post).toHaveBeenCalledWith('/incidents/7/comments', {
      message: 'Ya lo reportamos',
    });

    await vi.waitUntil(
      () => document.getElementById('fd-comments-list').children.length === 2,
    );
    expect(document.getElementById('fd-comments-list').textContent).toContain(
      'Ya lo reportamos',
    );
    expect(document.getElementById('fd-comment-input').value).toBe('');
  });

  it('shows a validation error and does not call the API when the comment is empty', async () => {
    mockHttp.get.mockImplementation((path) => {
      if (path === '/incidents/7') {
        return Promise.resolve({ data: incidentFixture });
      }
      if (path.startsWith('/incidents/7/comments')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    await component.onInit({ params: { id: 7 }, role: 'citizen' });
    await vi.waitUntil(
      () =>
        !document
          .getElementById('fd-comments-empty')
          .classList.contains('d-none'),
    );

    document.getElementById('fd-comment-input').value = '   ';
    document
      .getElementById('fd-comment-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockHttp.post).not.toHaveBeenCalled();
    const errorEl = document.getElementById('fd-comment-error');
    expect(errorEl.classList.contains('d-none')).toBe(false);
    expect(errorEl.textContent).toBe('El comentario no puede estar vacío.');
  });
});
