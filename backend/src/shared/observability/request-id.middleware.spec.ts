import type { Request, Response } from 'express';

import { REQUEST_ID_HEADER, RequestIdMiddleware } from './request-id.middleware';
import { getRequestId } from './request-context';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  function makeReq(headers: Record<string, string> = {}): Request {
    return { headers } as unknown as Request;
  }

  function makeRes(): { res: Response; headers: Record<string, string> } {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as Response;
    return { res, headers };
  }

  it('genera un id cuando la petición no trae ninguno', () => {
    const req = makeReq();
    const { res, headers } = makeRes();
    let seen: string | undefined;

    middleware.use(req, res, () => {
      seen = getRequestId();
    });

    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers[REQUEST_ID_HEADER]).toBe(seen);
  });

  it('reutiliza el id entrante — así se atraviesan varios servicios', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: 'id-del-cliente' });
    const { res, headers } = makeRes();
    let seen: string | undefined;

    middleware.use(req, res, () => {
      seen = getRequestId();
    });

    expect(seen).toBe('id-del-cliente');
    expect(headers[REQUEST_ID_HEADER]).toBe('id-del-cliente');
  });

  /**
   * El header entrante lo escribe el cliente: es texto no confiable. Sin
   * techo ni filtro, un id de 10 KB o con saltos de línea entra al log —
   * y un salto de línea en un log es una línea falsa inyectada.
   */
  it('descarta un id entrante malformado y genera uno propio', () => {
    for (const sucio of ['con espacio', 'salto\nlinea', 'x'.repeat(200), '', '  ']) {
      const req = makeReq({ [REQUEST_ID_HEADER]: sucio });
      const { res } = makeRes();
      let seen: string | undefined;

      middleware.use(req, res, () => {
        seen = getRequestId();
      });

      expect(seen).not.toBe(sucio);
      expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('acepta un id entrante limpio aunque no sea un uuid', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: 'trace-abc123' });
    const { res } = makeRes();
    let seen: string | undefined;

    middleware.use(req, res, () => {
      seen = getRequestId();
    });

    expect(seen).toBe('trace-abc123');
  });

  it('da un id distinto a cada petición sin header', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const { res } = makeRes();
      middleware.use(makeReq(), res, () => {
        ids.add(getRequestId()!);
      });
    }
    expect(ids.size).toBe(5);
  });
});
