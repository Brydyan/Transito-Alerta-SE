import { isTrustedProxyAddress, ipToLong, TRUSTED_PROXY_NETWORKS } from './proxy-trust';

/**
 * MAIL (sc-327) — G.2 / G.3 / G.5.
 *
 * El callback de `trust proxy` vive en `common/proxy-trust.ts` para que
 * sea directamente testeable sin levantar el `INestApplication`. El
 * contrato que verifica este spec es el que importa: la función
 * devuelve `true` SÓLO si la dirección declarada está dentro de las
 * redes internas de confianza declaradas.
 */
describe('isTrustedProxyAddress (MAIL G.1/G.2/G.3)', () => {
  describe('redes internas de Docker', () => {
    it('G.2: una IP en 10.0.0.0/8 (típica del bridge de Docker) es de confianza', () => {
      expect(isTrustedProxyAddress('10.0.0.5')).toBe(true);
      expect(isTrustedProxyAddress('10.255.255.254')).toBe(true);
    });

    it('G.2: una IP en 172.16.0.0/12 (red por defecto de docker-compose) es de confianza', () => {
      // 172.17.x.x es donde corren los contenedores del proyecto.
      expect(isTrustedProxyAddress('172.17.0.1')).toBe(true);
      expect(isTrustedProxyAddress('172.31.255.254')).toBe(true);
    });

    it('G.2: una IP en 192.168.0.0/16 es de confianza', () => {
      expect(isTrustedProxyAddress('192.168.1.1')).toBe(true);
    });

    it('localhost (127.0.0.1) es de confianza (test harness)', () => {
      expect(isTrustedProxyAddress('127.0.0.1')).toBe(true);
    });
  });

  describe('fuera de la red de confianza', () => {
    it('G.3: una IP pública NO es de confianza, ni siquiera con X-Forwarded-For', () => {
      // El caso que importa (D10): un atacante golpea APP_PORT
      // directamente con un `X-Forwarded-For: 1.2.3.4` falsificado.
      // La IP de la conexión es 1.2.3.4 — fuera de las redes internas.
      // Express NO debe leer el header y `req.ip` debe ser 1.2.3.4.
      expect(isTrustedProxyAddress('1.2.3.4')).toBe(false);
      expect(isTrustedProxyAddress('8.8.8.8')).toBe(false);
      expect(isTrustedProxyAddress('190.15.142.87')).toBe(false);
    });

    it('una IP justo afuera de 10.0.0.0/8 (11.0.0.0) NO es de confianza', () => {
      expect(isTrustedProxyAddress('11.0.0.1')).toBe(false);
    });

    it('una IP justo afuera de 172.16.0.0/12 (172.32.0.0) NO es de confianza', () => {
      // 172.32.x.x está fuera del /12. Verificar el límite.
      expect(isTrustedProxyAddress('172.32.0.1')).toBe(false);
    });
  });

  describe('entradas malformadas', () => {
    it('G.3: una IP vacía NO es de confianza (no se hace pasar por nadie)', () => {
      expect(isTrustedProxyAddress('')).toBe(false);
      expect(isTrustedProxyAddress(undefined)).toBe(false);
      expect(isTrustedProxyAddress(null)).toBe(false);
    });

    it('una cadena malformada NO es de confianza', () => {
      expect(isTrustedProxyAddress('not-an-ip')).toBe(false);
      expect(isTrustedProxyAddress('999.999.999.999')).toBe(false);
    });

    it('IPv6 NO es de confianza (la red interna es IPv4 only)', () => {
      // El helper es IPv4-only por diseño. Una conexión IPv6
      // se descarta, no se intenta hacer match contra redes
      // IPv4 (el resultado sería `false` igualmente, pero el
      // contrato está documentado).
      expect(isTrustedProxyAddress('::1')).toBe(false);
      expect(isTrustedProxyAddress('2001:db8::1')).toBe(false);
    });
  });
});

describe('ipToLong', () => {
  it('convierte una IPv4 a su entero de 32 bits', () => {
    expect(ipToLong('0.0.0.0')).toBe(0);
    expect(ipToLong('255.255.255.255')).toBe(0xffffffff);
    expect(ipToLong('192.168.1.1')).toBe(0xc0a80101);
  });

  it('devuelve 0 para una cadena malformada (defensivo)', () => {
    expect(ipToLong('not-an-ip')).toBe(0);
    expect(ipToLong('1.2.3')).toBe(0);
    expect(ipToLong('1.2.3.4.5')).toBe(0);
  });
});

describe('TRUSTED_PROXY_NETWORKS (D10 — la red interna está declarada explícitamente)', () => {
  // Test de mutación por intención: si alguien agrega una red
  // pública a `TRUSTED_PROXY_NETWORKS`, el `expect` lo
  // detecta. Mantiene la política en el mismo lugar donde
  // el código la consulta.
  it('NO contiene redes públicas (10/8, 172.16/12, 192.168/16, 127/32 son las únicas)', () => {
    expect(TRUSTED_PROXY_NETWORKS).toEqual([
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '127.0.0.1/32',
    ]);
  });
});
