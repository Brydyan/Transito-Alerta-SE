/**
 * Layout helpers shared across the admin, user, and app shells.
 *
 * Three exports, each with a single responsibility:
 *
 *   - initShell()  : wires persistent shell UI (sidebar toggle, overlay).
 *                    Called once per shell, on first mount.
 *   - initPage()   : wires per-route Bootstrap widgets (tooltips, popovers).
 *                    Called on every route change inside the shell.
 *   - setupShell() : convenience that runs both, in the canonical order.
 *                    Useful for shells that don't separate mount/init from
 *                    page rendering (e.g. future QA harnesses or the
 *                    appShell drop-in test fixtures). Kept additive — every
 *                    existing call site still calls initShell/initPage
 *                    directly.
 *
 * initLayout() is retained as a backwards-compat alias of setupShell().
 */

export function initShell() {
  // The admin shell template attaches `.layout-hidden` (see
  // `app/layout/layout.component.css`) to `#main-wrapper` to keep the
  // shell invisible until the JS layer has wired all the event
  // listeners. Now that we know we're initializing, remove the class.
  const mainWrapper = document.getElementById('main-wrapper');
  if (mainWrapper) mainWrapper.classList.remove('layout-hidden');

  const pageWrapper = document.querySelector('.page-wrapper');
  if (pageWrapper) pageWrapper.style.display = 'block';

  const navToggler = document.querySelector('.nav-toggler');
  if (navToggler) {
    navToggler.addEventListener('click', () => {
      mainWrapper?.classList.toggle('show-sidebar');
      const icon = navToggler.querySelector('i');
      if (icon) {
        icon.classList.toggle('ti-menu');
        icon.classList.toggle('ti-close');
      }
    });
  }

  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      mainWrapper?.classList.remove('show-sidebar');
    });
  }
}

export function initPage() {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    if (typeof bootstrap !== 'undefined') {
      bootstrap.Tooltip.getInstance(el)?.dispose();
      new bootstrap.Tooltip(el);
    }
  });

  document.querySelectorAll('[data-bs-toggle="popover"]').forEach((el) => {
    if (typeof bootstrap !== 'undefined') {
      bootstrap.Popover.getInstance(el)?.dispose();
      new bootstrap.Popover(el);
    }
  });
}

/**
 * PR #2 (consolidar-layout-unico): one-shot helper that runs both phases
 * of shell setup in the order they need to run. Equivalent to the old
 * initLayout() but with an explicit, documented contract.
 *
 * Existing callers (and unit tests) keep working — they import the named
 * functions directly. This helper is additive so PR #3 can adopt it for
 * the new appShell without disturbing the legacy call sites.
 */
export function setupShell() {
  initShell();
  initPage();
}

/** Backwards-compat alias — kept so any code that still imports it works. */
export function initLayout() {
  initShell();
  initPage();
}
