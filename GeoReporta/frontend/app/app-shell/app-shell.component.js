/**
 * appShell — unified responsive layout shell (PR #1 of consolidar-layout-unico).
 *
 * Replaces the previous dual-shell model (adminShell + userShell) with a single
 * CSS-grid layout that adapts to the user's role:
 *
 *   - admin (admin_sistema | admin_organizacion): back-office chrome with
 *     full sidebar nav, search bar in header, user menu dropdown.
 *   - citizen (any other authenticated role): simpler header (bell + avatar),
 *     flat 4-item sidebar, "+" plus button as the 3rd bottom-nav slot.
 *   - guest (no auth): login button instead of avatar.
 *
 * Role is exposed as a body[data-role] attribute and consumed by CSS rules
 * keyed on `[data-show-on-role="..."]`. No JS resize listeners — the browser
 * handles all breakpoint work via media queries.
 *
 * Wiring: registered with the router under shell name 'app' (PR #2). Until
 * then the shell is fully self-contained and can be mounted manually for
 * visual QA.
 */
import template from './app-shell.component.html?raw';
import style from './app-shell.component.css?raw';
import { auth } from '../auth/auth.service.js';
import { resolveRoleName, OPERATIONAL_ROLES } from '../utils/role.js';
import { resolveAvatarSrc } from '../utils/avatar.js';
import { menuService } from '../shared/menu.service.js';
import { permissionService } from '../shared/permission.service.js';
import { notificationService } from '../shared/notification.service.js';
import { router } from '../core/router.js';
import { timeAgo } from '../utils/format.js';

let _unsubAuth = null;

// User-menu instances (T-1.11 + citizen parity).
// We now have two menus with identical behavior: one in the admin header
// (avatar + name + chevron) and one in the citizen header (compact, just
// the avatar). Both run the same WAI-ARIA menu-button pattern, so we
// share the implementation via a factory and hold the instances in an
// array so destroy() can tear them all down.
let _userMenus = [];

// Sidebar collapse/expand module-scope state.
// - `_sidebarCollapsed` is the persisted user preference (desktop).
// - `_sidebarOpenMobile` is the transient off-canvas overlay state.
// - The two are kept separate because they answer different questions:
//   "does the user want the sidebar narrow?" vs "is the user looking at
//   the sidebar right now on a small screen?".
let _sidebarToggleBtn = null;
let _sidebarEl = null;
let _sidebarBackdropEl = null;
let _sidebarCollapsed = false;
let _sidebarOpenMobile = false;
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'appShell:sidebarCollapsed';
const SIDEBAR_COLLAPSE_BREAKPOINT = 768;
let _onSidebarDocClick = null;
let _onSidebarKeydown = null;
let _onResize = null;

// Notification bell — one instance per header variant (admin + citizen),
// mirroring the _userMenus pattern below. Both sets of bell markup are
// always in the DOM (only one visible per role, via CSS), so both get
// wired unconditionally; only the visible one is ever actually clicked.
// Only the EventSource connection is torn down and re-established on
// auth change (new session → new stream) — the panels themselves stay
// wired for the shell's lifetime.
let _bellPanels = [];
let _notifStream = null;

/**
 * Classify a user object into one of the three shell role buckets.
 * Public for tests + future role-guard helpers.
 *
 * Operational roles (admin_sistema, admin_organizacion, operador_sistema,
 * operador_organizacion, publicador) share the back-office chrome and
 * therefore collapse into the `admin` bucket. `usuario` keeps the
 * citizen shell. Anything else — null/undefined user, malformed role,
 * future roles not yet listed in OPERATIONAL_ROLES — falls into `guest`
 * so an unrecognised role never silently inherits admin chrome.
 *
 * The bucket list is read from OPERATIONAL_ROLES in `utils/role.js`,
 * which is the single source of truth shared with tests and (in the
 * future) any role guard.
 */
export function classifyRole(user) {
  if (!user) return 'guest';
  const roleName = resolveRoleName(user);
  if (roleName === null) return 'guest';
  if (OPERATIONAL_ROLES.includes(roleName)) return 'admin';
  if (roleName === 'usuario') return 'citizen';
  return 'guest';
}

