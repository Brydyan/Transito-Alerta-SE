import template from './usuarios.form.component.html?raw';
import style from './usuarios.form.component.css?raw';
import { http } from '../../../../core/http.service.js';
import { router } from '../../../../core/router.js';
import { auth } from '../../../../auth/auth.service.js';
import { EMAIL_RE } from '../../../../utils/format.js';
import {
  initSelect,
  getSelect,
  destroyAll,
} from '../../../../shared/select-search.js';
import { mountAvatarUploader } from '../../../../shared/avatar-uploader.js';
import { mostrarToast, maskPhoneInput } from '../../../../utils/ui.js';

/** Module-scope so onDestroy can clean it up after the latest onInit. */
let _avatar = null;

export default {
  template,
  style,

  async onInit() {
    const esEdicion = router.queryParams.has('id');
    const userId = router.queryParams.get('id');
    const loggedUser = await auth.me();

    const titulo = document.getElementById('form-titulo');
    const cardTitulo = document.getElementById('card-titulo');
    const breadcrumb = document.getElementById('breadcrumb-actual');

    if (esEdicion) {
      titulo.textContent = 'Editar Usuario';
      cardTitulo.textContent = 'Editar Usuario';
      breadcrumb.textContent = 'Editar';
    }

    // ─── Poblar selects con catálogo ──────────────────────────────────

    function poblarCombos({ roles, organizations }) {
      let rolesFiltrados = roles;
      if (loggedUser.role?.name !== 'admin_sistema') {
        rolesFiltrados = roles.filter(
          (r) =>
            !['admin_sistema', 'operador_sistema', 'Admin'].includes(r.name),
        );
      }

      const selRol = document.getElementById('user-rol');
      selRol.innerHTML = '<option value="">-- Seleccione Rol --</option>';
      rolesFiltrados.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        selRol.appendChild(opt);
      });

      const selOrg = document.getElementById('user-org');
      selOrg.innerHTML =
        '<option value="">-- Ninguna (Global / Sistema) --</option>';
      organizations.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name;
        selOrg.appendChild(opt);
      });
    }

    const emailInput = document.getElementById('user-email');
    function buildEmailFeedback() {
      let el = document.getElementById('user-email-feedback');
      if (!el) {
        el = document.createElement('div');
        el.id = 'user-email-feedback';
        el.className = 'invalid-feedback d-block';
        el.style.display = 'none';
        emailInput.parentNode.appendChild(el);
      }
      return el;
    }
    const emailFeedback = buildEmailFeedback();
    emailInput.addEventListener('blur', () => {
      if (emailInput.value.trim() && !EMAIL_RE.test(emailInput.value.trim())) {
        emailFeedback.textContent = 'Ingresá un correo válido.';
        emailFeedback.style.display = 'block';
      }
    });
    emailInput.addEventListener('input', () => {
      if (!emailInput.value.trim() || EMAIL_RE.test(emailInput.value.trim())) {
        emailFeedback.style.display = 'none';
        emailFeedback.textContent = '';
      }
    });

    // ─── Cancel link ─────────────────────────────────────────────────

    const btnCancelar = document.getElementById('btn-cancelar');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => router.navigate('/usuarios'));
    }

    // ─── Carga inicial ────────────────────────────────────────────────
    // Edit:   GET /users/:id  →  user data + catalog (single request)
    // Create: GET /users/form-data  →  catalog only

    let currentUser = null;

    if (esEdicion) {
      try {
        const resp = await http.get('/users/' + userId);
        currentUser = resp.data ?? resp;

        poblarCombos({
          roles: currentUser.roles ?? [],
          organizations: currentUser.organizations ?? [],
        });

        // Tom Select must be initialized AFTER options are in the DOM.
        initSelect('user-rol', { placeholder: 'Buscar rol...' });
        initSelect('user-org', { placeholder: 'Buscar organización...' });

        document.getElementById('user-id').value = currentUser.id;
        document.getElementById('user-nombre').value =
          currentUser.first_name ?? '';
        document.getElementById('user-apellido').value =
          currentUser.last_name ?? '';
        document.getElementById('user-email').value = currentUser.email;
        const telefonoEl = document.getElementById('user-telefono');
        if (telefonoEl) {
          telefonoEl.value = currentUser.phone ?? '';
          maskPhoneInput(telefonoEl);
        }

        getSelect('user-rol')?.setValue(
          currentUser.role?.id ? String(currentUser.role.id) : '',
        );
        getSelect('user-org')?.setValue(
          currentUser.organization?.id
            ? String(currentUser.organization.id)
            : '',
        );

        if (
          loggedUser.role?.name !== 'admin_sistema' &&
          loggedUser.organization?.id
        ) {
          getSelect('user-org')?.disable();
        }
      } catch {
        mostrarToast('Error al cargar el usuario.', 'danger');
      }
    } else {
      try {
        const data = await http.get('/users/form-data');
        poblarCombos(data);
      } catch (err) {
        console.error('Error cargando roles y organizaciones:', err);
      }

      initSelect('user-rol', { placeholder: 'Buscar rol...' });
      initSelect('user-org', { placeholder: 'Buscar organización...' });

      if (
        loggedUser.role?.name !== 'admin_sistema' &&
        loggedUser.organization?.id
      ) {
        getSelect('user-org')?.setValue(String(loggedUser.organization.id));
        getSelect('user-org')?.disable();
      }
    }

    // ─── Avatar uploader (shared helper) ────────────────────────────

    if (_avatar) {
      _avatar.destroy();
    }
    _avatar = mountAvatarUploader({
      wrap: '#user-avatar-wrap-btn',
      preview: '#user-avatar-preview',
      input: '#user-avatar',
    });

    const eliminarBtn = document.getElementById('btn-eliminar-avatar');
    const deleteFlagInput = document.getElementById('user-delete-avatar-flag');

    const showEliminarBtn =
      currentUser?.profile_image_path !== null &&
      currentUser?.profile_image_path !== undefined;
    if (eliminarBtn) {
      eliminarBtn.classList.toggle('d-none', !showEliminarBtn);
    }

    if (currentUser?.profile_image_path) {
      _avatar?.setPreviewFromUrl('/storage/' + currentUser.profile_image_path);
      if (deleteFlagInput) deleteFlagInput.value = '0';
    }

    if (eliminarBtn && _avatar) {
      eliminarBtn.addEventListener('click', function () {
        if (!confirm('¿Eliminar la foto de perfil?')) return;
        _avatar.clear();
        // Mark the form for deletion; applied only on submit.
        if (deleteFlagInput) deleteFlagInput.value = '1';
        eliminarBtn.classList.add('d-none');
        mostrarToast('La foto se eliminará al guardar los cambios.', 'success');
      });
    }

    // ─── Submit ──────────────────────────────────────────────────────

    document
      .getElementById('form-user')
      .addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!this.checkValidity()) {
          this.classList.add('was-validated');
          return;
        }

        const id = document.getElementById('user-id').value;
        const orgVal = document.getElementById('user-org').value;

        const avatarFile = _avatar?.getFile() ?? null;
        const wantsDelete = deleteFlagInput && deleteFlagInput.value === '1';

        const basePayload = {
          first_name: document.getElementById('user-nombre').value.trim(),
          last_name: document.getElementById('user-apellido').value.trim(),
          email: document.getElementById('user-email').value.trim(),
          role_id: parseInt(document.getElementById('user-rol').value),
          organization_id: orgVal ? parseInt(orgVal) : null,
          phone: document.getElementById('user-telefono').value.trim() || null,
          ...(wantsDelete ? { _delete_avatar: true } : {}),
        };

        let payload;
        if (avatarFile) {
          // Multipart when an avatar file is present.
          payload = new FormData();
          Object.entries(basePayload).forEach(([k, v]) => {
            if (v !== null && v !== undefined) {
              payload.append(k, String(v));
            }
          });
          payload.append('avatar', avatarFile);
        } else {
          payload = basePayload;
        }

        document.getElementById('user-btn-texto').classList.add('d-none');
        document.getElementById('user-btn-loading').classList.remove('d-none');
        document.getElementById('btn-guardar-user').disabled = true;

        try {
          if (id) {
            await http.put('/users/' + id, payload);
          } else {
            await http.post('/users', payload);
          }
          mostrarToast(
            id
              ? 'Usuario actualizado.'
              : 'Usuario creado. Le llegará un mail con el link de activación.',
            'success',
          );

          // Refresh auth state so app-shell header shows the new avatar
          // when the admin edits their own row.
          await auth.me();
          auth._notifyAuthChange();

          router.navigate('/usuarios');
        } catch (err) {
          mostrarToast(err.message ?? 'No se pudo guardar.', 'danger');
        } finally {
          document.getElementById('user-btn-texto').classList.remove('d-none');
          document.getElementById('user-btn-loading').classList.add('d-none');
          document.getElementById('btn-guardar-user').disabled = false;
        }
      });
  },

  onDestroy() {
    destroyAll();
    _avatar?.destroy();
    _avatar = null;
  },
};
