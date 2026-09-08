/**
 * frontend/e2e/_helpers/e2e-credentials.ts
 *
 * Helper único que TODA la suite e2e consume para resolver las credenciales
 * de la corrida. Implementa D4 del change
 * `2026-09-03-e2e-test-user-and-credentials`:
 *
 *   - sin BASE_URL                    → se salta con motivo declarado
 *   - BASE_URL sin E2E_PASSWORD       → FALLA, ruidosamente, nombrando la
 *                                       variable que falta
 *   - BASE_URL + E2E_PASSWORD         → corre de verdad
 *
 * Separar "no configurado" (skip legítimo) de "configurado y roto" (falla
 * ruidosa) es lo que evita que un test que no corre se lea igual que uno
 * que pasa. Un skip por "este runner no tiene e2e" es barato; un skip por
 * "faltó un secret" es una avería disfrazada de decisión.
 *
 * Los emails por defecto viven acá, NO en los specs: las reglas
 * `B.6` ("sin literales") se cumplen por construcción — los archivos
 * `.e2e.ts` sólo importan este helper.
 */
export type E2eCreds =
  | { readonly skip: true; readonly reason: string }
  | { readonly skip: false; readonly user: string; readonly password: string };

/** Usuario dedicado `e2e@tase.local` (operador_org). El de la fase. */
const DEFAULT_E2E_USER = 'e2e@tase.local';

/**
 * Usuario con permisos elevados. RESERVADO a specs que de verdad lo
 * necesiten (hoy: `catalogs-crud.e2e.ts`, que escribe catálogos y por
 * lo tanto atraviesa los guards de permiso). Usarlo en otro spec es
 * una señal de que el spec no está probando lo que debería.
 */
const DEFAULT_ADMIN_USER = 'master@tase.local';

const NO_BACKEND_REASON =
  'Requiere un backend real con seed. Definí BASE_URL apuntando a staging.';

const MISSING_PASSWORD_ERROR =
  'E2E_PASSWORD no está definida. Con BASE_URL apuntando a staging, la suite ' +
  'e2e requiere el secret E2E_PASSWORD; sin él no se puede autenticar.';

/**
 * Resuelve la parte común a todos los perfiles: decide si la corrida
 * se salta (sin backend) o falla (configuración incompleta), y devuelve
 * la contraseña si la hay.
 */
function resolveCommon():
  | { readonly skip: true; readonly reason: string }
  | { readonly skip: false; readonly password: string } {
  const baseUrl = process.env['BASE_URL']?.trim();
  if (!baseUrl) {
    return { skip: true, reason: NO_BACKEND_REASON };
  }
  const password = process.env['E2E_PASSWORD']?.trim();
  if (!password) {
    // D4: BASE_URL presente + secret ausente = configuración rota, NO skip.
    throw new Error(MISSING_PASSWORD_ERROR);
  }
  return { skip: false, password };
}

/**
 * Perfil del usuario e2e sembrado por la fase. Es el que la mayoría
 * de los specs debe usar: `operador_org` con la organización por
 * defecto, atraviesa los guards de permiso como un usuario real.
 */
export function resolveE2eCredentials(): E2eCreds {
  const common = resolveCommon();
  if (common.skip) return common;
  const user = process.env['E2E_USER']?.trim() || DEFAULT_E2E_USER;
  return { skip: false, user, password: common.password };
}

/**
 * Perfil con permisos elevados. Sólo para specs que escriben recursos
 * cuyo `*` está vedado al usuario e2e (catálogos, hoy). No es un
 * atajo para "que pase el test": cada uso se anota en el spec con el
 * motivo por el que el e2e no alcanza.
 */
export function resolveE2eAdminCredentials(): E2eCreds {
  const common = resolveCommon();
  if (common.skip) return common;
  const user = process.env['E2E_ADMIN_USER']?.trim() || DEFAULT_ADMIN_USER;
  return { skip: false, user, password: common.password };
}
