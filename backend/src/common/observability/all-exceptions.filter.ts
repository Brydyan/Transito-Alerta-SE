import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { AuthContext } from '../authz/subject-scope';
import { getRequestId } from './request-context';

/** Techo por campo: una línea de log ilegible no se lee, y no leerla es no tenerla. */
const MAX_URL = 200;
const MAX_CODE = 60;

interface LoggableRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  user?: AuthContext;
}

/**
 * Filtro global de excepciones.
 *
 * El agujero que cierra: Nest loguea las excepciones que NADIE maneja,
 * pero un `HttpException` lanzado a propósito —todo 401, 403, 404, 429—
 * se serializa y sale sin dejar una sola línea. El usuario ve el error y
 * en el servidor no queda rastro. Ese era el motivo real de "no entiendo
 * los errores de staging".
 *
 * Dos reglas de las que no se mueve:
 *
 * 1. **El cuerpo de la respuesta no cambia.** Se reenvía lo que ya
 *    producía Nest, verbatim. El frontend lee `err.error.message` y
 *    `err.error.code` (`auth.service.ts:handleError`, `session-errors.ts`);
 *    reformatear acá rompería esos consumidores en silencio.
 *
 * 2. **Nunca se loguea el body ni las cabeceras.** Por `/auth/login`,
 *    `/auth/register` y `/auth/password-reset` viajan contraseñas, y por
 *    `Authorization` viaja el JWT. Un log es texto plano que se copia y
 *    se pega: lo que entra ahí, se filtró. Se loguean método, ruta,
 *    status, usuario y código de error — nada más.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<LoggableRequest>();
    const res = http.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp
      ? exception.getResponse()
      : // Un error desconocido NO se reenvía: su mensaje suele traer
        // host, puerto o credenciales de la conexión que falló. El
        // detalle va al log del servidor; al cliente, la forma estándar.
        { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };

    const line = this.describe(req, status, exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // El stack sólo acá: un 4xx es una decisión del sistema, no un
      // fallo, y su stack apunta al `throw`, que no dice nada útil.
      this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(line);
    }

    res.status(status).json(body);
  }

  private describe(req: LoggableRequest, status: number, exception: unknown): string {
    const method = req.method ?? '-';
    const url = truncate(req.originalUrl ?? req.url ?? '-', MAX_URL);
    // `anon` y no `-`: distingue "no había sesión" de "no se pudo leer".
    const user = req.user?.userId ?? 'anon';
    const requestId = getRequestId() ?? 'sin-req-id';
    const code = this.domainCode(exception);

    return `${status} ${method} ${url} user=${user} req=${requestId}${code ? ` code=${code}` : ''}`;
  }

  /**
   * El `code` de dominio (`SESSION_REVOKED`, `SESSION_REUSE_DETECTED`,
   * `REGISTRATION_RATE_LIMITED`…) es lo que de verdad identifica el
   * fallo — mucho más que el 401 que comparten todos.
   */
  private domainCode(exception: unknown): string | null {
    if (!(exception instanceof HttpException)) return null;
    const payload = exception.getResponse();
    if (typeof payload !== 'object' || payload === null) return null;
    const code = (payload as { code?: unknown }).code;
    return typeof code === 'string' ? truncate(code, MAX_CODE) : null;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