export const appShell = {
  template,
  style,

  async mount() {
    // Template is bundled at build time (Vite ?raw import) — no runtime
    // fetch, so the shell can never render before its markup is available.
    const html = template;
    if (!html.trim()) {
      throw new Error('appShell.mount: template body is empty');
    }
    const outlet = document.getElementById('shell-outlet');
    if (!outlet) {
      throw new Error('appShell.mount: #shell-outlet not found in DOM');
    }

    // SECURITY: parse with DOMParser instead of assigning to innerHTML.
    // DOMParser does not execute inline <script> tags, so even if the
    // template source were ever compromised the worst case is markup
    // injection, not script execution. The template is served from our
    // own static assets, but defense-in-depth matters.
    //
    // We append each parsed child one at a time rather than going through
    // a DocumentFragment + replaceChildren in a single call. The fragment
    // approach was observed to drop the parsed nodes in some browsers
    // (the adoption step across documents can fail silently when the
    // fragment's children come from the parsed HTML's document). The
    // explicit appendChild loop makes each adoption observable.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    outlet.replaceChildren();
    for (const node of Array.from(doc.body.childNodes)) {
      outlet.appendChild(node);
    }

    // Sanity check: the router downstream does
    // `document.querySelector('#page-outlet')` and throws
    // "Outlet not found" if it's missing. If the insert pipeline dropped
    // our nodes for any reason, fail loudly here with diagnostics so the
    // failure points at the right call site instead of confusingly
    // surfacing in the router.
    if (!outlet.querySelector('#page-outlet')) {
      throw new Error(
        `appShell.mount: #page-outlet not present after insert. ` +
          `template length=${html.length} bytes, outlet children=${outlet.children.length}`,
      );
    }
  },

  async init() {
    // Apply role attribute on <body> so CSS can toggle chrome regions.
    // SECURITY: fetch role fresh from /me — never trust cached user state.
    // FALLBACK to `auth.getUser()` only when `me()` returns null (e.g. the
    // tests in app-shell.test.js mock `getUser()` to inject a user without
    // setting up a /me fetch mock). In production `getUser()` is always
    // null, so the me() path is the only one that matters.
    let user = await auth.me().catch(() => null);
    if (!user) user = auth.getUser();
    document.body.dataset.role = classifyRole(user);

    await populateHeader();
    wireNav();
    wireSidebarToggle();
    wireBellPanels();
    // Refresh badges after wireBellPanels populates _bellPanels so the
    // initial badge count is set (populateHeader was called when _bellPanels
    // was still empty on first init).
    refreshBellBadges();

    // Render sidebar dynamically from /api/menus/my for ANY authenticated
    // user (admin OR citizen). Falls back silently if the endpoint fails
    // or the user is a guest. The target <ul> is picked from
    // body[data-role] inside renderSidebarMenu itself.
    if (document.body.dataset.role !== 'guest') {
      menuService.invalidateMyMenu();
      permissionService.invalidateMyPermissions();
      renderSidebarMenu().catch(() => {
        // No-op: empty sidebar is preferable to crashing the shell.
      });
      connectNotificationStream(user?.id);
    }

    // Re-apply role on every auth change (login / logout / role swap).
    _unsubAuth = auth.onAuthChange(async () => {
      let u = await auth.me().catch(() => null);
      if (!u) u = auth.getUser();
      document.body.dataset.role = classifyRole(u);
      // Clear cached menu + permission + notification state on every auth
      // transition so the next render reads a fresh /menus/my and the
      // bell badge reflects the new user's unread count rather than a
      // previous session's stale data. permissionService missing here
      // was a real bug: logging out of an admin_sistema session and into
      // a less-privileged one within the TTL window let permissionGuard
      // serve the PREVIOUS user's full permission set to the new user.
      menuService.invalidateMyMenu();
      permissionService.invalidateMyPermissions();
      await populateHeader();
      disconnectNotificationStream();
      if (document.body.dataset.role !== 'guest') {
        await renderSidebarMenu().catch(() => {
          // No-op: empty sidebar is preferable to crashing the shell.
        });
        connectNotificationStream(u?.id);
      }
      // Re-apply sidebar collapsed state in case the role swap rebuilt
      // chrome (e.g. switching roles changes which sidebar is visible,
      // and we want the collapsed preference to remain consistent).
      applySidebarCollapsed();
    });

    return _unsubAuth;
  },

  destroy() {
    if (_unsubAuth) {
      _unsubAuth();
      _unsubAuth = null;
    }
    // T-1.11.12 + citizen parity: tear down every user-menu instance.
    // Each menu owns its own listeners + debounce timer, so calling
    // destroy() on every instance is enough to fully release resources.
    _userMenus.forEach((menu) => menu.destroy());
    _userMenus = [];

    // Sidebar toggle teardown — remove every listener we registered
    // and null the refs so a subsequent init() starts clean.
    teardownSidebarToggle();

    // Notification bell + SSE stream teardown.
    teardownBellPanels();
    disconnectNotificationStream();
  },

  outlet: '#page-outlet',

  /**
   * Toggle .active on every nav item whose data-route matches `path`.
   */
  updateActive(path) {
    document.querySelectorAll('.app-shell-nav-item').forEach((item) => {
      const isMatch = item.dataset.route === path;
      item.classList.toggle('active', isMatch);
    });
  },
};

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Wire the sidebar collapse/expand toggle.
 *
 * Desktop: clicking the button flips a persisted collapsed preference
 * and adds .app-shell--sidebar-collapsed to the root grid container.
 *
 * Mobile (<768px): clicking the button opens/closes an off-canvas
 * overlay. The collapsed preference is ignored on mobile because the
 * sidebar is already off-screen by default.
 *
 * Persistence: we use localStorage with try/catch so private-browsing
 * mode (where storage throws) degrades gracefully to in-memory only.
 */
