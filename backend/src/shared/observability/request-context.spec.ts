import { getRequestId, runWithRequestId } from './request-context';

describe('RequestContext', () => {
  it('devuelve undefined fuera de toda petición', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('expone el id dentro del callback', () => {
    runWithRequestId('req-1', () => {
      expect(getRequestId()).toBe('req-1');
    });
  });

  it('sobrevive a un await — el punto de usar AsyncLocalStorage', async () => {
    await runWithRequestId('req-2', async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getRequestId()).toBe('req-2');
    });
  });

  /**
   * La razón de ser del contexto: dos peticiones concurrentes tienen que
   * quedar separadas en el log. Una variable de módulo las mezclaría —
   * la segunda pisaría a la primera antes de que la primera terminara.
   */
  it('no mezcla dos contextos concurrentes', async () => {
    const seen: string[] = [];

    const slow = runWithRequestId('req-lento', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      seen.push(`lento:${getRequestId()}`);
    });

    const fast = runWithRequestId('req-rapido', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(`rapido:${getRequestId()}`);
    });

    await Promise.all([slow, fast]);

    expect(seen).toEqual(['rapido:req-rapido', 'lento:req-lento']);
  });

  it('restaura el contexto exterior al salir de uno anidado', () => {
    runWithRequestId('exterior', () => {
      runWithRequestId('interior', () => {
        expect(getRequestId()).toBe('interior');
      });
      expect(getRequestId()).toBe('exterior');
    });
  });
});
