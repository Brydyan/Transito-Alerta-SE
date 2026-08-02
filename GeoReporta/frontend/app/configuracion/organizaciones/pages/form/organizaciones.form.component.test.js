/**
 * organizaciones.form component — unit tests for progressive location loading
 *
 * WU-3: Organization form migration to locationService
 *
 * @vitest-environment jsdom
 */

// ─── Module-level mock objects (vi.hoisted pattern from dashboard test) ───────
const mockHttp = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue(null),
}));

const mockLocationService = vi.hoisted(() => ({
  getRoots: vi.fn(),
  getChildren: vi.fn(),
  invalidateCache: vi.fn(),
}));

const mockRouter = vi.hoisted(() => ({
  queryParams: new URLSearchParams(),
  navigate: vi.fn(),
}));

vi.mock('../../../../core/http.service.js', () => ({
  http: mockHttp,
  setAccessToken: vi.fn(),
  clearAuthState: vi.fn(),
}));
vi.mock('../../../../shared/location.service.js', () => ({
  locationService: mockLocationService,
}));
vi.mock('../../../../core/router.js', () => ({ router: mockRouter }));
vi.mock('../../../../shared/select-search.js', () => ({
  initSelect: vi.fn(),
  getSelect: vi.fn(() => ({ setValue: vi.fn() })),
  clearSelect: vi.fn(),
  destroySelect: vi.fn(),
  destroyAll: vi.fn(),
}));
vi.mock('../../../../utils/ui.js', () => ({
  mostrarToast: vi.fn(),
}));
vi.stubGlobal('bootstrap', { Toast: vi.fn(), Modal: vi.fn() });

// Imported (post-mock) to assert call order in the re-selection regression
// test below.
import { initSelect, destroySelect } from '../../../../shared/select-search.js';

// ─── DOM fixture ────────────────────────────────────────────────────────────────
function buildFixture() {
  document.body.innerHTML = `
    <div id="form-titulo"></div>
    <div id="card-titulo"></div>
    <div id="breadcrumb-actual"></div>
    <form id="form-org">
      <input id="org-id" />
      <input id="org-nombre" />
      <input id="org-location" />
      <select id="org-padre"></select>
      <select id="org-location-pais"></select>
      <select id="org-location-provincia"></select>
      <select id="org-location-ciudad"></select>
      <select id="org-categorias"></select>
    </form>
    <button id="btn-guardar-org"></button>
    <span id="org-btn-texto"></span>
    <span id="org-btn-loading"></span>
  `;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { id: 1, name: 'Ecuador', code: 'EC', level: 'country', parent_id: null },
];

const PROVINCES = [
  { id: 2, name: 'Pichincha', code: 'EC-PI', level: 'province', parent_id: 1 },
  { id: 3, name: 'Guayas', code: 'EC-GY', level: 'province', parent_id: 1 },
];

const CITIES_PICHINCHA = [
  { id: 4, name: 'Quito', code: 'EC-PI-QT', level: 'city', parent_id: 2 },
];

const COUNTRIES_2 = [
  { id: 1, name: 'Ecuador', code: 'EC', level: 'country', parent_id: null },
  { id: 8, name: 'Perú', code: 'PE', level: 'country', parent_id: null },
];
const PROVINCES_PERU = [
  { id: 9, name: 'Lima', code: 'PE-LI', level: 'province', parent_id: 8 },
];

const FORM_CATALOG = {
  organizations: [],
  locations_tree: [],
  categories: [
    { id: 1, name: 'Emergencia', parent_id: null },
    { id: 2, name: 'Infraestructura', parent_id: null },
  ],
};

