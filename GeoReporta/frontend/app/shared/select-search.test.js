import {
  clearSelect,
  destroyAll,
  destroySelect,
  getSelect,
  initSelect,
  updateSelectOptions,
} from './select-search.js';

function createTomSelectMock() {
  return vi.fn(function TomSelectMock(element, config) {
    this.element = element;
    this.config = config;
    this.dropdown = document.createElement('div');
    this.clearOptions = vi.fn();
    this.addOptions = vi.fn();
    this.clear = vi.fn();
    this.setValue = vi.fn();
    this.refreshOptions = vi.fn();
    this.destroy = vi.fn();
    this.setActive = vi.fn();
    element.tomselect = this;
  });
}

describe('select-search helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="city">
        <option value="">Select a city</option>
      </select>
      <select id="country">
        <option value="">Select a country</option>
      </select>
    `;
    globalThis.TomSelect = createTomSelectMock();
  });

  afterEach(() => {
    destroyAll();
    globalThis.TomSelect = undefined;
  });

  it('initializes and updates a select instance', () => {
    const instance = initSelect('city', { placeholder: 'Search city' });

    expect(instance).toBeDefined();
    expect(getSelect('city')).toBe(instance);

    updateSelectOptions(
      'city',
      [
        { value: 1, text: 'Quito' },
        { id: 2, name: 'Guayaquil' },
      ],
      2,
    );

    expect(instance.clearOptions).toHaveBeenCalledTimes(1);
    expect(instance.addOptions).toHaveBeenCalledWith([
      { value: '1', text: 'Quito' },
      { value: '2', text: 'Guayaquil' },
    ]);
    expect(instance.setValue).toHaveBeenCalledWith('2', true);
    expect(instance.refreshOptions).toHaveBeenCalledTimes(1);
  });

  it('wraps a disabled select too, so dependent cascade fields render as a tom-select box before their parent is picked', () => {
    document.getElementById('city').setAttribute('disabled', '');

    const instance = initSelect('city', { placeholder: 'Buscar ciudad...' });

    expect(instance).toBeDefined();
    expect(document.getElementById('city').tomselect).toBe(instance);
  });

  it('clears and destroys instances', () => {
    const instance = initSelect('country');

    clearSelect('country');
    expect(instance.clear).toHaveBeenCalledTimes(1);

    destroySelect('country');
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(getSelect('country')).toBeNull();
  });
});