function wireSidebarToggle() {
  const grid = document.querySelector('.app-shell');
  if (!grid) return;
  _sidebarEl = document.getElementById('app-shell-sidebar');
  _sidebarToggleBtn = document.getElementById('app-shell-sidebar-toggle');
  if (!_sidebarToggleBtn) return;

  // Restore persisted preference. If storage is unavailable (private
  // browsing) the catch keeps _sidebarCollapsed at its default false.
  try {
    _sidebarCollapsed =
      localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === '1';
  } catch (_e) {
    _sidebarCollapsed = false;
  }
  applySidebarCollapsed();

  _sidebarToggleBtn.addEventListener('click', () => {
    if (isMobileViewport()) {
      _sidebarOpenMobile = !_sidebarOpenMobile;
      applySidebarMobileOpen();
    } else {
      _sidebarCollapsed = !_sidebarCollapsed;
      try {
        localStorage.setItem(
          SIDEBAR_COLLAPSE_STORAGE_KEY,
          _sidebarCollapsed ? '1' : '0',
        );
      } catch (_e) {
        /* storage unavailable — preference stays in-memory only */
      }
      applySidebarCollapsed();
    }
  });

  // Backdrop click closes the mobile overlay.
  _onSidebarDocClick = (event) => {
    if (!_sidebarOpenMobile) return;
    const target = event.target;
    if (_sidebarBackdropEl && _sidebarBackdropEl.contains(target)) {
      _sidebarOpenMobile = false;
      applySidebarMobileOpen();
    }
  };
  document.addEventListener('click', _onSidebarDocClick, true);

  // Escape closes the mobile overlay.
  _onSidebarKeydown = (event) => {
    if (event.key === 'Escape' && _sidebarOpenMobile) {
      _sidebarOpenMobile = false;
      applySidebarMobileOpen();
    }
  };
  document.addEventListener('keydown', _onSidebarKeydown);

  // Re-sync state on viewport cross so a resize from mobile to desktop
  // (or vice versa) doesn't leave a half-applied class.
  _onResize = () => {
    if (isMobileViewport()) {
      // Moving to mobile: drop the desktop collapsed class but keep the
      // stored preference for the next desktop session.
      grid.classList.remove('app-shell--sidebar-collapsed');
      // Close the mobile overlay on resize to avoid stale state.
      if (_sidebarOpenMobile) {
        _sidebarOpenMobile = false;
        applySidebarMobileOpen();
      }
    } else {
      // Moving to desktop: re-apply the persisted preference and
      // force-close the mobile overlay state.
      _sidebarOpenMobile = false;
      applySidebarMobileOpen();
      applySidebarCollapsed();
    }
  };
  window.addEventListener('resize', _onResize);
}

/**
 * Apply or remove the desktop collapsed class based on `_sidebarCollapsed`.
 * Also flips the toggle button's aria-expanded + title to match.
 */
function applySidebarCollapsed() {
  const grid = document.querySelector('.app-shell');
  if (!grid) return;
  grid.classList.toggle('app-shell--sidebar-collapsed', _sidebarCollapsed);
  if (_sidebarToggleBtn) {
    _sidebarToggleBtn.setAttribute(
      'aria-expanded',
      _sidebarCollapsed ? 'false' : 'true',
    );
    _sidebarToggleBtn.setAttribute(
      'title',
      _sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral',
    );
  }
}

/**
 * Apply the mobile off-canvas overlay state. Lazily creates the backdrop
 * element the first time we need it so the DOM stays clean for desktop
 * users who never trigger the mobile path.
 */
function applySidebarMobileOpen() {
  if (!_sidebarEl) return;
  _sidebarEl.classList.toggle('is-open', _sidebarOpenMobile);
  if (_sidebarToggleBtn) {
    _sidebarToggleBtn.setAttribute(
      'aria-expanded',
      _sidebarOpenMobile ? 'true' : 'false',
    );
  }
  if (_sidebarOpenMobile) {
    if (!_sidebarBackdropEl) {
      _sidebarBackdropEl = document.createElement('div');
      _sidebarBackdropEl.className = 'app-shell-sidebar-backdrop';
      document.body.appendChild(_sidebarBackdropEl);
    }
    _sidebarBackdropEl.classList.add('is-open');
  } else if (_sidebarBackdropEl) {
    _sidebarBackdropEl.classList.remove('is-open');
  }
}

