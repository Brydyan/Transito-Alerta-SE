/**
 * Unified Create/Edit Incident Form — 4-step stepper
 *
 * Steps: 1 Información Básica → 2 Categorización y Archivos →
 * 3 Ubicación → 4 Revisión. Single template, one <form>, panels toggled
 * via `d-none`; no shell-based context detection; all elements use the
 * `ici-` prefix.
 */

import template from './incidencias.form.component.html?raw';
import style from './incidencias.form.component.css?raw';
import uploaderStyle from '../../../shared/image-uploader.css?raw';
import { http } from '../../../core/http.service.js';
import { router } from '../../../core/router.js';
import initMapView from '../../../shared/init-map-view.js';
import { locationService } from '../../../shared/location.service.js';
import { mountImageUploader } from '../../../shared/image-uploader.js';
import { escapeHtml } from '../../../utils/format.js';
import {
  initSelect,
  getSelect,
  clearSelect,
  destroySelect,
  destroyAll,
} from '../../../shared/select-search.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

// ── Error field mapping: backend field → error ID suffix ──
const ERROR_MAP = {
  title: 'error-title',
  titulo: 'error-title',
  description: 'error-description',
  descripcion: 'error-description',
  priority: 'error-priority',
  incident_category_id: 'error-category',
  geom: 'error-geom',
  location_id: 'error-location',
};

// ── Which step each backend-validated field lives on, so a 422 jumps
// the user back to where the offending field actually is ──
const FIELD_STEP = {
  title: 1,
  titulo: 1,
  description: 1,
  descripcion: 1,
  priority: 1,
  incident_category_id: 2,
  location_id: 2,
  geom: 3,
};

const P = 'ici-';
const $ = (suffix) => document.getElementById(P + suffix);

const TOTAL_STEPS = 4;
const PRIORITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' };

