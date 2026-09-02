import { render, screen } from '@testing-library/angular';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule, CircleDot, AlertTriangle, Search } from 'lucide-angular';
import { UiIconComponent } from './ui-icon.component';

const ICONS = { CircleDot, AlertTriangle, Search };

describe('UiIconComponent', () => {
  it('renders the requested icon as inline SVG when the name is registered', async () => {
    const { container } = await render(`<ui-icon name="alert-triangle" />`, {
      imports: [UiIconComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(ICONS))],
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.children.length ?? 0).toBeGreaterThan(0);
  });

  it('falls back to a circle-dot SVG for an unknown name and never renders the raw name as text', async () => {
    const { container } = await render(`<ui-icon name="does-not-exist" />`, {
      imports: [UiIconComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(ICONS))],
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // F0.5.2 — blinda el defecto que imprimía `alert-triangle` literal en pantalla.
    expect(container.textContent).not.toContain('does-not-exist');
    expect(screen.queryByText('does-not-exist')).toBeNull();
  });

  it('renders the fallback SVG even when no icon provider is provided', async () => {
    const { container } = await render(`<ui-icon name="anything" />`, {
      imports: [UiIconComponent],
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // Sin provider, el respaldo circle-dot es un <circle> doble.
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
  });

  it('respects the size input by setting width/height on the SVG', async () => {
    const { container } = await render(`<ui-icon name="search" [size]="32" />`, {
      imports: [UiIconComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(ICONS))],
    });

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });

  it('respects the strokeWidth input', async () => {
    const { container } = await render(`<ui-icon name="search" [strokeWidth]="3" />`, {
      imports: [UiIconComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(ICONS))],
    });

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('3');
  });
});
