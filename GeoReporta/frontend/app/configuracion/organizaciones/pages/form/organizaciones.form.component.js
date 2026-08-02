import template from './organizaciones.form.component.html?raw';
import { http } from '../../../../core/http.service.js';
import { router } from '../../../../core/router.js';
import { mostrarToast } from '../../../../utils/ui.js';
import { locationService } from '../../../../shared/location.service.js';
import {
  initSelect,
  getSelect,
  clearSelect,
  destroySelect,
  destroyAll,
} from '../../../../shared/select-search.js';

export default {
  template,

  async onInit() {
    const editId = router.queryParams.get('id');
    const esEdicion = !!editId;

    // ─── Setear título dinámico ───────────────────────────────────────────
    document.getElementById('form-titulo').textContent = esEdicion
      ? 'Editar Organización'
      : 'Nueva Organización';
    document.getElementById('card-titulo').textContent = esEdicion
      ? 'Editar Organización'
      : 'Nueva Organización';
    document.getElementById('breadcrumb-actual').textContent = esEdicion
      ? 'Editar'
      : 'Crear';

    // ─── Cargar organizaciones padre ──────────────────────────────────────
    function cargarPadres(organizations, exceptId = null) {
      try {
        const sel = document.getElementById('org-padre');
        sel.innerHTML = '<option value="">-- Ninguna (raíz) --</option>';
        organizations
          .filter((o) => o.id !== Number.parseInt(exceptId, 10))
          .forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.name;
            sel.appendChild(opt);
          });
      } catch {
        mostrarToast(
          'No se pudieron cargar las organizaciones padre.',
          'warning',
        );
      }
    }

    // ─── Localización en cascada — progressive via locationService ──────────

    // Active selection generation for race-safety (stale responses discarded)
    let selectionGeneration = 0;

    function poblarSelectNativo(selId, items, textoDefault) {
      const sel = document.getElementById(selId);
      sel.innerHTML =
        `<option value="">${textoDefault}</option>` +
        items.map((i) => `<option value="${i.id}">${i.name}</option>`).join('');
    }

    function setSelectEnabled(selId, enabled) {
      const sel = document.getElementById(selId);
      if (enabled) {
        sel.removeAttribute('disabled');
      } else {
        sel.setAttribute('disabled', '');
      }
    }

    // ─── Cargar categoría (single-select) ────────────────────────────

    async function cargarCategorias(allCats, selectedId = null) {
      try {
        const cats = allCats.filter(
          (c) => c.parent_id === null || c.parent_id === undefined,
        );
        const sel = document.getElementById('org-categorias');
        sel.innerHTML =
          '<option value="">-- Seleccione Categoría --</option>' +
          cats
            .map(
              (c) =>
                `<option value="${c.id}" ${Number.parseInt(selectedId, 10) === c.id ? 'selected' : ''}>${c.name}</option>`,
            )
            .join('');

        initSelect('org-categorias', {
          placeholder: 'Buscar categoría...',
          maxItems: 1,
        });
      } catch {
        mostrarToast('No se pudieron cargar las categorías.', 'warning');
      }
    }

    const paisSel = 'org-location-pais';
    const provinciaSel = 'org-location-provincia';
    const ciudadSel = 'org-location-ciudad';

    async function onPaisChange() {
      const val = document.getElementById(paisSel).value;
      clearSelect(provinciaSel);
      clearSelect(ciudadSel);
      if (val) {
        selectionGeneration++;
        const gen = selectionGeneration;
        const provinces = await locationService.getChildren({
          parentId: Number.parseInt(val, 10),
        });
        // Discard stale response
        if (gen !== selectionGeneration) return;
        // Destroy BEFORE writing fresh <option>s — Tom Select's destroy()
        // reverts the underlying <select> to its construction-time DOM
        // snapshot, so doing this AFTER poblarSelectNativo would wipe out
        // the fresh options just written (initSelect() destroys internally
        // too, one step later — same trap).
        destroySelect(provinciaSel);
        poblarSelectNativo(provinciaSel, provinces, '-- Seleccione --');
        setSelectEnabled(provinciaSel, true);
        initSelect(provinciaSel, { placeholder: 'Buscar provincia...' });
        destroySelect(ciudadSel);
        poblarSelectNativo(ciudadSel, [], '-- Opcional --');
        setSelectEnabled(ciudadSel, false);
        initSelect(ciudadSel, { placeholder: 'Buscar ciudad...' });
      } else {
        setSelectEnabled(provinciaSel, false);
        setSelectEnabled(ciudadSel, false);
        initSelect(provinciaSel, { placeholder: 'Buscar provincia...' });
        initSelect(ciudadSel, { placeholder: 'Buscar ciudad...' });
      }
      actualizarLocationId();
    }

    async function onProvinciaChange() {
      const val = document.getElementById(provinciaSel).value;
      clearSelect(ciudadSel);
      if (val) {
        selectionGeneration++;
        const gen = selectionGeneration;
        const cities = await locationService.getChildren({
          parentId: Number.parseInt(val, 10),
        });
        // Discard stale response
        if (gen !== selectionGeneration) return;
        destroySelect(ciudadSel);
        poblarSelectNativo(ciudadSel, cities, '-- Opcional --');
        setSelectEnabled(ciudadSel, true);
        initSelect(ciudadSel, { placeholder: 'Buscar ciudad...' });
      } else {
        setSelectEnabled(ciudadSel, false);
        initSelect(ciudadSel, { placeholder: 'Buscar ciudad...' });
      }
      actualizarLocationId();
    }

    function onCiudadChange() {
      actualizarLocationId();
    }

    function actualizarLocationId() {
      const ciudad = document.getElementById(ciudadSel).value;
      const provincia = document.getElementById(provinciaSel).value;
      const pais = document.getElementById(paisSel).value;
      document.getElementById('org-location').value =
        ciudad || provincia || pais;
    }

    /**
     * Initialize cascading location selects with progressive loading.
     * Uses location_path (ordered root-to-leaf array) from detail response
     * for preselection in edit mode, fetching only the needed levels.
     *
     * @param {object[]|null} locationPath — location_path from detail response, or null for create
     * @param {number|null} selectedId — the location_id of the organization (deepest level)
     */
    async function initCascadingLocation(locationPath, selectedId = null) {
      // Load countries as roots
      selectionGeneration++;
      const gen = selectionGeneration;
      const countries = await locationService.getRoots({ level: 'country' });
      if (gen !== selectionGeneration) return;

      poblarSelectNativo(paisSel, countries, '-- Seleccione --');
      initSelect(paisSel, { placeholder: 'Buscar país...' });

      // Dependent fields start disabled/empty but are still wrapped as
      // tom-select boxes from first paint, matching the enabled look.
      initSelect(provinciaSel, { placeholder: 'Buscar provincia...' });
      initSelect(ciudadSel, { placeholder: 'Buscar ciudad...' });

      // Attach listeners first
      document.getElementById(paisSel).addEventListener('change', onPaisChange);
      document
        .getElementById(provinciaSel)
        .addEventListener('change', onProvinciaChange);
      document
        .getElementById(ciudadSel)
        .addEventListener('change', onCiudadChange);

      // Edit mode: preselect from location_path
      if (locationPath && locationPath.length > 0) {
        const nivelPais = locationPath.find((a) => a.level === 'country');
        const nivelProvincia = locationPath.find((a) => a.level === 'province');
        const nivelCiudad = locationPath.find((a) => a.level === 'city');

        if (nivelPais) {
          getSelect(paisSel)?.setValue(String(nivelPais.id), true);
          // Fetch and populate provinces
          selectionGeneration++;
          const genProv = selectionGeneration;
          const provinces = await locationService.getChildren({
            parentId: nivelPais.id,
          });
          if (genProv !== selectionGeneration) return;
          destroySelect(provinciaSel);
          poblarSelectNativo(provinciaSel, provinces, '-- Seleccione --');
          setSelectEnabled(provinciaSel, true);
          initSelect(provinciaSel, { placeholder: 'Buscar provincia...' });
        }

        if (nivelProvincia) {
          getSelect(provinciaSel)?.setValue(String(nivelProvincia.id), true);
          // Fetch and populate cities
          selectionGeneration++;
          const genCity = selectionGeneration;
          const cities = await locationService.getChildren({
            parentId: nivelProvincia.id,
          });
          if (genCity !== selectionGeneration) return;
          destroySelect(ciudadSel);
          poblarSelectNativo(ciudadSel, cities, '-- Opcional --');
          setSelectEnabled(ciudadSel, true);
          initSelect(ciudadSel, { placeholder: 'Buscar ciudad...' });
        }

        if (nivelCiudad) {
          getSelect(ciudadSel)?.setValue(String(nivelCiudad.id), true);
        }

        document.getElementById('org-location').value = selectedId;
      }
    }

    // ─── Carga inicial ────────────────────────────────────────────────────
    // Edit:   GET /organizations/:id  →  org data + catalog (single request)
    // Create: GET /organizations/form-data  →  catalog only

    if (esEdicion) {
      try {
        // Load detail and form-data in parallel for performance
        const [orgResp, catalogResp] = await Promise.all([
          http.get('/organizations/' + editId),
          http.get('/organizations/form-data'),
        ]);
        const org = orgResp.data ?? orgResp;
        const catalog = catalogResp.data ?? catalogResp;

        document.getElementById('org-id').value = org.id;
        document.getElementById('org-nombre').value = org.name;

        const categoriaId = org.incident_category?.id ?? null;

        // cargarPadres es síncrono (no retorna Promise), se ejecuta fuera de Promise.all
        cargarPadres(catalog.organizations ?? [], editId);
        await Promise.all([
          initCascadingLocation(org.location_path ?? null, org.location_id),
          cargarCategorias(catalog.categories ?? [], categoriaId),
        ]);
        document.getElementById('org-padre').value = org.parent_id ?? '';
      } catch {
        mostrarToast('No se pudo cargar la organización.', 'danger');
        return;
      }
    } else {
      let formCatalogs;
      try {
        formCatalogs = await http.get('/organizations/form-data');
      } catch {
        mostrarToast(
          'No se pudieron cargar los datos del formulario.',
          'danger',
        );
        return;
      }
      cargarPadres(formCatalogs.organizations);
      await Promise.all([
        initCascadingLocation(null),
        cargarCategorias(formCatalogs.categories),
      ]);
    }

    // ─── Tom Select en org-padre ──────────────────────────────────────────
    initSelect('org-padre', { placeholder: 'Buscar organización...' });

    // ─── Submit ───────────────────────────────────────────────────────────
    document
      .getElementById('form-org')
      .addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!this.checkValidity()) {
          this.classList.add('was-validated');
          return;
        }

        const id = document.getElementById('org-id').value;
        const padreVal = document.getElementById('org-padre').value;
        const locationId = document.getElementById('org-location').value;

        if (!locationId) {
          mostrarToast('Debe seleccionar al menos un país.', 'warning');
          return;
        }

        const catSelect = getSelect('org-categorias');
        const categoryId =
          catSelect && catSelect.getValue()
            ? Number.parseInt(catSelect.getValue(), 10)
            : null;

        const payload = {
          name: document.getElementById('org-nombre').value.trim(),
          location_id: Number.parseInt(locationId, 10),
          parent_id: padreVal ? Number.parseInt(padreVal, 10) : null,
          incident_category_id: categoryId,
        };

        document.getElementById('org-btn-texto').classList.add('d-none');
        document.getElementById('org-btn-loading').classList.remove('d-none');
        document.getElementById('btn-guardar-org').disabled = true;

        try {
          if (id) {
            await http.put('/organizations/' + id, payload);
          } else {
            await http.post('/organizations', payload);
          }
          mostrarToast(
            id ? 'Organización actualizada.' : 'Organización creada.',
            'success',
          );
          setTimeout(() => {
            router.navigate('/organizaciones');
          }, 800);
        } catch (err) {
          mostrarToast(err.message ?? 'No se pudo guardar.', 'danger');
        } finally {
          document.getElementById('org-btn-texto').classList.remove('d-none');
          document.getElementById('org-btn-loading').classList.add('d-none');
          document.getElementById('btn-guardar-org').disabled = false;
        }
      });
  },

  onDestroy() {
    destroyAll();
  },
};
