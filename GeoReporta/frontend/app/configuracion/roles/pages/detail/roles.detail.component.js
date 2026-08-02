import { http } from '../../../../core/http.service.js';
import { router } from '../../../../core/router.js';
import { mostrarToast } from '../../../../utils/ui.js';

/**
 * Construye un checkbox accesible con label y descripción opcional.
 */
function buildCheckbox(perm, checked) {
  const wrap = document.createElement('div');
  wrap.className = 'form-check';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'form-check-input perm-check';
  input.id = `perm-${perm.id}`;
  input.dataset.id = String(perm.id);
  input.value = String(perm.id);
  input.checked = checked;
  wrap.appendChild(input);

  const label = document.createElement('label');
  label.className = 'form-check-label';
  label.htmlFor = input.id;

  const strong = document.createElement('strong');
  strong.textContent = `${perm.action}`;
  label.appendChild(strong);

  if (perm.name) {
    const sep = document.createTextNode(' · ');
    label.appendChild(sep);
    const span = document.createElement('span');
    span.className = 'text-muted';
    span.textContent = perm.name;
    label.appendChild(span);
  }

  wrap.appendChild(label);

  if (perm.description) {
    const desc = document.createElement('div');
    desc.className = 'text-muted small ms-4';
    desc.textContent = perm.description;
    wrap.appendChild(desc);
  }

  return wrap;
}

/**
 * Construye un acordeón colapsable por resource.
 */
function buildResourceGroup(group, assignedIds) {
  const wrap = document.createElement('div');
  wrap.className = 'mb-2 border rounded';

  const headerBtn = document.createElement('button');
  headerBtn.type = 'button';
  headerBtn.className =
    'btn btn-light w-100 d-flex justify-content-between align-items-center';
  headerBtn.setAttribute('data-bs-toggle', 'collapse');
  headerBtn.setAttribute('data-bs-target', `#grp-${group.resource}`);
  headerBtn.setAttribute('aria-expanded', 'true');

  const left = document.createElement('span');
  left.className = 'fw-semibold text-capitalize';
  left.textContent = group.resource;
  headerBtn.appendChild(left);

  const count = group.permissions.filter((p) => assignedIds.has(p.id)).length;
  const right = document.createElement('span');
  right.className = 'badge bg-secondary';
  right.textContent = `${count} / ${group.permissions.length}`;
  headerBtn.appendChild(right);

  wrap.appendChild(headerBtn);

  const collapse = document.createElement('div');
  collapse.className = 'collapse show';
  collapse.id = `grp-${group.resource}`;

  const body = document.createElement('div');
  body.className = 'p-3 border-top';

  group.permissions.forEach((perm) => {
    body.appendChild(buildCheckbox(perm, assignedIds.has(perm.id)));
  });

  collapse.appendChild(body);
  wrap.appendChild(collapse);

  return wrap;
}

