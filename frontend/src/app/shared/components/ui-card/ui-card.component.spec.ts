import { render, screen } from '@testing-library/angular';
import { UiCardComponent } from './ui-card.component';

describe('UiCardComponent', () => {
  it('renders title and subtitle when provided', async () => {
    await render(
      `<ui-card title="Incidencias" subtitle="Última semana">
         <p>contenido</p>
       </ui-card>`,
      { imports: [UiCardComponent] },
    );

    expect(screen.getByText('Incidencias')).toBeTruthy();
    expect(screen.getByText('Última semana')).toBeTruthy();
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it('omits the header block when no title is provided', async () => {
    const { container } = await render(
      `<ui-card><p>contenido</p></ui-card>`,
      { imports: [UiCardComponent] },
    );

    expect(container.querySelector('h3')).toBeNull();
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it('uses rounded-xl and a subtle border', async () => {
    const { container } = await render(
      `<ui-card title="t"><p>c</p></ui-card>`,
      { imports: [UiCardComponent] },
    );

    const article = container.querySelector('article');
    expect(article?.className).toContain('rounded-xl');
    expect(article?.className).toContain('border-border-subtle');
    expect(article?.className).toContain('bg-bg-secondary');
  });
});