/**
 * Cheap viewport check. matchMedia is the only reliable way to mirror
 * the CSS breakpoint without coupling to specific browser APIs.
 */
function isMobileViewport() {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(
    `(max-width: ${SIDEBAR_COLLAPSE_BREAKPOINT - 0.02}px)`,
  ).matches;
}

/**
 * Remove every sidebar-toggle listener + DOM helper. Called from
 * destroy() so the shell can be torn down without leaving dangling
 * handlers.
 */
function teardownSidebarToggle() {
  if (_sidebarToggleBtn) {
    // The click listener is anonymous, so we can't remove it directly.
    // Replacing the node with a clone strips all listeners attached
    // via addEventListener — a safe tear-down for a node we own.
    const clone = _sidebarToggleBtn.cloneNode(true);
    _sidebarToggleBtn.parentNode.replaceChild(clone, _sidebarToggleBtn);
    _sidebarToggleBtn = clone;
  }
  if (_onSidebarDocClick) {
    document.removeEventListener('click', _onSidebarDocClick, true);
    _onSidebarDocClick = null;
  }
  if (_onSidebarKeydown) {
    document.removeEventListener('keydown', _onSidebarKeydown);
    _onSidebarKeydown = null;
  }
  if (_onResize) {
    window.removeEventListener('resize', _onResize);
    _onResize = null;
  }
  if (_sidebarBackdropEl && _sidebarBackdropEl.parentNode) {
    _sidebarBackdropEl.parentNode.removeChild(_sidebarBackdropEl);
  }
  _sidebarBackdropEl = null;
  _sidebarEl = null;
  _sidebarOpenMobile = false;
}

/**
 * Render the role-specific sidebar from /api/menus/my. Universal across
 * every authenticated role (admin OR citizen); the guest role is excluded
 * upstream and never reaches this function.
 *
 * Target <ul> selection (mirrors production ids in app-shell.component.html):
 *   - admin    → #app-shell-admin-menu-list
 *   - citizen  → #app-shell-citizen-menu-list
 *
 * Falls back silently if the endpoint fails or the target <ul> is
 * missing (e.g. tests that mount without the full chrome). Empty
 * payload leaves the <ul> empty — no error, no leftover items.
 */
async function renderSidebarMenu() {
  const listEl = pickSidebarTarget();
  if (!listEl) return;

  const tree = await menuService.getMyMenu();
  if (!Array.isArray(tree) || tree.length === 0) {
    listEl.replaceChildren();
    return;
  }

  const nodes = [];
  for (const item of tree) {
    if (item.children && item.children.length > 0) {
      nodes.push(buildSectionHeader(item.name));
      for (const child of item.children) {
        if (child.route) nodes.push(buildLeafLink(child));
      }
    } else if (item.route) {
      nodes.push(buildLeafLink(item));
    }
  }

  listEl.replaceChildren(...nodes);
}

/**
 * Resolve the target <ul> for the sidebar renderer based on the role
 * attribute applied to <body>. Returns null when the role is unknown
 * or the target element is absent (test fixtures, partial mounts).
 */
function pickSidebarTarget() {
  const role = document.body.dataset.role;
  if (role === 'admin') {
    return document.getElementById('app-shell-admin-menu-list');
  }
  if (role === 'citizen') {
    return document.getElementById('app-shell-citizen-menu-list');
  }
  return null;
}

function buildSectionHeader(name) {
  const li = document.createElement('li');
  li.className = 'app-shell-section';
  const span = document.createElement('span');
  span.textContent = String(name ?? '').toUpperCase();
  li.appendChild(span);
  return li;
}

function buildLeafLink(item) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = `#${item.route}`;
  a.className = 'app-shell-nav-item';
  a.dataset.route = item.route;

  if (item.icon) {
    const i = document.createElement('i');
    // R1.3: one-way contract — backend ships bare FA name;
    // renderer prepends prefix exactly once. Do not add defensive
    // startsWith('fa-') checks.
    i.className = `fa-solid fa-${item.icon}`;
    a.appendChild(i);
  }

  const label = document.createElement('span');
  label.textContent = item.name ?? '';
  a.appendChild(label);

  li.appendChild(a);
  return li;
}