export default {
  template: `
    <div class="container-fluid py-4">
      <nav aria-label="breadcrumb" class="mb-3">
        <a href="#/roles" class="text-decoration-none">
          <i class="fa-solid fa-arrow-left me-1"></i> Roles
        </a>
      </nav>

      <div id="estado-cargando" class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-2 mb-0">Cargando rol…</p>
      </div>

      <div id="estado-error" class="alert alert-danger d-none" role="alert">
        <i class="fa-solid fa-triangle-exclamation me-2"></i>
        <span id="error-texto">No se pudo cargar el rol.</span>
        <a href="#/roles" class="btn btn-sm btn-outline-danger ms-2">Volver</a>
      </div>

      <div id="contenido" class="d-none">
        <div class="card mb-4">
          <div class="card-body">
            <h5 class="card-title mb-3">Datos del rol</h5>
            <div class="row g-2 align-items-end">
              <div class="col-md-8">
                <label for="rol-nombre" class="form-label small mb-1">Nombre</label>
                <input
                  id="rol-nombre"
                  type="text"
                  class="form-control"
                  autocomplete="off"
                />
              </div>
              <div class="col-md-4 d-flex gap-2">
                <button
                  id="btn-guardar-nombre"
                  type="button"
                  class="btn btn-primary"
                >
                  <i class="fa-solid fa-save me-1"></i> Guardar nombre
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div
            class="card-header d-flex justify-content-between align-items-center"
          >
            <h5 class="mb-0">Permisos asignados</h5>
            <small class="text-muted">
              <span id="contador-seleccionados">0</span> seleccionados
            </small>
          </div>
          <div class="card-body">
            <div id="permisos-grupos"></div>
            <div class="d-flex justify-content-end mt-3">
              <button
                id="btn-guardar-permisos"
                type="button"
                class="btn btn-primary"
              >
                <i class="fa-solid fa-save me-1"></i> Guardar permisos
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      id="toast-msg"
      class="toast align-items-center text-white border-0 position-fixed bottom-0 end-0 m-4"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div class="d-flex">
        <div class="toast-body" id="toast-msg-texto"></div>
        <button
          type="button"
          class="btn-close btn-close-white me-2 m-auto"
          data-bs-dismiss="toast"
          aria-label="Cerrar"
        ></button>
      </div>
    </div>
  `,
  async onInit({ params, query } = {}) {
    const id = params?.id;
    const isCreateMode = id === 'create' || id === 'crear';
    const isViewMode = query?.get('view') === 'true';

    if (!id) {
      router.navigate('/roles');
      return;
    }

    function mostrarError(msg) {
      document.getElementById('estado-cargando').classList.add('d-none');
      document.getElementById('error-texto').textContent = msg;
      document.getElementById('estado-error').classList.remove('d-none');
    }

    // ─── Create mode ─────────────────────────────────────────────────────
    if (isCreateMode) {
      document.getElementById('estado-cargando').classList.add('d-none');
      document.getElementById('contenido').classList.remove('d-none');
      document.getElementById('btn-guardar-nombre').textContent = 'Crear rol';
      document.getElementById('btn-guardar-nombre').innerHTML =
        '<i class="fa-solid fa-plus me-1"></i> Crear rol';

      document.getElementById('btn-guardar-nombre').onclick = async () => {
        const nombre = document.getElementById('rol-nombre').value.trim();
        if (!nombre) {
          mostrarToast(
            'El nombre es obligatorio.',
            'danger',
            'position-fixed bottom-0 end-0 m-4',
          );
          return;
        }
        try {
          const resp = await http.post('/roles', { name: nombre });
          const newRole = resp.data ?? resp;
          const newId = newRole.id;
          mostrarToast(
            'Rol creado. Ahora puede asignar permisos.',
            'success',
            'position-fixed bottom-0 end-0 m-4',
          );
          // Redirect to edit mode for the new role
          setTimeout(() => router.navigate(`/roles/${newId}`), 600);
        } catch {
          mostrarToast(
            'No se pudo crear el rol.',
            'danger',
            'position-fixed bottom-0 end-0 m-4',
          );
        }
      };

      // Hide permissions section until role is created
      const permisosCard = document.querySelector(
        '#contenido .card:last-child',
      );
      if (permisosCard) permisosCard.style.display = 'none';
      document.getElementById('btn-guardar-permisos').style.display = 'none';
      return;
    }

    // ─── View / Edit mode ────────────────────────────────────────────────

    async function cargarRol() {
      try {
        const rol = await http.get(`/roles/${id}`);

        const data = rol.data ?? rol;
        const permisosAsignados = new Set(
          (data.permissions ?? []).map((p) => p.id),
        );
        const grupos = data.available_permissions ?? [];

        document.getElementById('rol-nombre').value = data.name ?? '';

        const gruposEl = document.getElementById('permisos-grupos');
        gruposEl.replaceChildren(
          ...grupos.map((g) => buildResourceGroup(g, permisosAsignados)),
        );

        function updateContador() {
          const total = document.querySelectorAll('.perm-check:checked').length;
          document.getElementById('contador-seleccionados').textContent = total;
        }
        gruposEl.addEventListener('change', (e) => {
          if (e.target.classList.contains('perm-check')) updateContador();
        });
        updateContador();

        if (isViewMode) {
          document.querySelectorAll('.perm-check').forEach((cb) => {
            cb.disabled = true;
          });
        }

        document.getElementById('estado-cargando').classList.add('d-none');
        document.getElementById('contenido').classList.remove('d-none');
      } catch (err) {
        mostrarError(
          err.status === 404
            ? 'Rol no encontrado.'
            : 'No se pudo cargar el rol.',
        );
      }
    }

    document
      .getElementById('btn-guardar-nombre')
      .addEventListener('click', async () => {
        const nombre = document.getElementById('rol-nombre').value.trim();
        if (!nombre) {
          mostrarToast(
            'El nombre es obligatorio.',
            'danger',
            'position-fixed bottom-0 end-0 m-4',
          );
          return;
        }
        try {
          await http.put(`/roles/${id}`, { name: nombre });
          mostrarToast(
            'Nombre guardado.',
            'success',
            'position-fixed bottom-0 end-0 m-4',
          );
        } catch {
          mostrarToast(
            'No se pudo guardar el nombre.',
            'danger',
            'position-fixed bottom-0 end-0 m-4',
          );
        }
      });

    document
      .getElementById('btn-guardar-permisos')
      .addEventListener('click', async () => {
        const checks = document.querySelectorAll('.perm-check:checked');
        const permissionIds = Array.from(checks).map((c) =>
          Number(c.dataset.id),
        );
        try {
          await http.put(`/roles/${id}/permissions`, {
            permissions: permissionIds,
          });
          mostrarToast(
            'Permisos guardados.',
            'success',
            'position-fixed bottom-0 end-0 m-4',
          );
        } catch {
          mostrarToast(
            'No se pudieron guardar los permisos.',
            'danger',
            'position-fixed bottom-0 end-0 m-4',
          );
        }
      });

    // ─── View mode: disable inputs, hide save buttons ────────────────────
    if (isViewMode) {
      document.getElementById('rol-nombre').disabled = true;
      document.getElementById('btn-guardar-nombre').style.display = 'none';
      document.querySelectorAll('.perm-check').forEach((cb) => {
        cb.disabled = true;
      });
      document.getElementById('btn-guardar-permisos').style.display = 'none';
    }

    cargarRol();
  },

  onDestroy() {},
};
