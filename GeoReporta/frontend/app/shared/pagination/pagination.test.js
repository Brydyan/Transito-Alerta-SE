import { renderPaginacion } from './pagination.js';

describe('renderPaginacion', () => {
  it('renders the sliding window and triggers page changes', () => {
    const element = document.createElement('ul');
    const onPageChange = vi.fn();

    renderPaginacion(element, 3, 10, onPageChange);

    expect(
      [...element.querySelectorAll('.page-link')].map(
        (link) => link.textContent,
      ),
    ).toEqual(['««', '«', '1', '2', '3', '4', '5', '»', '»»']);

    element
      .querySelectorAll('.page-link')[5]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables navigation when there is only one page', () => {
    const element = document.createElement('ul');

    renderPaginacion(element, 1, 1, vi.fn());

    expect(element.innerHTML).toBe('');
  });
});
