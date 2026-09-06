import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { runWithRequestId } from './request-context';
import { AuthContext } from '../authz/subject-scope';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let sent: { status?: number; body?: unknown };

  const USER: AuthContext = {
    userId: 'user-1',
    permissions: [],
    organizationId: 'org-1',
    roleName: 'admin_org',
    scope: { kind: 'org', organizationId: 'org-1' },
    sessionId: 'sid-1',
    isAnonymous: false,
  };

  function hostFor(req: Record<string, unknown>): ArgumentsHost {
    sent = {};
    const res = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      json(body: unknown) {
        sent.body = body;
        return this;
      },
    };
    return {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ───── El agujero que cierra el filtro ─────

  it('loguea un 403 que hoy no dejaba ninguna línea', () => {
    filter.catch(
      new ForbiddenException('Sin permiso'),
      hostFor({ method: 'DELETE', originalUrl: '/api/incidents/i-1', user: USER }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0][0] as string;
    expect(line).toContain('DELETE');
    expect(line).toContain('/api/incidents/i-1');
    expect(line).toContain('403');
    expect(line).toContain('user-1');
  });

  it('incluye el request-id activo, que es lo que ata el reporte del usuario al log', () => {
    runWithRequestId('req-abc', () => {
      filter.catch(
        new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'nope' }),
        hostFor({ method: 'GET', originalUrl: '/api/auth/me' }),
      );
    });

    expect(warn.mock.calls[0][0]).toContain('req-abc');
  });

  it('saca el `code` del cuerpo de la excepción — es el error de dominio real', () => {
    filter.catch(
      new UnauthorizedException({ code: 'SESSION_REUSE_DETECTED', message: 'reuso' }),
      hostFor({ method: 'POST', originalUrl: '/api/auth/refresh' }),
    );

    expect(warn.mock.calls[0][0]).toContain('SESSION_REUSE_DETECTED');
  });

  it('marca como anónima la petición sin usuario, sin romperse', () => {
    filter.catch(
      new ForbiddenException(),
      hostFor({ method: 'GET', originalUrl: '/api/menus/my' }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('anon');
  });

  // ───── Severidad ─────

  it('un 4xx es warn, no error — no es un fallo del servidor', () => {
    filter.catch(new ForbiddenException(), hostFor({ method: 'GET', originalUrl: '/api/x' }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('un 5xx es error y lleva stack', () => {
    filter.catch(new Error('se cayó'), hostFor({ method: 'GET', originalUrl: '/api/x' }));

    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error.mock.calls[0][0]).toContain('500');
    expect(error.mock.calls[0][1]).toContain('se cayó'); // el stack
  });

  // ───── Secretos: la regla que no se negocia ─────

  it('NUNCA loguea el cuerpo de la petición — ahí viajan las contraseñas', () => {
    filter.catch(
      new UnauthorizedException('Invalid email or password'),
      hostFor({
        method: 'POST',
        originalUrl: '/api/auth/login',
        body: { email: 'a@b.com', password: 'SuperSecreta123' },
      }),
    );

    const emitido = JSON.stringify(warn.mock.calls);
    expect(emitido).not.toContain('SuperSecreta123');
    expect(emitido).not.toContain('a@b.com');
  });

  it('NUNCA loguea cabeceras — ahí viaja el Bearer', () => {
    filter.catch(
      new ForbiddenException(),
      hostFor({
        method: 'GET',
        originalUrl: '/api/x',
        headers: { authorization: 'Bearer jwt.secreto.aca', cookie: 'sesion=abc' },
      }),
    );

    const emitido = JSON.stringify(warn.mock.calls);
    expect(emitido).not.toContain('jwt.secreto.aca');
    expect(emitido).not.toContain('sesion=abc');
  });

  it('recorta la URL para que un query gigante no reviente la línea de log', () => {
    filter.catch(
      new ForbiddenException(),
      hostFor({ method: 'GET', originalUrl: `/api/x?q=${'y'.repeat(500)}` }),
    );

    expect((warn.mock.calls[0][0] as string).length).toBeLessThan(400);
  });

  // ───── El contrato de respuesta NO cambia ─────

  it('reenvía el cuerpo de un HttpException tal cual — el frontend lee `code` y `message`', () => {
    filter.catch(
      new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session has been revoked' }),
      hostFor({ method: 'GET', originalUrl: '/api/auth/me' }),
    );

    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ code: 'SESSION_REVOKED', message: 'Session has been revoked' });
  });

  it('conserva la forma estándar de Nest para un HttpException con mensaje suelto', () => {
    filter.catch(
      new ForbiddenException('Sin permiso'),
      hostFor({ method: 'GET', originalUrl: '/api/x' }),
    );

    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({ statusCode: 403, message: 'Sin permiso' });
  });

  it('un error desconocido sale como 500 genérico, sin filtrar el mensaje interno', () => {
    filter.catch(
      new Error('connection to 10.0.0.5:5432 refused, password=hunter2'),
      hostFor({ method: 'GET', originalUrl: '/api/x' }),
    );

    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(sent.body)).not.toContain('hunter2');
    expect(JSON.stringify(sent.body)).not.toContain('10.0.0.5');
  });

  it('respeta el status de un HttpException con status no estándar (429)', () => {
    filter.catch(
      new HttpException({ code: 'REGISTRATION_RATE_LIMITED', message: 'Probá en una hora.' }, 429),
      hostFor({ method: 'POST', originalUrl: '/api/auth/register' }),
    );

    expect(sent.status).toBe(429);
    expect(sent.body).toEqual({
      code: 'REGISTRATION_RATE_LIMITED',
      message: 'Probá en una hora.',
    });
  });
});