async function populateHeader() {
  const u = await auth.me().catch(() => null);
  if (!u) return;
  const role = classifyRole(u);

  if (role === 'admin') {
    const nameEl = document.getElementById('app-shell-user-name');
    const avatarEl = document.getElementById('app-shell-user-avatar');
    if (nameEl) {
      nameEl.textContent =
        `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
        u.email ||
        'Usuario';
    }
    if (avatarEl) {
      renderAvatar(avatarEl, u, 'admin');
    }

    refreshBellBadges();

    return;
  }

  if (role === 'citizen') {
    const avatarEl = document.getElementById('app-shell-avatar');
    if (avatarEl) {
      renderAvatar(avatarEl, u, 'citizen');
    }

    refreshBellBadges();
  }
}

/**
 * Render an <img> avatar inside avatarEl — the user's photo when
 * available, otherwise the default avatar image.
 *
 * @param {Element} avatarEl  - the span element to populate
 * @param {object}  u        - the user object
 * @param {string}  role     - 'admin' | 'citizen'
 */
function renderAvatar(avatarEl, u, _role) {
  // Try profile_image_path first, then legacy avatar object
  const rawKey = u.profile_image_path ?? null;
  const src = resolveAvatarSrc(rawKey || u.avatar);
  avatarEl.innerHTML = `<img src="${src}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
}

/**
 * Refresh every wired bell panel's unread badge. Called on every
 * populateHeader() (init + auth change) and again in real time by
 * connectNotificationStream() when the SSE connection is alive.
 */
function refreshBellBadges() {
  _bellPanels.forEach((bell) => bell.updateBadge());
}

/**
 * Wire up dynamic navigation actions:
 *   - The admin user-menu trigger: opens a WAI-ARIA menu-button dropdown
 *     with "Mi perfil" (navigate) and "Cerrar sesión" (await auth.logout()
 *     then redirect). Adds Escape-to-close, focus restoration, outside-click
 *     close, and a 300 ms debounce on logout to mitigate the async race
 *     documented in proposal R2.
 *
 * Cleanup note: the citizen "+" plus button click handler used to live
 * here, but the "+" is now synthesized by renderBottomNavMenu() (so it
 * lands in the centered slot 2/3 between Feed and Perfil) and its
 * wiring is attached right after synthesis inside the renderer. The
 * two lifecycles now match — re-rendering on auth change yields a
 * fresh element with a fresh handler.
 */
function wireNav() {
  // T-1.11.6 + citizen parity: wire both user-menu instances (admin +
  // citizen) through the shared factory. We push every successfully
  // initialised menu into _userMenus so destroy() can tear them all
  // down with one loop.
  const menus = [
    {
      triggerId: 'app-shell-user-menu-trigger',
      panelId: 'app-shell-user-menu-panel',
      profileItemId: 'app-shell-user-menu-profile',
      logoutItemId: 'app-shell-user-menu-logout',
    },
    {
      triggerId: 'app-shell-citizen-menu-trigger',
      panelId: 'app-shell-citizen-menu-panel',
      profileItemId: 'app-shell-citizen-menu-profile',
      logoutItemId: 'app-shell-citizen-menu-logout',
    },
  ];
  menus.forEach((config) => {
    const menu = createUserMenu(config);
    if (menu) {
      menu.init();
      _userMenus.push(menu);
    }
  });
}

/**
 * Build a WAI-ARIA menu-button instance bound to the given DOM ids.
 *
 * Returns `{ init, destroy }` so the caller can manage lifecycle.
 * `init()` wires the click trigger, item clicks, outside-click close,
 * and Escape-to-close. `destroy()` reverses every listener and clears
 * the debounce timer so the instance can be safely garbage-collected
 * after the shell is torn down.
 *
 * Item semantics:
 *   - "Mi perfil" — navigate to /configuracion/perfil
 *     and close the panel.
 *   - "Cerrar sesión" — set aria-disabled + pointer-events for a 300 ms
 *     debounce window (proposal R2 race mitigation), await auth.logout(),
 *     then redirect to '#/login'. A second click during the debounce
 *     window is a no-op.
 */
function createUserMenu({ triggerId, panelId, profileItemId, logoutItemId }) {
  const trigger = document.getElementById(triggerId);
  const panel = document.getElementById(panelId);
  if (!trigger || !panel) return null;

  const profileItem = profileItemId
    ? document.getElementById(profileItemId)
    : null;
  const logoutItem = logoutItemId
    ? document.getElementById(logoutItemId)
    : null;
  const items = panel.querySelectorAll('[role="menuitem"]');

  let isOpen = false;
  let onDocClick = null;
  let onKeydown = null;
  let logoutDebounceTimer = null;
  const itemClickListeners = new WeakMap();
  const itemKeydownListeners = new WeakMap();

  function showPanel() {
    isOpen = true;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (items[0]) items[0].focus();
  }

  function hidePanel() {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }

  function toggle() {
    if (isOpen) hidePanel();
    else showPanel();
  }

  async function handleItem(item) {
    if (!item) return;
    if (item === profileItem) {
      router.navigate('/configuracion/perfil');
      hidePanel();
      return;
    }
    if (item === logoutItem) {
      // Debounce guard — second click during the 300ms window is a no-op.
      if (item.getAttribute('aria-disabled') === 'true') return;
      item.setAttribute('aria-disabled', 'true');
      item.style.pointerEvents = 'none';
      if (logoutDebounceTimer) clearTimeout(logoutDebounceTimer);
      logoutDebounceTimer = setTimeout(() => {
        item.setAttribute('aria-disabled', 'false');
        item.style.pointerEvents = '';
        logoutDebounceTimer = null;
      }, 300);
      await auth.logout();
      router.navigate('/login');
      hidePanel();
    }
  }

  function init() {
    trigger.addEventListener('click', toggle);
    items.forEach((item) => {
      const clickListener = () => handleItem(item);
      const keydownListener = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleItem(item);
        }
      };
      item.addEventListener('click', clickListener);
      item.addEventListener('keydown', keydownListener);
      itemClickListeners.set(item, clickListener);
      itemKeydownListeners.set(item, keydownListener);
    });

    // Capture-phase so the panel closes even when the click target is
    // nested inside another click-handler (e.g. router nav links).
    //
    // We also bail out if the click is inside ANY .app-shell-user-menu
    // wrapper, not just our own. Without this guard, opening the admin
    // menu would close the citizen menu (and vice versa) because each
    // menu's outside-click handler treats the other menu's trigger as
    // "outside" its own subtree. The `closest('.app-shell-user-menu')`
    // check is cheap and lets the menu that actually owns the click
    // decide what to do.
    onDocClick = (event) => {
      if (!isOpen) return;
      if (event.target.closest('.app-shell-user-menu')) return;
      hidePanel();
    };
    document.addEventListener('click', onDocClick, true);

    onKeydown = (event) => {
      if (event.key === 'Escape' && isOpen) hidePanel();
    };
    document.addEventListener('keydown', onKeydown);
  }

  function destroy() {
    hidePanel();
    if (onDocClick) {
      document.removeEventListener('click', onDocClick, true);
      onDocClick = null;
    }
    if (onKeydown) {
      document.removeEventListener('keydown', onKeydown);
      onKeydown = null;
    }
    if (logoutDebounceTimer) {
      clearTimeout(logoutDebounceTimer);
      logoutDebounceTimer = null;
    }
    if (trigger) trigger.removeEventListener('click', toggle);
    items.forEach((item) => {
      const clickListener = itemClickListeners.get(item);
      const keydownListener = itemKeydownListeners.get(item);
      if (clickListener) item.removeEventListener('click', clickListener);
      if (keydownListener) item.removeEventListener('keydown', keydownListener);
      itemClickListeners.delete(item);
      itemKeydownListeners.delete(item);
    });
  }

  return { init, destroy };
}

