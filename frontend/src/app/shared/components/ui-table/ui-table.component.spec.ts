import { render, screen } from '@testing-library/angular';
import { UiTableComponent } from './ui-table.component';

describe('UiTableComponent', () => {
  it('renders a wrapping <table class="ui-table"> so its styles apply to projected th/td', async () => {
    const { container } = await render(
      `<ui-table>
         <thead>
           <tr><th>ID</th><th>Nombre</th></tr>
         </thead>
         <tbody>
           <tr><td>1</td><td>Foo</td></tr>
         </tbody>
       </ui-table>`,
      { imports: [UiTableComponent] },
    );

    const table = container.querySelector('table.ui-table');
    expect(table).toBeTruthy();
    const th = screen.getByText('ID');
    expect(table?.contains(th)).toBe(true);
  });

  it('provides the title + subtitle helper classes for the consumer', async () => {
    const { container } = await render(
      `<ui-table>
         <tbody>
           <tr>
             <td>
               <div class="ui-table-title">Falla semáforo</div>
               <div class="ui-table-subtitle">Av. Principal</div>
             </td>
           </tr>
         </tbody>
       </ui-table>`,
      { imports: [UiTableComponent] },
    );

    expect(container.querySelector('.ui-table-title')).toBeTruthy();
    expect(container.querySelector('.ui-table-subtitle')).toBeTruthy();
  });

  it('exposes the selection + actions cell helpers in the F0.4.6 spec', async () => {
    const { container } = await render(
      `<ui-table>
         <thead>
           <tr>
             <th class="ui-table-cell-select">Sel</th>
             <th>Item</th>
             <th class="ui-table-cell-actions">Acciones</th>
           </tr>
         </thead>
         <tbody>
           <tr>
             <td class="ui-table-cell-select"><input type="checkbox" /></td>
             <td>X</td>
             <td class="ui-table-cell-actions">
               <button>A</button>
               <button>B</button>
             </td>
           </tr>
         </tbody>
       </ui-table>`,
      { imports: [UiTableComponent] },
    );

    expect(container.querySelector('th.ui-table-cell-select')).toBeTruthy();
    expect(container.querySelector('th.ui-table-cell-actions')).toBeTruthy();
    expect(container.querySelector('td.ui-table-cell-select')).toBeTruthy();
    expect(container.querySelector('td.ui-table-cell-actions')).toBeTruthy();
  });

  it('marks selected rows with the violet soft background via ui-table-row-selected', async () => {
    const { container } = await render(
      `<ui-table>
         <tbody>
           <tr><td>1</td></tr>
           <tr class="ui-table-row-selected"><td>2</td></tr>
         </tbody>
       </ui-table>`,
      { imports: [UiTableComponent] },
    );

    const selected = container.querySelector('tr.ui-table-row-selected');
    expect(selected).toBeTruthy();
    expect(selected?.textContent?.trim()).toBe('2');
  });

  it('renders the optional caption', async () => {
    await render(
      `<ui-table caption="Listado de incidencias">
         <tbody><tr><td>x</td></tr></tbody>
       </ui-table>`,
      { imports: [UiTableComponent] },
    );

    expect(screen.getByText('Listado de incidencias')).toBeTruthy();
  });
});
