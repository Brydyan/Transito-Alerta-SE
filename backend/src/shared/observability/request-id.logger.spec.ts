import { RequestIdLogger } from './request-id.logger';
import { runWithRequestId } from './request-context';

describe('RequestIdLogger', () => {
  let logger: RequestIdLogger;
  let written: string[];

  beforeEach(() => {
    logger = new RequestIdLogger();
    written = [];
    // `ConsoleLogger` termina en process.stdout/stderr; interceptamos ahí
    // para comprobar el texto REAL que sale, no una capa intermedia.
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('etiqueta la línea con el request-id activo', () => {
    runWithRequestId('req-77', () => {
      logger.log('sesión rotada', 'AuthService');
    });

    expect(written.join('')).toContain('[req=req-77]');
    expect(written.join('')).toContain('sesión rotada');
  });

  it('etiqueta también warn y error', () => {
    runWithRequestId('req-88', () => {
      logger.warn('algo raro');
      logger.error('se cayó');
    });

    const salida = written.join('');
    expect(salida.match(/\[req=req-88\]/g)).toHaveLength(2);
  });

  /**
   * Fuera de una petición no hay id: el arranque, las tareas de
   * `@nestjs/schedule` y los consumidores de eventos loguean igual. Una
   * etiqueta vacía o un `[req=undefined]` sería ruido en cada línea.
   */
  it('no etiqueta nada fuera de una petición', () => {
    logger.log('API listening on :3001');

    const salida = written.join('');
    expect(salida).toContain('API listening');
    expect(salida).not.toContain('[req=');
  });

  it('deja pasar un mensaje que no es string sin romperse', () => {
    runWithRequestId('req-99', () => {
      logger.log({ evento: 'incidencia_creada', id: 'i-1' });
    });

    expect(written.join('')).toContain('incidencia_creada');
  });

  it('respeta el nivel configurado — un nivel apagado no escribe', () => {
    const soloError = new RequestIdLogger();
    soloError.setLogLevels(['error']);

    runWithRequestId('req-00', () => {
      soloError.log('esto no debería salir');
    });

    expect(written.join('')).not.toContain('esto no debería salir');
  });
});