/**
 * T-3.3/3.4 + admin parity: notification bell — dropdown of the latest
 * notifications. One instance per header variant (admin anchored to
 * #app-shell-bell-admin, citizen to #app-shell-bell); both are wired
 * unconditionally since both sets of markup are always in the DOM (only
 * one visible per role, via CSS) — same pattern as createUserMenu above.
 *
 * `detailRoute` differs per instance: admin incidents live at
 * `/incidencias/:id`, citizens only have `/feed/:id`.
 */
function wireBellPanels() {
  const configs = [
    {
      btnId: 'app-shell-bell-admin',
      panelId: 'app-shell-bell-panel-admin',
      listId: 'app-shell-bell-list-admin',
      badgeId: 'app-shell-bell-badge-admin',
      markAllId: 'app-shell-bell-markall-admin',
      detailRoute: '/incidencias',
    },
    {
      btnId: 'app-shell-bell',
      panelId: 'app-shell-bell-panel',
      listId: 'app-shell-bell-list',
      badgeId: 'app-shell-bell-badge',
      markAllId: 'app-shell-bell-markall',
      detailRoute: '/feed',
    },
  ];
  configs.forEach((config) => {
    const bell = createBellPanel(config);
    if (bell) {
      bell.init();
      _bellPanels.push(bell);
    }
  });
}

function teardownBellPanels() {
  _bellPanels.forEach((bell) => bell.destroy());
  _bellPanels = [];
}

