import { describe, expect, it, vi } from 'vitest';
import { isDesktop, mostrarEstado, mostrarToast } from './ui.js';

describe('mostrarToast', () => {
  function mountToast() {
    document.body.innerHTML = `
      <div id="toast-msg" class="toast"><span id="toast-msg-texto"></span></div>
    `;
  }

  it('sets the message text and the bg class for the given type', () => {
    mountToast();
    mostrarToast('Guardado con éxito', 'success');

    expect(document.getElementById('toast-msg-texto').textContent).toBe(
      'Guardado con éxito',
    );
    expect(document.getElementById('toast-msg').className).toContain(
      'bg-success',
    );
  });

  it('appends extra classes when provided', () => {
    mountToast();
    mostrarToast('Error', 'danger', 'position-fixed bottom-0 end-0 m-4');

    expect(document.getElementById('toast-msg').className).toContain(
      'position-fixed bottom-0 end-0 m-4',
    );
  });

  it('is a no-op when the toast element is missing', () => {
    document.body.innerHTML = '';
    expect(() => mostrarToast('mensaje', 'success')).not.toThrow();
  });
});

describe('mostrarEstado', () => {
  function mountEstados() {
    document.body.innerHTML = `
      <div id="estado-cargando"></div>
      <div id="estado-vacio" class="d-none"></div>
      <div id="estado-error" class="d-none"></div>
      <div id="contenedor-tabla" class="d-none"></div>
    `;
  }

  it('shows only the requested state and hides the rest', () => {
    mountEstados();
    mostrarEstado('tabla');

    expect(
      document.getElementById('contenedor-tabla').classList.contains('d-none'),
    ).toBe(false);
    for (const id of ['estado-cargando', 'estado-vacio', 'estado-error']) {
      expect(document.getElementById(id).classList.contains('d-none')).toBe(
        true,
      );
    }
  });

  it('tolerates missing state containers', () => {
    document.body.innerHTML = '<div id="estado-cargando"></div>';
    expect(() => mostrarEstado('vacio')).not.toThrow();
    expect(
      document.getElementById('estado-cargando').classList.contains('d-none'),
    ).toBe(true);
  });
});

describe('isDesktop', () => {
  it('reflects the min-width media query', () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true });

    expect(isDesktop()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
  });
});