const LOCATION_PATH_QUITO = [
  { id: 1, name: 'Ecuador', level: 'country', parent_id: null },
  { id: 2, name: 'Pichincha', level: 'province', parent_id: 1 },
  { id: 4, name: 'Quito', level: 'city', parent_id: 2 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('organizaciones.form — progressive location loading (WU-3)', () => {
  let component;

  beforeAll(async () => {
    const mod = await import('./organizaciones.form.component.js');
    component = mod.default;
  });

  beforeEach(() => {
    mockHttp.get.mockClear();
    mockLocationService.getRoots.mockClear();
    mockLocationService.getChildren.mockClear();
    buildFixture();
    mockRouter.queryParams = new URLSearchParams();
  });

  describe('create mode: progressive location loading via locationService', () => {
    it('calls locationService.getRoots({ level: "country" }) on create init', async () => {
      mockHttp.get.mockResolvedValueOnce(FORM_CATALOG);
      mockLocationService.getRoots.mockResolvedValueOnce(COUNTRIES);
      mockLocationService.getChildren.mockResolvedValue([]);

      await component.onInit();

      expect(mockLocationService.getRoots).toHaveBeenCalledWith({
        level: 'country',
      });
    });

    it('does NOT call /locations/tree endpoint', async () => {
      mockHttp.get.mockResolvedValueOnce(FORM_CATALOG);
      mockLocationService.getRoots.mockResolvedValueOnce(COUNTRIES);
      mockLocationService.getChildren.mockResolvedValue([]);

      await component.onInit();

      const treeCalls = mockHttp.get.mock.calls.filter(
        ([path]) => path === '/locations/tree',
      );
      expect(treeCalls).toHaveLength(0);
    });

    it('calls locationService.getChildren when country changes', async () => {
      // Initial load
      mockHttp.get.mockResolvedValueOnce(FORM_CATALOG);
      mockLocationService.getRoots.mockResolvedValueOnce(COUNTRIES);
      mockLocationService.getChildren.mockResolvedValue([]);

      await component.onInit();
      mockLocationService.getChildren.mockClear();

      // Country change triggers getChildren
      mockLocationService.getChildren.mockResolvedValueOnce(PROVINCES);

      const paisSel = document.getElementById('org-location-pais');
      paisSel.value = '1';
      paisSel.dispatchEvent(new Event('change'));

      await new Promise(setImmediate);

      expect(mockLocationService.getChildren).toHaveBeenCalledWith({
        parentId: 1,
      });
    });

    // Regression: same trap as incidencias.form.component.js — initSelect()
    // destroys the previous tom-select instance internally, and Tom
    // Select's destroy() reverts the underlying <select> to its
    // construction-time DOM snapshot. Writing fresh options BEFORE that
    // destroy (i.e. before the *next* initSelect() call) means the
    // destroy step silently wipes them. destroySelect() must run before
    // poblarSelectNativo(), not after.
    it('destroys the stale provincia tom-select instance before repopulating on país re-selection', async () => {
      mockHttp.get.mockResolvedValueOnce(FORM_CATALOG);
      mockLocationService.getRoots.mockResolvedValueOnce(COUNTRIES_2);
      mockLocationService.getChildren
        .mockResolvedValueOnce(PROVINCES)
        .mockResolvedValueOnce(PROVINCES_PERU);

      await component.onInit();

      const paisSel = document.getElementById('org-location-pais');
      const provinciaSel = document.getElementById('org-location-provincia');

      paisSel.value = '1';
      paisSel.dispatchEvent(new Event('change'));
      await new Promise(setImmediate);
      expect(Array.from(provinciaSel.options).map((o) => o.value)).toEqual(
        expect.arrayContaining(['2', '3']),
      );

      vi.mocked(destroySelect).mockClear();
      vi.mocked(initSelect).mockClear();

      // Re-select a DIFFERENT país — the scenario the user reported.
      paisSel.value = '8';
      paisSel.dispatchEvent(new Event('change'));
      await new Promise(setImmediate);

      const provinciaValues = Array.from(provinciaSel.options).map(
        (o) => o.value,
      );
      expect(provinciaValues).toEqual(expect.arrayContaining(['9']));
      expect(provinciaValues).not.toContain('2');
      expect(provinciaValues).not.toContain('3');

      const destroyOrder = vi
        .mocked(destroySelect)
        .mock.calls.map((args, i) => ({
          id: args[0],
          order: vi.mocked(destroySelect).mock.invocationCallOrder[i],
        }))
        .filter((c) => c.id === 'org-location-provincia');
      const initOrder = vi
        .mocked(initSelect)
        .mock.calls.map((args, i) => ({
          id: args[0],
          order: vi.mocked(initSelect).mock.invocationCallOrder[i],
        }))
        .filter((c) => c.id === 'org-location-provincia');

      expect(destroyOrder.length).toBeGreaterThan(0);
      expect(initOrder.length).toBeGreaterThan(0);
      expect(destroyOrder[0].order).toBeLessThan(initOrder[0].order);
    });
  });

  describe('edit mode: location_path from detail drives preselection cascade', () => {
    it('calls locationService.getRoots({ level: "country" }) in edit mode init', async () => {
      mockHttp.get
        .mockResolvedValueOnce({
          data: {
            id: 10,
            name: 'Test Org',
            location_id: 4,
            location_path: LOCATION_PATH_QUITO,
            incident_category_id: 1,
          },
        })
        .mockResolvedValueOnce(FORM_CATALOG);
      mockLocationService.getRoots.mockResolvedValueOnce(COUNTRIES);
      mockLocationService.getChildren
        .mockResolvedValueOnce(PROVINCES)
        .mockResolvedValueOnce(CITIES_PICHINCHA);

      mockRouter.queryParams = new URLSearchParams('id=10');

      await component.onInit();

      expect(mockLocationService.getRoots).toHaveBeenCalledWith({
        level: 'country',
      });
    });

    it('sets org-location input to selectedId from location_path', async () => {
      mockHttp.get
        .mockResolvedValueOnce({
          data: {
            id: 10,
            name: 'Test Org',
            location_id: 4,
            location_path: LOCATION_PATH_QUITO,
            incident_category_id: 1,
          },
        })
        .mockResolvedValueOnce(FORM_CATALOG);
      mockLocationService.getRoots.mockResolvedValueOnce(COUNTRIES);
      mockLocationService.getChildren
        .mockResolvedValueOnce(PROVINCES)
        .mockResolvedValueOnce(CITIES_PICHINCHA);

      mockRouter.queryParams = new URLSearchParams('id=10');

      await component.onInit();

      const orgLocationInput = document.getElementById('org-location');
      expect(orgLocationInput.value).toBe('4');
    });
  });
});
