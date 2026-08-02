/**
 * initMapView — shared Leaflet map initialization.
 *
 * Loads Leaflet via the existing `loadLeaflet()` lazy loader, mounts the
 * map at the given container, attaches the OSM tile layer, and wires the
 * a11y live-region for lat/lng status if the corresponding DOM elements
 * exist. Returns a small handle for the caller to manage markers.
 *
 * @param {object} options
 * @param {string} options.container — required, element id for L.map()
 * @param {{lat: number, lng: number}} options.center — required
 * @param {number} [options.zoom=13]
 * @param {boolean} [options.liveInputs=true] — wire lat/lng inputs + status region
 * @param {string} [options.tileUrl] — override tile layer URL (defaults to OSM)
 * @param {string} [options.attribution] — override attribution HTML
 * @param {string} [options.errorClass] — class for the fallback error div
 *   (default: 'map-view-error'). Call sites with their own CSS for a
 *   `.foo-map-error` class can override to preserve visual styling.
 * @returns {Promise<{ map: any, remove: () => void }>}
 */
export default async function initMapView({
  container,
  center,
  zoom = 13,
  liveInputs = true,
  tileUrl,
  attribution,
  errorClass = 'map-view-error',
}) {
  const containerEl =
    typeof container === 'string'
      ? document.getElementById(container)
      : container;
  if (!containerEl) {
    return { map: null, remove: () => {} };
  }

  // Dynamic import keeps this helper self-contained: callers don't need
  // to also import `loadLeaflet` just to get the init flow.
  try {
    const { default: loadLeaflet } = await import('./leaflet.js');
    await loadLeaflet();
  } catch {
    containerEl.innerHTML = `<div class="${errorClass}">No se pudo cargar el mapa</div>`;
    return { map: null, remove: () => {} };
  }

  const map = L.map(container).setView([center.lat, center.lng], zoom);

  L.tileLayer(tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      attribution ||
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  if (liveInputs) {
    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    const mapStatus = document.getElementById('map-status');

    if (!latInput && !lngInput && !mapStatus) {
      console.debug(
        '[initMapView] liveInputs=true but #lat, #lng, #map-status are missing; skipping a11y wiring',
      );
    } else {
      const updateMapA11y = () => {
        const c = map.getCenter();
        const lat = c.lat.toFixed(6);
        const lng = c.lng.toFixed(6);
        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (mapStatus) {
          mapStatus.textContent = `Coordenadas actuales: ${lat}, ${lng}.`;
        }
      };
      map.on('moveend', updateMapA11y);
      updateMapA11y();
    }
  }

  // Guard: only invalidate once the map container is actually visible.
  // Leaflet's _leaflet_pos is undefined if the pane isn't in the layout yet,
  // which happens often in production with lazy bundles and slower networks.
  const tryInvalidate = () => {
    if (removed || !map) return;
    const pane = map.getPane?.('mapPane');
    if (!pane || pane.clientWidth === 0) {
      // Not yet visible — retry on next frame, but give up after 5 attempts
      if (!map._invalidatingRetry) map._invalidatingRetry = 0;
      if (map._invalidatingRetry++ < 5) {
        requestAnimationFrame(tryInvalidate);
      }
      return;
    }
    map.invalidateSize();
  };
  requestAnimationFrame(tryInvalidate);

  // Re-invalidate when the map container is resized (e.g. viewport change
  // reflows the grid). Without this, tiles can render with grey/empty bands
  // after crossing a CSS breakpoint.
  //
  // The observer AND a `removed` flag are closure-scoped so the returned
  // `remove()` can:
  //   1) disconnect the observer synchronously (per the ResizeObserver
  //      spec, no further callbacks fire after disconnect returns), AND
  //   2) guard against the (small) chance a callback already queued in a
  //      microtask fires against a torn-down Leaflet instance — Leaflet's
  //      `Map.remove()` detaches DOM panes and clears layers but does not
  //      expose a public "is-removed" predicate, so we use our own flag.
  let removed = false;
  let resizeObserver;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (removed) return;
      map.invalidateSize();
    });
    resizeObserver.observe(containerEl);
  }

  return {
    map,
    remove: () => {
      removed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (map) {
        map.remove();
      }
    },
  };
}