/**
 * Build a single bell-panel instance bound to the given DOM ids.
 * Returns `{ init, destroy, updateBadge, prependIfOpen }` — the last two
 * are called from outside (refreshBellBadges / the SSE handler) since a
 * live notification event or an auth-change badge refresh needs to reach
 * whichever instance(s) exist regardless of which one is visible.
 *
 * No-op (returns null) if the bell/panel/list markup isn't present in
 * the DOM (e.g. shell test fixtures that mount a trimmed-down header).
 */
function createBellPanel({
  btnId,
  panelId,
  listId,
  badgeId,
  markAllId,
  detailRoute,
}) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  const list = document.getElementById(listId);
  if (!btn || !panel || !list) return null;

  const badge = badgeId ? document.getElementById(badgeId) : null;
  const markAllBtn = markAllId ? document.getElementById(markAllId) : null;

  let isOpen = false;
  let onDocClick = null;
  let onKeydown = null;

  function buildEmptyState() {
    const li = document.createElement('li');
    li.className = 'app-shell-bell-panel__empty';
    // Derive the id from the parent list's id (citizen `app-shell-bell-list`
    // → `app-shell-bell-empty`; admin `app-shell-bell-list-admin` →
    // `app-shell-bell-empty-admin`) so tests and integration scripts can
    // target the dynamically-rendered empty state by id, mirroring the
    // static template markup (#app-shell-bell-empty on the citizen list).
    li.id = list.id.replace('-list', '-empty');
    li.textContent = 'Sin notificaciones';
    return li;
  }

  /**
   * Map a NotificationType enum value to a (icon, color) pair that
   * matches the FreeDash template's colored btn-circle pattern.
   *
   * NotificationType: claim | assignment | status_change | assigned |
   *                   comment | legacy
   */
  const _NOTIF_META = {
    claim: { icon: 'fa-flag', color: 'btn-danger' },
    assignment: { icon: 'fa-user-plus', color: 'btn-info' },
    assigned: { icon: 'fa-user-check', color: 'btn-info' },
    status_change: { icon: 'fa-exchange-alt', color: 'btn-success' },
    comment: { icon: 'fa-comment', color: 'btn-primary' },
    legacy: { icon: 'fa-bell', color: 'btn-secondary' },
  };
  function notifIconMeta(type) {
    return _NOTIF_META[type] || _NOTIF_META.legacy;
  }

  /**
   * Build a single notification <li>. Clicking it marks the notification
   * as read (if unread) and redirects to this instance's detail route.
   *
   * Layout follows the FreeDash "ui-notification.html" pattern: a colored
   * icon circle on the left, then a vertical stack with the message
   * (h6), the linked incident title, and the relative time.
   */
  function buildItem(notif) {
    const li = document.createElement('li');
    li.className = `message-item app-shell-bell-panel__item d-flex align-items-center border-bottom px-3 py-2${notif.read ? '' : ' app-shell-bell-panel__item--unread'}`;
    li.dataset.id = String(notif.id);

    const meta = notifIconMeta(notif.type);

    const iconWrap = document.createElement('span');
    iconWrap.className = `btn ${meta.color} rounded-circle btn-circle d-flex align-items-center justify-content-center flex-shrink-0`;
    iconWrap.style.width = '38px';
    iconWrap.style.height = '38px';
    iconWrap.innerHTML = `<i class="fa-solid ${meta.icon} text-white" aria-hidden="true"></i>`;
    li.appendChild(iconWrap);

    const body = document.createElement('div');
    body.className = 'w-75 d-inline-block v-middle ps-2';

    const title = document.createElement('h6');
    title.className = 'app-shell-bell-panel__title mb-0 mt-1';
    title.textContent = notif.message ?? '';
    body.appendChild(title);

    const sub = document.createElement('span');
    sub.className = 'font-12 text-nowrap d-block text-muted text-truncate';
    sub.textContent = notif.incident?.title ?? notif.data?.title ?? '';
    body.appendChild(sub);

    const time = document.createElement('span');
    time.className = 'font-12 text-nowrap d-block text-muted';
    time.textContent = timeAgo(notif.created_at);
    body.appendChild(time);

    li.appendChild(body);

    li.addEventListener('click', async () => {
      closePanel();
      if (!notif.read) {
        try {
          await notificationService.markRead(notif.id);
        } catch {
          // Non-fatal — still navigate even if marking as read failed.
        }
        // Refresh every wired bell, not just this one — the citizen bell
        // also exists in the DOM (hidden by role CSS) and its badge would
        // otherwise go stale until the next SSE event.
        refreshBellBadges();
      }
      if (notif.incident?.id) {
        router.navigate(`${detailRoute}/${notif.incident.id}`);
      }
    });

    return li;
  }

  function renderItems(items) {
    if (!items || items.length === 0) {
      list.replaceChildren(buildEmptyState());
      return;
    }
    list.replaceChildren(...items.map(buildItem));
  }

  async function openPanel() {
    isOpen = true;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');

    try {
      const { data } = await notificationService.list({ page: 1, perPage: 8 });
      renderItems(data);
    } catch {
      renderItems([]);
    }
  }

  function closePanel() {
    isOpen = false;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  async function onTriggerClick(event) {
    event.stopPropagation();
    if (isOpen) {
      closePanel();
      return;
    }
    await openPanel();
  }

  function updateBadge() {
    if (!badge) return;
    notificationService
      .unreadCount()
      .then((count) => {
        if (count > 0) {
          badge.textContent = String(count > 99 ? '99+' : count);
          badge.classList.remove('d-none');
        } else {
          badge.classList.add('d-none');
        }
      })
      .catch(() => {
        // silent fail — badge stays as-is
      });
  }

  /** Called by the SSE handler on a live notification event. */
  function prependIfOpen(notif) {
    updateBadge();
    if (isOpen) {
      list.querySelector('.app-shell-bell-panel__empty')?.remove();
      list.prepend(buildItem(notif));
    }
  }

  async function onMarkAllClick(event) {
    event.stopPropagation();
    try {
      await notificationService.markAllRead();
    } catch {
      return; // non-fatal — badge/list just stay as they were
    }
    refreshBellBadges();
    list
      .querySelectorAll('.app-shell-bell-panel__item--unread')
      .forEach((li) =>
        li.classList.remove('app-shell-bell-panel__item--unread'),
      );
  }

  function init() {
    btn.addEventListener('click', onTriggerClick);
    markAllBtn?.addEventListener('click', onMarkAllClick);

    onDocClick = (event) => {
      if (!isOpen) return;
      if (event.target.closest('.app-shell-bell-wrapper')) return;
      closePanel();
    };
    document.addEventListener('click', onDocClick, true);

    onKeydown = (event) => {
      if (event.key === 'Escape' && isOpen) closePanel();
    };
    document.addEventListener('keydown', onKeydown);
  }

  function destroy() {
    btn.removeEventListener('click', onTriggerClick);
    markAllBtn?.removeEventListener('click', onMarkAllClick);
    if (onDocClick) {
      document.removeEventListener('click', onDocClick, true);
      onDocClick = null;
    }
    if (onKeydown) {
      document.removeEventListener('keydown', onKeydown);
      onKeydown = null;
    }
    closePanel();
  }

  return { init, destroy, updateBadge, prependIfOpen };
}

