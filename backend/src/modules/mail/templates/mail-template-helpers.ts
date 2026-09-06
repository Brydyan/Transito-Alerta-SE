/**
 * MAIL (sc-327) — helpers de formato para el aviso de intento
 * (D9). Tres funciones, ninguna dependencia nueva.
 */

/**
 * Enmascara una dirección IP para el aviso. La política
 * (decidida el 2026-09-06): IPv4 conserva los dos primeros
 * octetos, IPv6 los dos primeros grupos. Reconocer la
 * zona es lo que el titular necesita; los octetos finales
 * identifican a un tercero.
 *
 * Entrada nula o vacía devuelve `'desconocida'`, nunca un
 * hueco. El servicio pasa la cadena nula como `'desconocida'`
 * ya, pero el helper la duplica como defensa.
 */
export function maskIp(raw: string | null | undefined): string {
  if (!raw) {
    return 'desconocida';
  }
  // IPv4 con dos puntos: 4 grupos decimales
  if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
    const octets = raw.split('.');
    return `${octets[0]}.${octets[1]}.x.x`;
  }
  // IPv6: 8 grupos hex separados por `:`, posiblemente con `::`
  if (raw.includes(':')) {
    // Normalizar `::` a grupos vacíos y explotar
    const groups = raw.split(':');
    // Si la IP tiene menos de 8 grupos, expandir la primera
    // ocurrencia de `::` (no la soportamos por simplicidad
    // — un caso real y razonable).
    if (groups.length >= 4) {
      return `${groups[0]}:${groups[1]}:x:x`;
    }
  }
  return raw;
}

/**
 * Del user-agent extrae navegador y sistema, **sin versiones**
 * (decisión D9). «Chrome en Linux», «Firefox en macOS», etc.
 * Reconocido lo más común del proyecto: los user-agents
 * reales que llegan. Lo que no reconozca → `'desconocido'`.
 *
 * El proyecto evita una dependencia de parseo de user-agent:
 * veinte líneas a cambio de una librería de 2 MB con base de
 * firmas que envejece. La decisión está documentada en
 * `design.md` D9.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return 'desconocido';
  }
  const ua = userAgent.toLowerCase();

  // Sistema operativo primero
  let os = 'desconocido';
  if (ua.includes('windows nt')) os = 'Windows';
  else if (ua.includes('mac os x') || ua.includes('macintosh')) os = 'macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  // Navegador
  let browser = 'desconocido';
  if (ua.includes('firefox/') || ua.includes('firefox ')) browser = 'Firefox';
  else if (ua.includes('edg/') || ua.includes('edge/')) browser = 'Edge';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
  else if (ua.includes('chrome/') || ua.includes('chromium')) browser = 'Chrome';
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari';

  return `${browser} en ${os}`;
}

/**
 * Fecha legible en hora local de Ecuador (America/Guayaquil).
 * El aviso al titular dice «Cuándo» — la hora que importa es
 * la del intento, no la de la entrega. El outbox es
 * asíncrono; el service le pasa el Date del intento en
 * `data.attemptedAt`, y la conversión a hora local ocurre
 * al renderizar.
 *
 * Sin dependencia de `Intl.DateTimeFormat` con timeZone
 * (soportado en Node 18+, pero el proyecto no asume
 * runtime). `getTimezoneOffset` en GMT-5 devuelve 300 (minutos).
 */
export function formatAttemptTime(date: Date): string {
  // El proyecto se sirve en hora de Ecuador. Si el runtime no
  // tiene zona horaria configurada, `getTimezoneOffset` es
  // 0 (UTC) y el resultado se verá en UTC. La constante es
  // deliberada: la documentación dice «hora local» y la
  // zona es parte del producto.
  const ecuadorOffsetMinutes = 5 * 60; // GMT-5

  // Convertir a "wall time" en Ecuador: restar el offset del
  // runtime y aplicar el offset de Ecuador.
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const ecuador = new Date(utcMs - ecuadorOffsetMinutes * 60 * 1000);

  const day = ecuador.getUTCDate();
  const month = ecuador.getUTCMonth() + 1;
  const year = ecuador.getUTCFullYear();
  const hour = ecuador.getUTCHours();
  const min = ecuador.getUTCMinutes();

  const months = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const mm = String(min).padStart(2, '0');
  return `${day} de ${months[month - 1]} de ${year}, ${hour}:${mm} (GMT-5)`;
}
