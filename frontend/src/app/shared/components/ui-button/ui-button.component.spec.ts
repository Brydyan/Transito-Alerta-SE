import { render, screen } from '@testing-library/angular';
import { UiButtonComponent } from './ui-button.component';

describe('UiButtonComponent', () => {
  it('applies the primary variant classes by default', async () => {
    await render(
      `<button uiButton>Aceptar</button>`,
      { imports: [UiButtonComponent] },
    );

    const btn = screen.getByRole('button', { name: 'Aceptar' });
    expect(btn.className).toContain('bg-brand-primary');
    expect(btn.className).toContain('text-white');
  });

  it('applies the secondary variant classes when requested', async () => {
    await render(
      `<button uiButton variant="secondary">Cancelar</button>`,
      { imports: [UiButtonComponent] },
    );

    const btn = screen.getByRole('button', { name: 'Cancelar' });
    expect(btn.className).toContain('bg-bg-secondary');
    expect(btn.className).toContain('border-border-subtle');
  });

  it('applies the ghost variant classes when requested', async () => {
    await render(
      `<button uiButton variant="ghost">Volver</button>`,
      { imports: [UiButtonComponent] },
    );

    const btn = screen.getByRole('button', { name: 'Volver' });
    expect(btn.className).toContain('bg-transparent');
  });

  it('disables itself when loading', async () => {
    await render(
      `<button uiButton [loading]="true">Guardar</button>`,
      { imports: [UiButtonComponent] },
    );

    const btn = screen.getByRole('button', { name: /Guardar/ });
    expect(btn.getAttribute('disabled')).not.toBeNull();
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });
});
