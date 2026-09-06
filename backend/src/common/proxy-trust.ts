/**
 * MAIL (sc-327) — G.1 (D10): confianza en el proxy acotada
 * por DIRECCIÓN, no por número de saltos. La red interna
 * de Docker (172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16) es
 * donde está nginx; cualquier otro origen se descarta, así
 * que una petición directa al backend con un X-Forwarded-For
 * falsificado NO se hace pasar por la IP declarada.
 *
 * NO usamos `true` (confía en cualquiera) ni `1` (supone un
 * solo proxy y falla en silencio hacia el lado inseguro
 * cuando se agrega un balanceador). La dirección se declara
 * como función para que Express evalúe el request.
 *
 * Extraído de `main.ts` a un módulo separado para que
 * G.2/G.3/G.4/G.5 puedan probarlo en aislamiento: Express
 * evalúa la función que recibe como `trust proxy`, pero el
 * contrato — «devuelve `true` sólo si la IP está en una
 * red interna de confianza» — es lo que el test verifica.
 * Sin la extracción, el callback vivía como closure dentro
 * de `bootstrap()` y no era alcanzable desde un spec.
 */
export const TRUSTED_PROXY_NETWORKS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.1/32',
] as const;

/**
 * IPv4-only: la red interna de Docker del proyecto es
 * IPv4. `parseInt` con NaN → 0 evita que una dirección
 * malformada haga match por accidente; los bits altos de
 * un NaN-derived 0 no se solapan con ninguna de las redes
 * declaradas.
 */
export function ipToLong(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return (
    ((Number(parts[0]) << 24) |
      (Number(parts[1]) << 16) |
      (Number(parts[2]) << 8) |
      Number(parts[3])) >>>
    0
  );
}

/**
 * Devuelve `true` si la IP declarada está dentro de
 * `TRUSTED_PROXY_NETWORKS`, `false` en cualquier otro
 * caso (incluida IP vacía, IPv6 o CIDR desconocido).
 *
 * Es la función que `main.ts` pasa a `app.set('trust
 * proxy', …)`. Express la invoca con
 * `req.socket.remoteAddress` y, según el resultado,
 * acepta o descarta el `X-Forwarded-For` que el cliente
 * incluyó.
 */
export function isTrustedProxyAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  for (const cidr of TRUSTED_PROXY_NETWORKS) {
    const [net, bits = '32'] = cidr.split('/');
    const network = ipToLong(net);
    const mask = bits === '32' ? -1 : ~((1 << (32 - Number(bits))) - 1);
    const addrLong = ipToLong(addr);
    if (((addrLong & mask) >>> 0) === ((network & mask) >>> 0)) {
      return true;
    }
  }
  return false;
}
