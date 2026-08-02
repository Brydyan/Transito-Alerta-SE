import template from './localizaciones.form.component.html?raw';
import { http } from '../../../../core/http.service.js';
import { router } from '../../../../core/router.js';
import { mostrarToast } from '../../../../utils/ui.js';
import {
  initRemoteSelect,
  updateSelectOptions,
  destroyAll,
} from '../../../../shared/select-search.js';

const NIVEL_LABELS = {
  country: 'País',
  province: 'Provincia',
  city: 'Ciudad',
  neighborhood: 'Barrio',
};

const PARENT_LEVEL_MAP = {
  province: 'country',
  city: 'province',
  neighborhood: 'city',
};

export default {
  template,

  async onInit() {
    const esEdicion = router.queryParams.has('id');
    const locId = router.queryParams.get('id');

    const titulo = document.getElementById('form-titulo');
    const cardTitulo = document.getElementById('card-titulo');
    const breadcrumb = document.getElementById('breadcrumb-actual');

    if (esEdicion) {
      titulo.textContent = 'Editar Localización';
      cardTitulo.textContent = 'Editar Localización';
      breadcrumb.textContent = 'Editar';
    }

    let locActual = null;
    if (esEdicion) {
      try {
        const resp = await http.get('/locations/' + locId);
        locActual = resp.data ?? resp;
        document.getElementById('loc-id').value = locActual.id;
        document.getElementById('loc-nombre').value = locActual.name;
        document.getElementById('loc-codigo').value = locActual.code ?? '';
        document.getElementById('loc-nivel').value = locActual.level;
      } catch {
        mostrarToast('Error al cargar la localización.', 'danger');
      }
    }

    function inicializarSelectorPadre(selectedLevel, currentParentId = null) {
      const expectedParentLevel = PARENT_LEVEL_MAP[selectedLevel];
      const sel = document.getElementById('loc-padre');

      if (!expectedParentLevel) {
        sel.innerHTML = '<option value="">-- Ninguna (raíz) --</option>';
        updateSelectOptions(
          'loc-padre',
          [{ value: '', text: '-- Ninguna (raíz) --' }],
          '',
        );
        return;
      }

      initRemoteSelect('loc-padre', {
        urlEndpoint: '/locations',
        getParams: () => ({ level: expectedParentLevel }),
        selectedValue: currentParentId,
        customFormat: (item) =>
          `${item.name} (${NIVEL_LABELS[item.level] ?? item.level})`,
      });
    }

    const nivelSelect = document.getElementById('loc-nivel');
    inicializarSelectorPadre(nivelSelect.value, locActual?.parent_id ?? null);

    nivelSelect.addEventListener('change', (e) => {
      inicializarSelectorPadre(e.target.value, null);
    });

    document
      .getElementById('form-loc')
      .addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!this.checkValidity()) {
          this.classList.add('was-validated');
          return;
        }

        const id = document.getElementById('loc-id').value;
        const padreVal = document.getElementById('loc-padre').value;
        const payload = {
          name: document.getElementById('loc-nombre').value.trim(),
          code: document.getElementById('loc-codigo').value.trim(),
          level: document.getElementById('loc-nivel').value,
          parent_id: padreVal ? parseInt(padreVal) : null,
        };

        document.getElementById('loc-btn-texto').classList.add('d-none');
        document.getElementById('loc-btn-loading').classList.remove('d-none');
        document.getElementById('btn-guardar-loc').disabled = true;

        try {
          if (id) {
            await http.put('/locations/' + id, payload);
          } else {
            await http.post('/locations', payload);
          }
          mostrarToast(
            id ? 'Localización actualizada.' : 'Localización creada.',
            'success',
          );
          router.navigate('/localizaciones');
        } catch (err) {
          mostrarToast(err.message ?? 'No se pudo guardar.', 'danger');
        } finally {
          document.getElementById('loc-btn-texto').classList.remove('d-none');
          document.getElementById('loc-btn-loading').classList.add('d-none');
          document.getElementById('btn-guardar-loc').disabled = false;
        }
      });
  },

  onDestroy() {
    destroyAll();
  },
};
