const leafletMock = vi.hoisted(() => ({
  Icon: {
    Default: {
      prototype: {
        _getIconUrl: vi.fn(),
      },
      mergeOptions: vi.fn(),
    },
  },
}));

vi.mock('leaflet', () => ({ default: leafletMock }));

import loadLeaflet from './leaflet.js';

describe('loadLeaflet', () => {
  it('configures Leaflet default marker assets from the public directory', async () => {
    await loadLeaflet();

    expect(leafletMock.Icon.Default.mergeOptions).toHaveBeenCalledWith({
      iconRetinaUrl: '/leaflet/marker-icon-2x.png',
      iconUrl: '/leaflet/marker-icon.png',
      shadowUrl: '/leaflet/marker-shadow.png',
    });
    expect(leafletMock.Icon.Default.prototype._getIconUrl).toBeUndefined();
  });
});
