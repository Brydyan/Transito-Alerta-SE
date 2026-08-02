/**
 * Renders Bootstrap 5 pagination with sliding window of 5 pages.
 *
 * Controls: «« (first)  « (prev)  [1][2][3][4][5]  » (next)  »» (last)
 * Max 5 page numbers visible at a time, window slides with current page.
 *
 * @param {HTMLElement} ulElement
 * @param {number}      paginaActual  - 1-based current page
 * @param {number}      totalPaginas
 * @param {function}    onPageChange  - called with target page number
 */
export function renderPaginacion(
  ulElement,
  paginaActual,
  totalPaginas,
  onPageChange,
) {
  ulElement.innerHTML = '';
  if (!totalPaginas || totalPaginas <= 1) return;

  const VENTANA = 5;

  // Sliding window: center on current page, clamp to valid range
  let inicio = Math.max(1, paginaActual - Math.floor(VENTANA / 2));
  let fin = inicio + VENTANA - 1;
  if (fin > totalPaginas) {
    fin = totalPaginas;
    inicio = Math.max(1, fin - VENTANA + 1);
  }

  function crearItem(texto, targetPage, disabled, active) {
    const li = document.createElement('li');
    li.className =
      'page-item' + (disabled ? ' disabled' : '') + (active ? ' active' : '');

    const a = document.createElement('a');
    a.className = 'page-link';
    a.href = 'javascript:void(0)';
    a.textContent = texto;

    if (disabled) {
      a.setAttribute('tabindex', '-1');
      a.setAttribute('aria-disabled', 'true');
      a.style.pointerEvents = 'none';
    } else if (!active) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (targetPage >= 1 && targetPage <= totalPaginas) {
          onPageChange(targetPage);
        }
      });
    }

    li.appendChild(a);
    return li;
  }

  const enPrimera = paginaActual === 1;
  const enUltima = paginaActual === totalPaginas;

  ulElement.appendChild(crearItem('««', 1, enPrimera, false));
  ulElement.appendChild(crearItem('«', paginaActual - 1, enPrimera, false));

  for (let p = inicio; p <= fin; p++) {
    ulElement.appendChild(crearItem(String(p), p, false, p === paginaActual));
  }

  ulElement.appendChild(crearItem('»', paginaActual + 1, enUltima, false));
  ulElement.appendChild(crearItem('»»', totalPaginas, enUltima, false));
}
