import { http } from '../core/http.service.js';

/**
 * Tom Select wrapper — searchable dropdowns for all selects.
 *
 * Uso:
 *   import { initSelect, initRemoteSelect, updateSelectOptions, destroySelect, destroyAll } from './select-search.js';
 *
 *   // Inicializar síncrono
 *   const sel = initSelect('mi-select', { placeholder: 'Buscar...' });
 *
 *   // Inicializar con paginación progresiva (infinite scroll) y búsqueda remota
 *   initRemoteSelect('mi-select', { urlEndpoint: '/locations', getParams: () => ({ level: 'province' }) });
 *
 *   // Limpiar en onDestroy
 *   destroyAll();
 */

const instances = new Map();

/**
 * Crea (o recrea) un Tom Select en el elemento dado.
 * @param {string} elementId - ID del <select> original
 * @param {object} customConfig - Config extra para Tom Select
 * @returns {TomSelect|null}
 */
export function initSelect(elementId, customConfig = {}) {
  destroySelect(elementId);

  const el = document.getElementById(elementId);
  if (!el) return null;

  // Tom Select respeta el atributo disabled del <select> original: lo
  // envuelve igual, pero renderiza el wrapper en estado deshabilitado
  // (gris, sin dropdown) mostrando el placeholder configurado. Esto permite
  // que un campo dependiente (cascada) se vea como tom-select desde el
  // primer render, aunque todavía no tenga datos ni esté habilitado.
  const config = {
    maxOptions: 200,
    maxItems: 1,
    placeholder: el.options[0]?.text || 'Seleccionar...',
    allowEmptyOption: false,
    dropdownParent: 'body',
    onDropdownOpen: () => {
      // Pequeño fix para Bootstrap 5 z-index
      const dd = el.tomselect?.dropdown;
      if (dd) dd.style.zIndex = '9999';
    },
    ...customConfig,
  };

  try {
    const instance = new TomSelect(el, config);
    instances.set(elementId, instance);
    return instance;
  } catch {
    // Si falla (ej: elemento inválido), continuar sin TS
    return null;
  }
}

/**
 * Inicializa un Tom Select con paginación progresiva (infinite scroll) y búsqueda remota.
 * @param {string} elementId - ID del <select>
 * @param {object} config - { urlEndpoint, getParams, valueField, textField, customFormat, selectedValue }
 */
export function initRemoteSelect(
  elementId,
  {
    urlEndpoint,
    getParams = () => ({}),
    valueField = 'id',
    textField = 'name',
    customFormat = null,
    selectedValue = null,
  },
) {
  destroySelect(elementId);
  const el = document.getElementById(elementId);
  if (!el) return null;

  let currentPage = 1;
  let lastPage = 1;
  let currentSearch = '';
  let isLoading = false;

  async function loadPage(page, search = '', append = false) {
    if (isLoading) return;
    isLoading = true;

    try {
      const extraParams = getParams() || {};
      const queryParams = new URLSearchParams({
        page: String(page),
        per_page: '20',
        search: search,
        ...extraParams,
      });

      const resp = await http.get(`${urlEndpoint}?${queryParams.toString()}`);
      const data = resp.data ?? [];
      const meta = resp.meta ?? {};
      lastPage = meta.last_page ?? 1;
      currentPage = page;

      const formattedOpts = data.map((item) => ({
        value: String(item[valueField] ?? item.id),
        text: customFormat
          ? customFormat(item)
          : String(item[textField] ?? item.name),
      }));

      const instance = instances.get(elementId);
      if (instance) {
        if (!append) {
          instance.clearOptions();
        }
        instance.addOptions(formattedOpts);
        if (selectedValue !== null && selectedValue !== '') {
          instance.setValue(String(selectedValue), true);
        }
        instance.refreshOptions(false);
      }
    } catch (err) {
      console.error('Error cargando opciones remotas:', err);
    } finally {
      isLoading = false;
    }
  }

  const instance = initSelect(elementId, {
    loadFilter: function () {
      return true;
    },
    load: function (query, callback) {
      currentSearch = query;
      loadPage(1, query, false).then(() => callback());
    },
  });

  if (instance) {
    const dropdownContent = instance.dropdown_content;
    if (dropdownContent) {
      dropdownContent.addEventListener('scroll', () => {
        if (isLoading || currentPage >= lastPage) return;
        if (
          dropdownContent.scrollTop + dropdownContent.clientHeight >=
          dropdownContent.scrollHeight - 30
        ) {
          loadPage(currentPage + 1, currentSearch, true);
        }
      });
    }
    // Carga inicial página 1 (20 elementos)
    loadPage(1, '', false);
  }

  return instance;
}

/**
 * Actualiza las opciones de un Tom Select (para cascading).
 */
export function updateSelectOptions(elementId, options, selectedValue = null) {
  const instance = instances.get(elementId);
  if (!instance) return;

  const opts = options.map((o) => ({
    value: String(o.value ?? o.id ?? ''),
    text: String(o.text ?? o.name ?? ''),
  }));

  instance.clearOptions();
  instance.addOptions(opts);

  if (opts.length > 0) {
    instance.clear(true); // clear silencioso
    if (selectedValue !== null && selectedValue !== '') {
      instance.setValue(String(selectedValue), true); // silencioso
    }
    instance.refreshOptions();
  } else {
    instance.clear(true);
    instance.refreshOptions();
  }
}

/**
 * Habilita un Tom Select (útil para cascading).
 */
export function enableSelect(elementId) {
  const instance = instances.get(elementId);
  if (instance) instance.setActive(true);
}

/**
 * Deshabilita un Tom Select.
 */
export function disableSelect(elementId) {
  const instance = instances.get(elementId);
  if (instance) instance.setActive(false);
}

/**
 * Destruye un Tom Select y restaura el <select> original.
 */
export function destroySelect(elementId) {
  if (instances.has(elementId)) {
    try {
      instances.get(elementId).destroy();
    } catch {
      /* ignore */
    }
    instances.delete(elementId);
  }
}

/**
 * Destruye TODAS las instancias (llamar en onDestroy del componente).
 */
export function destroyAll() {
  for (const [id] of instances) {
    destroySelect(id);
  }
}

/**
 * Obtiene la instancia de Tom Select para un elemento.
 */
export function getSelect(elementId) {
  return instances.get(elementId) ?? null;
}

/**
 * Limpia el valor de un Tom Select (útil para botones "limpiar filtros").
 */
export function clearSelect(elementId) {
  const instance = instances.get(elementId);
  if (instance) {
    instance.clear();
  }
}