export default {
  template,
  style: style + '\n' + uploaderStyle,

  async onInit() {
    document.body.classList.add('ici-create-view');

    // ── State ──
    let marker = null;
    let geomValue = null; // GeoJSON Point
    let imagenesSeleccionadas = [];
    let categoryTree = [];
    // Progressive location cascade — last-fetched arrays per level, kept in
    // scope so boundary resolution can look up a selected location's geom
    // without an extra request (locationService.getChildren already
    // returns geom per item — see LocationResource::toArray()).
    let provinces = [];
    let lastCities = [];
    let lastNeighborhoods = [];
    // Image uploader controller is assigned later in onInit, but the
    // submit handler (bound early below) needs the reference, so the
    // `let` lives up here to keep both the binding and the eventual
    // assignment safe from each other regardless of init ordering.
    let imageUploaderController = null;
    // Edit mode flags — same early-declared pattern. `router.queryParams`
    // is stable for the lifetime of the route, so reading them once at
    // top is fine and avoids a TDZ ReferenceError when the submit
    // handler fires before the original declaration at line ~904.
    const isEdit = router.queryParams.has('id');
    const incId = router.queryParams.get('id');

    // ── Helpers ──

    function resetFieldError(id) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        // `incid-form__map-error` keeps its font-size + hidden-by-default
        // styling; we only toggle visibility here.
        if (el.classList.contains('incid-form__map-error')) {
          el.style.display = 'none';
        } else {
          el.classList.remove('d-block');
          el.classList.add('d-none');
        }
      }
    }

    function showFieldError(id, msg) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = msg;
        if (el.classList.contains('incid-form__map-error')) {
          el.style.display = 'block';
        } else {
          el.classList.remove('d-none');
          el.classList.add('d-block');
        }
      }
    }

    function resetAllErrors() {
      document.querySelectorAll(`[id^="${P}error-"]`).forEach((el) => {
        el.textContent = '';
        el.style.display = 'none';
      });
      const banner = document.getElementById(P + 'error');
      if (banner) {
        banner.textContent = '';
        banner.classList.add('d-none');
      }
    }

    // ── Character counters — declared before any await below so the
    // step-machine bootstrap (next) can safely call validateStep1() the
    // moment a user clicks Siguiente, even mid-fetch ──
    const titleInput = $('title');
    const descInput = $('description');
    const priorityInput = $('priority');
    const titleCounter = $('char-counter-title');
    const descCounter = $('char-counter-description');

    if (titleInput && titleCounter) {
      titleInput.addEventListener('input', function () {
        titleCounter.textContent = this.value.length + '/100';
        if (this.value.trim()) {
          resetFieldError(P + 'error-title');
        }
      });
    }

    if (descInput && descCounter) {
      descInput.addEventListener('input', function () {
        descCounter.textContent = this.value.length + '/500';
      });
    }

    if (priorityInput) {
      priorityInput.addEventListener('change', function () {
        if (this.value) resetFieldError(P + 'error-priority');
      });
    }

    // ── Step machine bootstrap — runs synchronously, before the Leaflet
    // map / categories / locations awaits below, so the footer never
    // flashes all four buttons at once and Siguiente/Anterior aren't
    // dead buttons while those requests are in flight ──
    let currentStep = 1;
    goToStep(1);

    $('btn-next')?.addEventListener('click', () => {
      if (currentStep === 1 && !validateStep1()) return;
      if (currentStep === 2 && !validateStep2()) return;
      if (currentStep === 3 && !validateStep3()) return;
      goToStep(currentStep + 1);
    });

    $('btn-prev')?.addEventListener('click', () => {
      goToStep(currentStep - 1);
    });

    [1, 2, 3].forEach((n) => {
      document
        .getElementById(P + 'review-edit-' + n)
        ?.addEventListener('click', (e) => {
          e.preventDefault();
          goToStep(n);
        });
    });

    // ── Submit handler — bound EARLY, BEFORE the awaits below. The
    // 4-step wizard's click-submit cycle can race onInit past its
    // categories/locations fetch; if the handler weren't registered
    // yet the form would fall back to its default GET submission
    // and reload the URL with `?lat=&lng=` apppended (the hidden
    // form fields), bypassing the JS-driven POST + navigation.
    // The handler body is hoisted (`async function _handleSubmit`
    // lives further down in onInit), referenced here by name so
    // closure captures the shared state without duplication.
    document
      .getElementById('ici-form')
      ?.addEventListener('submit', _handleSubmit);

    // ── Boundary overlay state (feature: map-location-boundary) ──
    //
    // `locationService.getRoots`/`getChildren` already return `geom` per
    // location (see LocationResource::toArray()), so no extra endpoint is
    // needed — we resolve the boundary from whatever level is currently
    // selected using the last-fetched `provinces`/`lastCities`/
    // `lastNeighborhoods` arrays (progressive equivalent of the old
    // in-memory `locationsTree` walk).
    let pendingBoundary = null; // GeoJSON (MultiPolygon / Polygon) a dibujar
    let pendingBoundaryLabel = null; // "cantón Santa Elena" (para el mensaje)
    let pendingBoundarySublabel = null; // "Parroquia X dentro de cantón Y"
    let boundaryLayer = null; // referencia Leaflet del layer actual

    function resolveDeepestSelection() {
      if (!locationSelection) return null;
      if (locationSelection.neighborhoodId) {
        return (
          lastNeighborhoods.find(
            (n) => n.id === locationSelection.neighborhoodId,
          ) ?? null
        );
      }
      if (locationSelection.cityId) {
        return (
          lastCities.find((c) => c.id === locationSelection.cityId) ?? null
        );
      }
      if (locationSelection.provinceId) {
        return (
          provinces.find((p) => p.id === locationSelection.provinceId) ?? null
        );
      }
      return null;
    }

    function resolveBoundaryFromSelection(location) {
      if (!location) return null;
      if (location.geom) {
        return {
          geom: location.geom,
          level: location.level,
          name: location.name,
          source: 'self',
        };
      }
      // Parish sin geom: subimos al cantón padre que sí tiene boundary.
      if (location.parent_id) {
        const parent = lastCities.find(
          (c) => String(c.id) === String(location.parent_id),
        );
        if (parent && parent.geom) {
          return {
            geom: parent.geom,
            level: parent.level,
            name: parent.name,
            source: 'parent',
            parishName: location.name,
          };
        }
      }
      return null;
    }

    function applyBoundaryFromSelection(location) {
      pendingBoundary = null;
      pendingBoundaryLabel = null;
      pendingBoundarySublabel = null;
      const r = resolveBoundaryFromSelection(location);
      if (!r) {
        renderBoundaryUI();
        return;
      }
      pendingBoundary = r.geom;
      // "cantón" para city, "provincia" para province — singular para el mensaje.
      const levelTxt =
        r.level === 'city'
          ? 'cantón'
          : r.level === 'province'
            ? 'provincia'
            : r.level;
      pendingBoundaryLabel = `${levelTxt} ${r.name}`;
      pendingBoundarySublabel =
        r.source === 'parent' && r.parishName
          ? `Parroquia ${r.parishName} dentro de ${levelTxt} ${r.name}`
          : null;
      // Si el map ya está montado, dibujamos ahora; si no, `pendingBoundary`
      // queda seteada para que el primer render del map (más abajo) lo agarre.
      if (map) drawBoundaryLayer();
      renderBoundaryUI();
    }

    function updateBoundaryFromCurrentSelection() {
      applyBoundaryFromSelection(resolveDeepestSelection());
    }

    function drawBoundaryLayer() {
      if (!map) return;
      if (boundaryLayer) {
        boundaryLayer.remove();
        boundaryLayer = null;
      }
      if (!pendingBoundary) return;
      boundaryLayer = L.geoJSON(pendingBoundary, {
        style: {
          color: '#3b82f6',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
        },
      }).addTo(map);
      try {
        map.fitBounds(boundaryLayer.getBounds(), {
          padding: [20, 20],
          maxZoom: 14,
        });
      } catch {
        /* getBounds puede fallar si la geometría está vacía; ignorar */
      }
    }

    function renderBoundaryUI() {
      const sublabelEl = document.getElementById(P + 'boundary-sublabel');
      const disclaimerEl = document.getElementById(P + 'boundary-disclaimer');
      if (sublabelEl) {
        if (pendingBoundarySublabel) {
          sublabelEl.textContent = pendingBoundarySublabel;
          sublabelEl.classList.remove('d-none');
        } else {
          sublabelEl.classList.add('d-none');
        }
      }
      if (disclaimerEl) {
        disclaimerEl.classList.toggle('d-none', !pendingBoundary);
      }
      // El warning se refresca separadamente porque depende del pin,
      // no solo de la selección.
      refreshPinVsBoundary();
    }

    function setPinVariant(variant) {
      // 'default' | 'ok' | 'warn'
      if (!marker) return;
      const dom = marker.getElement();
      if (!dom) return;
      // Leaflet envuelve el icono en un `.leaflet-marker-icon`; aplicamos
      // la clase sobre ese, o sobre el contenedor si no se encuentra.
      const target = dom.querySelector?.('.leaflet-marker-icon') || dom;
      target.classList.remove(
        'incid-form__marker--ok',
        'incid-form__marker--warn',
      );
      if (variant === 'ok') target.classList.add('incid-form__marker--ok');
      if (variant === 'warn') target.classList.add('incid-form__marker--warn');
    }

    function refreshPinVsBoundary() {
      const warningEl = document.getElementById(P + 'boundary-warning');
      const submitBtn = $('submit');
      const blockedReasonEl = document.getElementById(
        P + 'submit-blocked-reason',
      );
      if (!marker || !pendingBoundary) {
        setPinVariant('default');
        if (warningEl) {
          warningEl.classList.add('d-none');
          warningEl.textContent = '';
        }
        if (submitBtn) submitBtn.disabled = false;
        if (blockedReasonEl) {
          blockedReasonEl.classList.add('d-none');
          blockedReasonEl.textContent = '';
        }
        return;
      }
      const ll = marker.getLatLng();
      const inside = booleanPointInPolygon(
        turfPoint([ll.lng, ll.lat]),
        pendingBoundary,
      );
      if (inside) {
        setPinVariant('ok');
        if (warningEl) {
          warningEl.classList.add('d-none');
          warningEl.textContent = '';
        }
        if (submitBtn) submitBtn.disabled = false;
        if (blockedReasonEl) {
          blockedReasonEl.classList.add('d-none');
          blockedReasonEl.textContent = '';
        }
      } else {
        setPinVariant('warn');
        if (warningEl) {
          warningEl.textContent = `El pin está fuera de la ubicación ${pendingBoundaryLabel}. Ajustá la ubicación o el pin antes de guardar.`;
          warningEl.classList.remove('d-none');
        }
        if (submitBtn) submitBtn.disabled = true;
        // Inline reason at the submit footer — the warning on the
        // map (step 3) tells the user *how* to fix it; this tells
        // them *that* they can't submit, right where they reach
        // for the submit button.
        if (blockedReasonEl) {
          blockedReasonEl.textContent = `No podés guardar: el pin está fuera de ${pendingBoundaryLabel}.`;
          blockedReasonEl.classList.remove('d-none');
        }
      }
    }

    // ── Leaflet map ──
    const mapaInicial = { lat: -0.9537, lng: -80.7286, zoom: 13 };
    const { map, remove } = await initMapView({
      container: P + 'map',
      center: { lat: mapaInicial.lat, lng: mapaInicial.lng },
      zoom: mapaInicial.zoom,
    });
    // Wrap the disposer para limpiar también el boundary layer (feature: map-location-boundary).
    this._mapRemove = () => {
      if (boundaryLayer) {
        boundaryLayer.remove();
        boundaryLayer = null;
      }
      remove();
    };
    if (!map) return;

    function setMarker(lat, lng) {
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          setMarker(pos.lat, pos.lng);
        });
      }
      geomValue = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      map.setView([lat, lng], map.getZoom());
      resetFieldError(P + 'error-geom');
      // Feature: map-location-boundary — refrescar estado del pin vs el
      // boundary actualmente dibujado (color + warning inline).
      refreshPinVsBoundary();
    }

    map.on('click', (e) => setMarker(e.latlng.lat, e.latlng.lng));

    // ── Geolocation ──
    document
      .getElementById(P + 'btn-geo')
      ?.addEventListener('click', function () {
        if (!navigator.geolocation) {
          showFieldError(
            P + 'error-geom',
            'Geolocalización no disponible en este navegador.',
          );
          return;
        }
        const btn = this;
        btn.disabled = true;
        btn.innerHTML =
          '<span class="spinner-border spinner-border-sm me-1"></span> Detectando...';

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setMarker(pos.coords.latitude, pos.coords.longitude);
            map.setZoom(16);
            btn.disabled = false;
            btn.innerHTML =
              '<i class="fas fa-crosshairs me-1"></i> Usar mi ubicación actual';
          },
          () => {
            showFieldError(
              P + 'error-geom',
              'No se pudo obtener la ubicación. Verifique los permisos del navegador.',
            );
            btn.disabled = false;
            btn.innerHTML =
              '<i class="fas fa-crosshairs me-1"></i> Usar mi ubicación actual';
          },
        );
      });

    // ── Load categories (parent → child tree) ──
    const catSelect = document.getElementById('ici-category');
    const subcatSelect = document.getElementById('ici-subcategory');

    function findCategoryNode(nodes, id) {
      for (const node of nodes) {
        if (String(node.id) === String(id)) return { node, isRoot: true };
        const children = node.children || [];
        const child = children.find((c) => String(c.id) === String(id));
        if (child) return { node: child, parent: node, isRoot: false };
      }
      return null;
    }

    // ── Tom Select helpers — mirrors organizaciones.form.component.js's
    // cascading-select pattern (poblarSelectNativo/setSelectEnabled) so both
    // forms behave the same way. A field is populated as a plain native
    // select first, then handed to initSelect(); initSelect() wraps it
    // whether it's enabled or disabled, so dependent fields waiting on a
    // parent still render as a tom-select box (not a raw <select>).
    function poblarSelectNativo(elementId, items, textoDefault) {
      const sel = document.getElementById(elementId);
      sel.innerHTML =
        `<option value="">${textoDefault}</option>` +
        items.map((i) => `<option value="${i.id}">${i.name}</option>`).join('');
    }

    function setSelectEnabled(elementId, enabled) {
      const sel = document.getElementById(elementId);
      if (enabled) {
        sel.removeAttribute('disabled');
      } else {
        sel.setAttribute('disabled', '');
      }
    }

    function populateSubcategories(parentId) {
      clearSelect('ici-subcategory');
      const parent = categoryTree.find(
        (c) => String(c.id) === String(parentId),
      );
      // Destroy the current tom-select instance BEFORE mutating the raw
      // <select>'s innerHTML: Tom Select's destroy() reverts the element
      // back to the DOM snapshot it captured at construction time, so
      // doing this AFTER poblarSelectNativo would wipe out the fresh
      // options we just wrote (see select-search.js's initSelect(), which
      // calls destroySelect() internally — the same trap, one step later).
      destroySelect('ici-subcategory');
      if (!parent) {
        poblarSelectNativo(
          'ici-subcategory',
          [],
          '-- Seleccione subcategoría --',
        );
        setSelectEnabled('ici-subcategory', false);
        initSelect('ici-subcategory', {
          placeholder: 'Buscar subcategoría...',
        });
        return;
      }

      const children = parent.children ?? [];
      if (children.length === 0) {
        poblarSelectNativo('ici-subcategory', [], '-- Sin subcategorías --');
        setSelectEnabled('ici-subcategory', false);
        initSelect('ici-subcategory', {
          placeholder: 'Buscar subcategoría...',
        });
        return;
      }

      poblarSelectNativo(
        'ici-subcategory',
        children,
        '-- Seleccione subcategoría (opcional) --',
      );
      setSelectEnabled('ici-subcategory', true);
      initSelect('ici-subcategory', { placeholder: 'Buscar subcategoría...' });
    }

    // ── Load categories and locations (progressive via locationService) ─────
    // Province-level roots are loaded upfront; city/neighborhood are fetched
    // on demand via getChildren. This replaces the old /locations/tree call.
    let locationSelection = null; // { provinceId, cityId, neighborhoodId } for boundary

    // Pin the location-select DOM references here, BEFORE the awaits below.
    // renderReviewSummary() runs from the click handler bound way up at
    // the bootstrap block on line ~158, so by the time the user reaches
    // step 4 we may still be paused in the very awaits this opens.
    // Declaring these `const`s up here means the review summary can read
    // them safely without hitting a temporal-dead-zone ReferenceError.
    const provinceSelect = document.getElementById('ici-location-province');
    const citySelect = document.getElementById('ici-location-city');
    const neighborhoodSelect = document.getElementById(
      'ici-location-neighborhood',
    );

    try {
      const catResp = await http.get('/incident-categories/tree');
      categoryTree = catResp.data ?? catResp ?? [];
      poblarSelectNativo(
        'ici-category',
        categoryTree,
        '-- Seleccione categoría --',
      );
      initSelect('ici-category', { placeholder: 'Buscar categoría...' });

      provinces = await locationService.getRoots(
        { level: 'province' },
        { catalog: true },
      );
      poblarSelectNativo(
        'ici-location-province',
        provinces,
        '-- Sin ubicación fija --',
      );
      initSelect('ici-location-province', {
        placeholder: 'Buscar provincia...',
      });

      // Dependent fields start disabled/empty but are still wrapped as
      // tom-select boxes from first paint, matching the enabled look.
      initSelect('ici-subcategory', { placeholder: 'Buscar subcategoría...' });
      initSelect('ici-location-city', { placeholder: 'Buscar cantón...' });
      initSelect('ici-location-neighborhood', {
        placeholder: 'Buscar parroquia...',
      });
    } catch {
      // categoryTree stays as-is (empty from initial declaration)
    }

    catSelect.addEventListener('change', function () {
      populateSubcategories(this.value);
      resetFieldError(P + 'error-category');
    });

    // Stale-request guard — incremented before each async call; stale
    // responses are discarded when generation mismatches.
    let selectionGeneration = 0;
    // Dedicated guard for the step-4 orgs preview so it never couples to
    // the catalog loads above (re-entering step 4 must invalidate the
    // previous preview request).
    let orgsPreviewGeneration = 0;

    async function onProvinceChange() {
      const provinceId = provinceSelect.value;
      clearSelect('ici-location-city');
      clearSelect('ici-location-neighborhood');

      if (!provinceId) {
        destroySelect('ici-location-city');
        destroySelect('ici-location-neighborhood');
        setSelectEnabled('ici-location-city', false);
        setSelectEnabled('ici-location-neighborhood', false);
        initSelect('ici-location-city', { placeholder: 'Buscar cantón...' });
        initSelect('ici-location-neighborhood', {
          placeholder: 'Buscar parroquia...',
        });
        locationSelection = null;
        lastCities = [];
        lastNeighborhoods = [];
        updateBoundaryFromCurrentSelection();
        return;
      }

      selectionGeneration++;
      const gen = selectionGeneration;
      const cities = await locationService.getChildren(
        { parentId: parseInt(provinceId) },
        { catalog: true },
      );
      if (gen !== selectionGeneration) return; // stale
      lastCities = cities;
      lastNeighborhoods = [];

      // Destroy BEFORE writing fresh <option>s — see the comment in
      // populateSubcategories() above for why the order matters.
      destroySelect('ici-location-city');
      if (cities.length === 0) {
        poblarSelectNativo('ici-location-city', [], '-- Sin cantones --');
        setSelectEnabled('ici-location-city', false);
      } else {
        poblarSelectNativo(
          'ici-location-city',
          cities,
          '-- Seleccione cantón --',
        );
        setSelectEnabled('ici-location-city', true);
      }
      initSelect('ici-location-city', { placeholder: 'Buscar cantón...' });

      destroySelect('ici-location-neighborhood');
      poblarSelectNativo(
        'ici-location-neighborhood',
        [],
        '-- Seleccione parroquia --',
      );
      setSelectEnabled('ici-location-neighborhood', false);
      initSelect('ici-location-neighborhood', {
        placeholder: 'Buscar parroquia...',
      });

      locationSelection = {
        provinceId: parseInt(provinceId),
        cityId: null,
        neighborhoodId: null,
      };
      updateBoundaryFromCurrentSelection();
    }

    async function onCityChange() {
      const cityId = citySelect.value;
      clearSelect('ici-location-neighborhood');

      if (!cityId) {
        destroySelect('ici-location-neighborhood');
        setSelectEnabled('ici-location-neighborhood', false);
        initSelect('ici-location-neighborhood', {
          placeholder: 'Buscar parroquia...',
        });
        if (locationSelection) locationSelection.cityId = null;
        lastNeighborhoods = [];
        updateBoundaryFromCurrentSelection();
        return;
      }

      selectionGeneration++;
      const gen = selectionGeneration;
      const neighborhoods = await locationService.getChildren(
        { parentId: parseInt(cityId) },
        { catalog: true },
      );
      if (gen !== selectionGeneration) return; // stale
      lastNeighborhoods = neighborhoods;

      destroySelect('ici-location-neighborhood');
      if (neighborhoods.length === 0) {
        poblarSelectNativo(
          'ici-location-neighborhood',
          [],
          '-- Sin parroquias --',
        );
        setSelectEnabled('ici-location-neighborhood', false);
      } else {
        poblarSelectNativo(
          'ici-location-neighborhood',
          neighborhoods,
          '-- Seleccione parroquia (opcional) --',
        );
        setSelectEnabled('ici-location-neighborhood', true);
      }
      initSelect('ici-location-neighborhood', {
        placeholder: 'Buscar parroquia...',
      });

      if (locationSelection) {
        locationSelection.cityId = parseInt(cityId);
        locationSelection.neighborhoodId = null;
      }
      updateBoundaryFromCurrentSelection();
    }

    function onNeighborhoodChange() {
      if (locationSelection) {
        locationSelection.neighborhoodId = neighborhoodSelect.value
          ? parseInt(neighborhoodSelect.value, 10)
          : null;
      }
      updateBoundaryFromCurrentSelection();
    }

    provinceSelect.addEventListener('change', onProvinceChange);
    citySelect.addEventListener('change', onCityChange);
    neighborhoodSelect.addEventListener('change', onNeighborhoodChange);

    // ── Image Uploader ──
    const uploaderContainer = $('image-uploader-container');
    if (uploaderContainer) {
      imageUploaderController = mountImageUploader({
        container: uploaderContainer,
        inputId: 'ici-images',
        maxFiles: 10,
        maxSizeMB: 5,
        onChange: (files) => {
          imagenesSeleccionadas = files;
        },
      });
    }

    // ── Step machine (1 Info Básica → 2 Categorización y Archivos →
    // 3 Ubicación → 4 Revisión) — `currentStep` and the Siguiente/
    // Anterior/Editar listeners are declared earlier, before any await,
    // see the bootstrap block above. Only the function bodies live here.

    function stepPanel(n) {
      return document.getElementById(P + 'step-' + n);
    }

    function updateStepperIndicator(n) {
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        const dot = document.getElementById(P + 'stepper-' + i);
        if (!dot) continue;
        dot.classList.toggle('ici-stepper__step--active', i === n);
        dot.classList.toggle('ici-stepper__step--done', i < n);
      }
    }

    function updateFooterButtons(n) {
      $('btn-cancel')?.classList.toggle('d-none', n !== 1);
      $('btn-prev')?.classList.toggle('d-none', n === 1);
      $('btn-next')?.classList.toggle('d-none', n === TOTAL_STEPS);
      $('submit')?.classList.toggle('d-none', n !== TOTAL_STEPS);
    }

    function selectedOptionText(selectEl) {
      const opt = selectEl?.selectedOptions?.[0];
      return opt && opt.value ? opt.textContent : '';
    }

    function renderReviewSummary() {
      const reviewTitle = $('review-title');
      if (reviewTitle) reviewTitle.textContent = titleInput?.value || '—';

      const reviewPriority = $('review-priority');
      if (reviewPriority) {
        reviewPriority.textContent =
          PRIORITY_LABELS[priorityInput?.value] || '—';
      }

      const reviewDescription = $('review-description');
      if (reviewDescription) {
        reviewDescription.textContent = descInput?.value || 'Sin descripción';
      }

      const reviewCategory = $('review-category');
      if (reviewCategory) {
        const subcatText = selectedOptionText(subcatSelect);
        const catText = selectedOptionText(catSelect);
        reviewCategory.textContent = subcatText || catText || '—';
      }

      const reviewLocation = $('review-location');
      if (reviewLocation) {
        // Mirrors the submit handler's precedence exactly (neighborhood ||
        // city, no province-alone fallback) — a province-only selection
        // submits location_id: null, so it must never be displayed here
        // as if it were going to be saved.
        const cityVal = citySelect?.value;
        const neighborhoodVal = neighborhoodSelect?.value;
        if (cityVal || neighborhoodVal) {
          const parts = [
            selectedOptionText(provinceSelect),
            selectedOptionText(citySelect),
            selectedOptionText(neighborhoodSelect),
          ].filter(Boolean);
          reviewLocation.textContent = parts.join(', ');
        } else {
          reviewLocation.textContent = 'Sin ubicación fija';
        }
      }

      const reviewImagesCount = $('review-images-count');
      if (reviewImagesCount) {
        reviewImagesCount.textContent = imagenesSeleccionadas.length
          ? `${imagenesSeleccionadas.length} imagen(es) adjunta(s)`
          : 'Sin imágenes adjuntas';
      }

      const reviewCoords = $('review-coords');
      if (reviewCoords) {
        if (geomValue?.coordinates) {
          const [lng, lat] = geomValue.coordinates;
          reviewCoords.textContent = `Lat: ${lat}, Lng: ${lng}`;
        } else {
          reviewCoords.textContent = 'Sin ubicación en el mapa';
        }
      }

      // Issue #235 — load the orgs that will be notified for the
      // (location_id, category_id) pair. The endpoint runs the same logic
      // the backend will run on POST, so the user sees an accurate preview.
      // Mirror the submit handler's precedence: neighborhood > city > null.
      const orgsLocationId =
        neighborhoodSelect?.value || citySelect?.value || null;
      const previewGen = ++orgsPreviewGeneration;
      void renderReviewOrgs(
        subcatSelect?.value || catSelect?.value,
        orgsLocationId,
        previewGen,
      );
    }

    async function renderReviewOrgs(categoryId, locationId, generation) {
      const container = $('review-orgs');
      if (!container) return;

      // No category or no location → nothing to notify.
      if (!categoryId || !locationId) {
        container.innerHTML = `
          <div class="text-muted small">
            <i class="fa-solid fa-circle-info me-1" aria-hidden="true"></i>
            Selecciona categoría y ubicación territorial para ver las
            organizaciones que serán notificadas.
          </div>`;
        return;
      }

      // Loading state.
      container.innerHTML = `
        <div class="text-center text-muted py-3">
          <i class="fa-solid fa-circle-notch fa-spin me-2" aria-hidden="true"></i>
          Calculando organizaciones…
        </div>`;

      try {
        const json = await http.get(
          `/organizations/notified-for?location_id=${encodeURIComponent(locationId)}&category_id=${encodeURIComponent(categoryId)}`,
        );
        if (generation !== orgsPreviewGeneration) return; // stale
        const orgs = Array.isArray(json?.data) ? json.data : [];

        if (orgs.length === 0) {
          container.innerHTML = `
            <div class="text-muted small">
              <i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>
              Ninguna organización cubrirá esta combinación de categoría y
              ubicación. La incidencia quedará sin asignación automática.
            </div>`;
          return;
        }

        // Render the list. The is_claimable flag (computed by the backend
        // via findForLocation) gets a pill so the user can tell at a glance
        // which entity will actually receive the claim.
        container.innerHTML = `
          <ul class="ici-review__orgs-list" role="list">
            ${orgs
              .map((org) => {
                const claimablePill = org.is_claimable
                  ? '<span class="ici-review__orgs-pill">Principal</span>'
                  : '';
                return `
                  <li class="ici-review__orgs-item">
                    <i class="fa-solid fa-building me-2" aria-hidden="true"></i>
                    <span class="flex-grow-1">${escapeHtml(org.name || '')}</span>
                    ${claimablePill}
                  </li>`;
              })
              .join('')}
          </ul>
          <p class="text-muted small mb-0 mt-2">
            <i class="fa-solid fa-circle-info me-1" aria-hidden="true"></i>
            La marcada como <strong>Principal</strong> será la asignada
            automáticamente al registrar la incidencia.
          </p>`;
      } catch {
        if (generation !== orgsPreviewGeneration) return; // stale
        container.innerHTML = `
          <div class="text-warning small">
            <i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>
            No pudimos calcular las organizaciones notificadas. Podés
            continuar; la incidencia se enviará igualmente.
          </div>`;
      }
    }

    function goToStep(n) {
      currentStep = Math.min(TOTAL_STEPS, Math.max(1, n));
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        stepPanel(i)?.classList.toggle('d-none', i !== currentStep);
      }
      updateStepperIndicator(currentStep);
      updateFooterButtons(currentStep);
      // The map is created while step 3 is still `d-none` (it's the last
      // step reachable, initialized up front so a click can drop a
      // marker as soon as the user arrives); Leaflet can't size itself
      // correctly inside a hidden container, so force a resize the
      // moment the panel actually becomes visible.
      if (currentStep === 3) map?.invalidateSize();
      if (currentStep === TOTAL_STEPS) renderReviewSummary();
    }

    function validateStep1() {
      let valid = true;
      if (!titleInput?.value.trim()) {
        showFieldError(P + 'error-title', 'El título es obligatorio');
        valid = false;
      }
      if (!priorityInput?.value) {
        showFieldError(P + 'error-priority', 'Seleccione la prioridad');
        valid = false;
      }
      return valid;
    }

    function validateStep2() {
      const categoryId = subcatSelect?.value || catSelect?.value || '';
      if (!categoryId) {
        showFieldError(P + 'error-category', 'Seleccione una categoría');
        return false;
      }
      resetFieldError(P + 'error-category');
      return true;
    }

    function validateStep3() {
      if (!geomValue) {
        showFieldError(
          P + 'error-geom',
          'Debe marcar una ubicación en el mapa',
        );
        return false;
      }
      return true;
    }

    // ── Edit mode loading ──
    // isEdit and incId are declared at the top of onInit so the
    // submit handler (bound early below) can reference them without
    // hitting a TDZ ReferenceError.

    if (isEdit) {
      const pageTitleEl = document.getElementById('ici-page-title');
      const breadcrumbActiveEl = document.getElementById(
        'ici-breadcrumb-active',
      );
      const cardTitleEl = document.getElementById('ici-card-title');
      const submitBtnTextEl = document.getElementById('ici-submit-btn-text');

      if (pageTitleEl) pageTitleEl.textContent = 'Editar Incidencia';
      if (breadcrumbActiveEl) breadcrumbActiveEl.textContent = 'Editar';
      if (cardTitleEl) cardTitleEl.textContent = 'Editar Incidencia';
      if (submitBtnTextEl) submitBtnTextEl.textContent = 'Guardar Cambios';

      const toastTextEl = document.getElementById('ici-toast-text');
      if (toastTextEl)
        toastTextEl.textContent = 'Incidencia actualizada correctamente.';

      try {
        const resp = await http.get('/incidents/' + incId);
        const inc = resp.data ?? resp;

        const titleEl = $('title');
        const descEl = $('description');
        const priorityEl = $('priority');

        if (titleEl) {
          titleEl.value = inc.title ?? '';
          const titleCounter = $('char-counter-title');
          if (titleCounter)
            titleCounter.textContent = (inc.title ?? '').length + '/100';
        }
        if (descEl) {
          descEl.value = inc.description ?? '';
          const descCounter = $('char-counter-description');
          if (descCounter)
            descCounter.textContent = (inc.description ?? '').length + '/500';
        }
        if (priorityEl) {
          priorityEl.value = inc.priority ?? '';
        }

        const currentCategoryId = inc.incident_category_id ?? null;
        if (currentCategoryId) {
          const match = findCategoryNode(categoryTree, currentCategoryId);
          if (match) {
            if (match.isRoot) {
              getSelect('ici-category')?.setValue(String(match.node.id), true);
              populateSubcategories(match.node.id);
            } else {
              getSelect('ici-category')?.setValue(
                String(match.parent.id),
                true,
              );
              populateSubcategories(match.parent.id);
              getSelect('ici-subcategory')?.setValue(
                String(match.node.id),
                true,
              );
            }
          }
        }

        const locationId = inc.location_id ?? null;
        if (locationId && inc.location_path && inc.location_path.length > 0) {
          // Progressive preselection via location_path (ordered root-to-leaf array).
          // Build the cascade from the path without re-fetching already-loaded data.
          const nivelProvincia = inc.location_path.find(
            (a) => a.level === 'province',
          );
          const nivelCiudad = inc.location_path.find((a) => a.level === 'city');
          const nivelParroquia = inc.location_path.find(
            (a) => a.level === 'neighborhood',
          );

          if (nivelProvincia) {
            getSelect('ici-location-province')?.setValue(
              String(nivelProvincia.id),
              true,
            );
            locationSelection = {
              provinceId: nivelProvincia.id,
              cityId: null,
              neighborhoodId: null,
            };

            if (nivelCiudad) {
              selectionGeneration++;
              const genCities = selectionGeneration;
              const cities = await locationService.getChildren(
                { parentId: nivelProvincia.id },
                { catalog: true },
              );
              if (genCities !== selectionGeneration) return;
              lastCities = cities;

              destroySelect('ici-location-city');
              poblarSelectNativo(
                'ici-location-city',
                cities,
                '-- Seleccione cantón --',
              );
              setSelectEnabled('ici-location-city', true);
              initSelect('ici-location-city', {
                placeholder: 'Buscar cantón...',
              });
              getSelect('ici-location-city')?.setValue(
                String(nivelCiudad.id),
                true,
              );
              locationSelection.cityId = nivelCiudad.id;

              if (nivelParroquia) {
                selectionGeneration++;
                const genParroquias = selectionGeneration;
                const parishes = await locationService.getChildren(
                  { parentId: nivelCiudad.id },
                  { catalog: true },
                );
                if (genParroquias !== selectionGeneration) return;
                lastNeighborhoods = parishes;

                destroySelect('ici-location-neighborhood');
                poblarSelectNativo(
                  'ici-location-neighborhood',
                  parishes,
                  '-- Seleccione parroquia (opcional) --',
                );
                setSelectEnabled('ici-location-neighborhood', true);
                initSelect('ici-location-neighborhood', {
                  placeholder: 'Buscar parroquia...',
                });
                getSelect('ici-location-neighborhood')?.setValue(
                  String(nivelParroquia.id),
                  true,
                );
                locationSelection.neighborhoodId = nivelParroquia.id;
              }
            }
          }
          // Map is already mounted by this point (initMapView runs early,
          // well before this edit-mode fetch) — draw the boundary now.
          updateBoundaryFromCurrentSelection();
        }

        // Map marker
        if (inc.geom?.coordinates) {
          const [lng, lat] = inc.geom.coordinates;
          setMarker(lat, lng);
          map.setView([lat, lng], 16);
        }
      } catch (err) {
        console.error('Error al precargar la incidencia para edición:', err);
      }
    }

    // Submit handler body (function declaration is hoisted, so the
    // early binding above can reference `_handleSubmit` by name).
    // Lexical closure captures `geomValue`, `imageUploaderController`,
    // `isEdit`, `incId` — all declared at the top of onInit so they're
    // safe to read here regardless of which awaits have settled by the
    // time a click fires the event.
    async function _handleSubmit(e) {
      e.preventDefault();
      console.warn('[handleSubmit] fired');

      // Defense in depth — `refreshPinVsBoundary()` disables the submit
      // button when the pin is outside the selected location's polygon,
      // but a form submit triggered by Enter in any input bypasses that
      // button-level `disabled` state. Re-check the warning's visibility
      // here as the single source of truth so we never POST a
      // location/pin pair the user wasn't warned about.
      const boundaryWarningEl = document.getElementById(P + 'boundary-warning');
      if (
        boundaryWarningEl &&
        !boundaryWarningEl.classList.contains('d-none')
      ) {
        showFieldError(
          P + 'error-geom',
          'El pin está fuera de la ubicación seleccionada. Ajustá la ubicación o el pin antes de guardar.',
        );
        goToStep(3);
        return;
      }

      resetAllErrors();

      // ── Validate shared fields (defense in depth — the per-step
      // gates above should already guarantee these hold by the time
      // step 4's submit button is reachable) ──
      let valid = true;
      let firstInvalidStep = null;
      const title = $('title').value.trim();
      const description = $('description').value.trim();
      const priority = $('priority').value;

      if (!title || !priority) {
        if (!title) {
          showFieldError(P + 'error-title', 'El título es obligatorio');
        }
        if (!priority) {
          showFieldError(P + 'error-priority', 'Seleccione la prioridad');
        }
        valid = false;
        firstInvalidStep = firstInvalidStep ?? 1;
      }

      const parentCategoryVal = document.getElementById('ici-category').value;
      const subCategoryVal = document.getElementById('ici-subcategory').value;
      // The subcategory (child), when selected, is the actual category
      // sent to the backend — it's the more specific classification.
      // Falls back to the parent category when no subcategory was chosen
      // (e.g. the parent has no children, or the citizen left it blank).
      const categoryId = parseInt(
        subCategoryVal || parentCategoryVal || '',
        10,
      );
      if (!categoryId) {
        showFieldError(P + 'error-category', 'Seleccione una categoría');
        valid = false;
        firstInvalidStep = firstInvalidStep ?? 2;
      }

      if (!geomValue) {
        showFieldError(
          P + 'error-geom',
          'Debe marcar una ubicación en el mapa',
        );
        valid = false;
        firstInvalidStep = firstInvalidStep ?? 3;
      }

      if (!valid) {
        goToStep(firstInvalidStep);
        return;
      }

      // Deepest level actually chosen wins — same fallback logic as
      // category/subcategory (neighborhoodVal || cityVal), except there's
      // no province-level fallback: a province alone isn't specific
      // enough to be a submittable location_id, so it's treated the same
      // as leaving the whole cascade blank (null).
      const neighborhoodVal = document.getElementById(
        'ici-location-neighborhood',
      ).value;
      const cityVal = document.getElementById('ici-location-city').value;
      const locVal = neighborhoodVal || cityVal;
      const locationId = locVal ? parseInt(locVal, 10) : null;

      const payloadBase = {
        title,
        descripcion: description || null,
        priority,
        incident_category_id: categoryId,
        location_id: locationId,
        geom: geomValue,
      };

      // ── Loading state ──
      const submitBtn = $('submit');
      const submitText = $('submit-text');
      const submitLoading = $('submit-loading');
      submitBtn.disabled = true;
      submitText.classList.add('d-none');
      submitLoading.classList.remove('d-none');

      // ── Send request ──
      try {
        const filesToUpload = imageUploaderController
          ? imageUploaderController.getFiles()
          : imagenesSeleccionadas;
        const hasImages = filesToUpload.length > 0;
        let body;
        if (hasImages) {
          body = new FormData();
          for (const [key, val] of Object.entries(payloadBase)) {
            if (val !== null && val !== '') {
              // FormData coerces objects to "[object Object]", so serialize geom explicitly.
              body.append(key, key === 'geom' ? JSON.stringify(val) : val);
            }
          }
          filesToUpload.forEach((file) => body.append('images[]', file));
        } else {
          body = payloadBase;
        }

        let resp;
        if (isEdit) {
          if (hasImages) {
            body.append('_method', 'PUT');
            resp = await http.post('/incidents/' + incId, body);
          } else {
            resp = await http.put('/incidents/' + incId, body);
          }
        } else {
          resp = await http.post('/incidents', body);
        }
        const newId = resp.data?.id ?? resp.id;

        // Toast success
        const toastEl = document.getElementById('ici-toast');
        if (toastEl) {
          new bootstrap.Toast(toastEl, { delay: 2000 }).show();
        }

        setTimeout(() => {
          router.navigate(newId ? `/incidencias/${newId}` : '/incidencias');
        }, 2000);
      } catch (err) {
        // 422 — validation errors
        if (err.status === 422 && err.errors) {
          // Land on the EARLIEST step among all returned fields, not
          // just the first one the backend happened to list — errors on
          // other steps are still written into their own (now hidden)
          // panel below, but a step order lower than that would strand
          // the user unable to see them.
          let backendErrorStep = null;
          for (const [field, messages] of Object.entries(err.errors)) {
            const errorSuffix = ERROR_MAP[field];
            if (errorSuffix) {
              const errorEl = document.getElementById(P + errorSuffix);
              if (errorEl) {
                errorEl.textContent = Array.isArray(messages)
                  ? messages.join(', ')
                  : messages;
                errorEl.style.display = 'block';
              }
              const fieldStep = FIELD_STEP[field] ?? null;
              if (fieldStep !== null) {
                backendErrorStep =
                  backendErrorStep === null
                    ? fieldStep
                    : Math.min(backendErrorStep, fieldStep);
              }
            }
          }
          if (backendErrorStep) goToStep(backendErrorStep);
          // Show general error banner
          const errorBanner = document.getElementById(P + 'error');
          if (errorBanner && err.message) {
            errorBanner.textContent = err.message;
            errorBanner.classList.remove('d-none');
          }
        } else if (err.status === 401) {
          router.navigate('/login');
        } else {
          console.error('Error al crear incidencia:', err);
          const errorBanner = document.getElementById(P + 'error');
          if (errorBanner) {
            errorBanner.textContent =
              err.message ||
              'Error al guardar la incidencia. Intente nuevamente.';
            errorBanner.classList.remove('d-none');
          }
        }
      } finally {
        submitBtn.disabled = false;
        submitText.classList.remove('d-none');
        submitLoading.classList.add('d-none');
      }
    }
  },

  onDestroy() {
    document.body.classList.remove('ici-create-view');

    destroyAll();

    this._imageUploader?.destroy();
    this._imageUploader = null;

    // Clean up Leaflet map via the helper's returned disposer
    this._mapRemove?.();
    this._mapRemove = null;
  },
};
