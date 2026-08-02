/**
 * Shared Leaflet loader.
 *
 * Imports Leaflet from the npm dependency so it gets bundled by Vite,
 * avoiding CDN issues in restrictive browsers (Chrome blocking dynamic
 * CDN scripts, etc.).
 *
 * The exported function returns a resolved promise so callers that await
 * `loadLeaflet()` before doing `L.map(...)` keep working unchanged.
 * This is idempotent — subsequent calls return immediately.
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

let loaded = false;

export default function loadLeaflet() {
  if (loaded) return Promise.resolve();
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  });
  loaded = true;
  window.L = L;
  return Promise.resolve();
}
