import { permissionService } from './permission.service.js';

/**
 * kebab-actions — Shared kebab dropdown renderer for CRUD index rows.
 *
 * Replaces the per-row <table-actions> custom element. Produces the same
 * Bootstrap-styled markup (Ver button + kebab dropdown with Editar /
 * Eliminar items) but inlined, so the page can delegate one click listener
 * instead of mounting 50+ components.
 *
 * Markup contract:
 *   - <a data-action="view">     — Ver button (always, unless showView=false)
 *   - <li data-action="edit">    — Editar item
 *   - <li data-action="delete">  — Eliminar item
 *
 * Each action element carries data-id and data-titulo, so a delegated click
 * listener can dispatch by action without per-row bookkeeping.
 *
 * @param {{ id: string|number, titulo: string, perms: Set<string>,
 *   slugs: { update: string, delete: string }, showView?: boolean }} ctx
 * @returns {string} HTML to inject into a <table-actions> placeholder
 */
export function renderKebabActions({
  id,
  titulo,
  perms,
  slugs,
  showView = false,
}) {
  const hasUpdate = perms.has(slugs.update);
  const hasDelete = perms.has(slugs.delete);
  const anyAction = hasUpdate || hasDelete;

  const safeId = String(id ?? '').replace(/"/g, '&quot;');
  const safeTitulo = String(titulo ?? '').replace(/"/g, '&quot;');

  const verBtn = showView
    ? `<a class="btn btn-sm btn-outline-primary btn-ver" href="#"
            data-action="view" data-id="${safeId}" data-titulo="${safeTitulo}"
            aria-label="Ver detalle" title="Ver detalle">
            <i class="fa-solid fa-eye" aria-hidden="true"></i>
         </a>`
    : '';

  const toggleAttrs = !anyAction
    ? ' disabled title="No tenés acciones disponibles"'
    : '';

  const editItem = hasUpdate
    ? `<li class="table-actions-edit-item" data-action="edit">
         <a class="dropdown-item table-actions-edit" href="#"
            data-action="edit" data-id="${safeId}" data-titulo="${safeTitulo}"
            aria-label="Editar">
            <i class="fa-solid fa-edit" aria-hidden="true"></i> Editar
         </a>
       </li>`
    : '';

  const deleteItem = hasDelete
    ? `<li class="table-actions-delete-item" data-action="delete">
         <a class="dropdown-item table-actions-delete text-danger" href="#"
            data-action="delete" data-id="${safeId}" data-titulo="${safeTitulo}"
            aria-label="Eliminar">
            <i class="fa-solid fa-trash-alt" aria-hidden="true"></i> Eliminar
         </a>
       </li>`
    : '';

  return `<div class="d-flex justify-content-center gap-1">
    ${verBtn}
    <div class="dropdown">
      <button class="btn btn-sm btn-outline-secondary dropdown-toggle"
              type="button" data-bs-toggle="dropdown" aria-expanded="false"
              aria-label="Acciones"${toggleAttrs}>
        <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
      </button>
      <ul class="dropdown-menu dropdown-menu-end">
        ${editItem}
        ${deleteItem}
      </ul>
    </div>
  </div>`;
}

/**
 * Finds every <table-actions> placeholder inside `container` and replaces
 * its innerHTML with a permission-filtered kebab. Pages keep emitting the
 * placeholder element from their buildRow/buildCard templates — this helper
 * turns those placeholders into the actual dropdown markup.
 *
 * @param {HTMLElement} container  tbody or cards container
 * @param {Array<{id, [name|title|titulo]}>} datos
 * @param {{ slugs: { update: string, delete: string }, showView?: boolean,
 *   itemTitle?: (item: object) => string }} ctx
 * @param {Set<string>} perms  the user's current permission set
 */
export function hydrateKebabPlaceholders(container, datos, ctx, perms) {
  if (!container) return;
  const placeholders = container.querySelectorAll('table-actions');
  if (!placeholders.length) return;

  const titleOf = ctx.itemTitle ?? ((item) => item.name);
  for (const placeholder of placeholders) {
    const rawId = placeholder.id;
    const id = rawId.replace(/^ta-(?:desktop|mobile|tree|flat)-/, '');
    const item = datos.find((d) => String(d.id) === id);
    if (!item) continue;
    placeholder.innerHTML = renderKebabActions({
      id: item.id,
      titulo: titleOf(item),
      perms,
      slugs: ctx.slugs,
      showView: ctx.showView,
    });
  }
}

/**
 * Convenience: fetches permissions once and hydrates all kebabs in
 * `container`. Returns an unsubscribe function for re-hydration on
 * permission invalidation.
 *
 * @param {HTMLElement} container
 * @param {Array<object>} datos
 * @param {{ slugs: object, showView?: boolean, itemTitle?: (item: object) => string }} ctx
 * @returns {Promise<() => void>} unsubscribe fn
 */
export async function hydrateKebabActions(container, datos, ctx) {
  let perms;
  try {
    perms = await permissionService.getMyPermissions();
  } catch {
    perms = new Set();
  }
  hydrateKebabPlaceholders(container, datos, ctx, perms);

  return permissionService.onInvalidate(async () => {
    let fresh;
    try {
      fresh = await permissionService.getMyPermissions();
    } catch {
      fresh = new Set();
    }
    hydrateKebabPlaceholders(container, datos, ctx, fresh);
  });
}
