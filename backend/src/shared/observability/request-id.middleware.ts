import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { runWithRequestId } from './request-context';

/** Nombre estándar de facto; nginx y la mayoría de los proxies ya lo usan. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Un id entrante lo escribe el cliente: es texto no confiable.
 *
 * Sin filtro, un `\n` en el header inyecta una línea falsa en el log
 * (log injection), y un valor de 10 KB hace ilegible cada línea de esa
 * petición. Sólo se acepta un token corto y plano; cualquier otra cosa
 * se descarta en silencio y se genera uno propio — rechazar la petición
 * castigaría al usuario por algo que probablemente puso un proxy.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

    // Se reutiliza el id entrante cuando es limpio: así una petición
    // conserva el mismo id al atravesar nginx y el backend, y el
    // usuario puede reportar UN id que aparece en todos lados.
    const requestId =
      typeof candidate === 'string' && SAFE_REQUEST_ID.test(candidate)
        ? candidate
        : randomUUID();

    // Devuelto SIEMPRE, también en las respuestas correctas: si algo se
    // ve raro en el navegador, el id ya está en la pestaña de red sin
    // tener que reproducir el fallo.
    res.setHeader(REQUEST_ID_HEADER, requestId);

    runWithRequestId(requestId, () => next());
  }
}
