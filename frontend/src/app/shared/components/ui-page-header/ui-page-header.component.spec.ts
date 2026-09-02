import { render, screen } from '@testing-library/angular';
import { UiPageHeaderComponent } from './ui-page-header.component';

describe('UiPageHeaderComponent', () => {
  it('renders the kicker in uppercase and the title as an h1', async () => {
    await render(
      `<ui-page-header kicker="GESTIÓN / LISTADO" title="Incidencias" />`,
      { imports: [UiPageHeaderComponent] },
    );

    const kicker = screen.getByText('GESTIÓN / LISTADO');
    expect(kicker.className).toContain('uppercase');
    expect(kicker.className).toContain('text-slate-500');

    const title = screen.getByText('Incidencias').closest('h1');
    expect(title).toBeTruthy();
    expect(title?.textContent).toContain('Incidencias');
  });

  it('renders the subtitle when provided', async () => {
    await render(
      `<ui-page-header title="Incidencias" subtitle="Resumen de la última semana" />`,
      { imports: [UiPageHeaderComponent] },
    );

    expect(screen.getByText('Resumen de la última semana')).toBeTruthy();
  });
});
