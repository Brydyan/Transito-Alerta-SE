import { ConsoleLogger } from '@nestjs/common';

import { getRequestId } from './request-context';

/**
 * `ConsoleLogger` que antepone el id de la petición en curso.
 *
 * Sin esto el request-id sólo aparecería en la línea del filtro de
 * excepciones, y el valor está justo en lo contrario: que las líneas que
 * ya escriben los servicios —`AuthService` logueando
 * `SESSION_USER_MISMATCH`, un aviso de TypeORM, lo que sea— queden
 * atadas a la misma petición. Con tráfico concurrente en staging, es la
 * diferencia entre leer el log y adivinar.
 *
 * Se etiqueta el MENSAJE y no el `context` de Nest a propósito: el
 * context es el nombre de la clase (`AuthService`), lo mismo para todas
 * las peticiones, y pisarlo perdería de dónde salió la línea.
 */
export class RequestIdLogger extends ConsoleLogger {
  log(message: unknown, ...rest: unknown[]): void {
    super.log(this.tag(message), ...(rest as []));
  }

  warn(message: unknown, ...rest: unknown[]): void {
    super.warn(this.tag(message), ...(rest as []));
  }

  error(message: unknown, ...rest: unknown[]): void {
    super.error(this.tag(message), ...(rest as []));
  }

  debug(message: unknown, ...rest: unknown[]): void {
    super.debug(this.tag(message), ...(rest as []));
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(this.tag(message), ...(rest as []));
  }

  /**
   * Sólo se etiquetan strings. Un objeto lo serializa Nest con su propio
   * formato; anteponerle texto lo convertiría en una cadena y se
   * perdería ese formato.
   */
  private tag(message: unknown): unknown {
    const requestId = getRequestId();
    if (!requestId || typeof message !== 'string') {
      return message;
    }
    return `[req=${requestId}] ${message}`;
  }
}
