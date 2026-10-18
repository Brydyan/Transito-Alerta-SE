import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
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
/**
 * 2026-10-18 — mapea excepciones no-HTTP a una forma uniforme antes
 * del branch principal del filtro. Hoy solo cubre `MulterError`
 * (multer 2.x emite errores de validación de upload como
 * `MulterError`, no como `HttpException`); si en el futuro otras
 * librerías externas lanzan errores propios, esta función es el
 * punto único donde normalizarlos.
 *
 * Mantenida fuera de la clase como función pura (sin `this`) para
 * que sea fácil de testear aislada.
 */
function normalizeException(exception: unknown): unknown {
  if (exception instanceof Error && exception.name === 'MulterError') {
    return new BadRequestException({
      code: 'UPLOAD_VALIDATION_FAILED',
      // Mensaje crudo de multer: 'Too many files', 'Unexpected
      // file field', 'File too large', etc. Lo reenviamos al
      // cliente porque describe exactamente qué falló en la
      // subida — sin info sensible (no incluye paths ni bytes).
      message: exception.message,
    });
  }
  return exception;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<LoggableRequest>();
    const res = http.getResponse<Response>();

    // 2026-10-18 — `multer` 2.x lanza `MulterError` (no
    // `HttpException`) cuando excede `maxCount`, cuando un campo
    // file es unexpected, cuando el MIME no matchea `fileFilter`,
    // etc. Antes (multer 1.x) varios de estos casos terminaban
    // como `BadRequestException` y los e2e tests esperaban 400/422.
    // multer 2.x los emite como `MulterError`; el filtro los
    // trataba como "error desconocido" → 500. Mapeamos a
    // BadRequestException antes del branch de HttpException para
    // que el resto del manejo (logging, response shape) siga
    // uniforme.
    const normalized = normalizeException(exception);

    const isHttp = normalized instanceof HttpException;
    const status = isHttp ? normalized.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp
      ? normalized.getResponse()
      : // Un error desconocido NO se reenvía: su mensaje suele traer
        // host, puerto o credenciales de la conexión que falló. El
        // detalle va al log del servidor; al cliente, la forma estándar.
        { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };

    const line = this.describe(req, status, normalized);

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
