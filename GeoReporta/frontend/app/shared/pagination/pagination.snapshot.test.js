import { renderPaginacion } from './pagination.js';

describe('renderPaginacion snapshot', () => {
  it('matches the expected markup for a middle page', () => {
    const element = document.createElement('ul');

    renderPaginacion(element, 3, 6, vi.fn());

    expect(element.innerHTML).toMatchInlineSnapshot(`
      "<li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">««</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">«</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">1</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">2</a></li><li class=\"page-item active\"><a class=\"page-link\" href=\"javascript:void(0)\">3</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">4</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">5</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">»</a></li><li class=\"page-item\"><a class=\"page-link\" href=\"javascript:void(0)\">»»</a></li>"
    `);
  });
});