/**
 * Establish the SSE connection to the backend's native stream for
 * real-time bell updates.
 *
 * Replaces the previous Mercure hub integration: the backend now
 * serves a text/event-stream at `/api/notifications/stream` directly
 * (Laravel Octane/Swoole holding the connection; Redis Pub/Sub
 * forwarding live events). Auth travels as the httpOnly
 * `access_token` cookie set at login, which the JWT middleware
 * accepts as a fallback because native EventSource cannot set
 * custom request headers. `withCredentials: true` is required so
 * the cookie reaches the backend's origin.
 *
 * The user scoping happens server-side: the controller derives the
 * Redis Pub/Sub channel from `$request->user()->id`, so we no
 * longer need a per-user topic URL on the client.
 */
function connectNotificationStream(userId) {
  if (typeof window.EventSource !== 'function' || !userId) {
    // SSE unsupported in this browser/environment, or no user to scope
    // to — skip silently.
    return;
  }

  try {
    _notifStream = new EventSource('/api/notifications/stream', {
      withCredentials: true,
    });

    const handleNotification = (event) => {
      if (!event.data) return;
      let notif;
      try {
        notif = JSON.parse(event.data);
      } catch {
        return; // malformed payload — ignore rather than crash the shell
      }
      _bellPanels.forEach((bell) => bell.prependIfOpen(notif));
    };

    _notifStream.addEventListener('notification', handleNotification);
    _notifStream.onmessage = handleNotification;

    _notifStream.onerror = () => {
      // EventSource.onerror fires for both transient blips (where the
      // browser auto-reconnects, readyState === CONNECTING) and fatal
      // closures (readyState === CLOSED, no more retries). SSE's killer
      // feature vs. WebSocket is the auto-reconnect — we must only tear
      // down on the fatal case, otherwise a single network hiccup kills
      // the stream until the next page load.
      if (_notifStream && _notifStream.readyState === EventSource.CLOSED) {
        disconnectNotificationStream();
      }
    };
  } catch {
    // Constructing EventSource itself threw — never let this take down
    // shell init.
    _notifStream = null;
  }
}

function disconnectNotificationStream() {
  if (_notifStream) {
    _notifStream.close();
    _notifStream = null;
  }
}
