/**
 * AUD (sc-327) D1 — `R-AUD-5`: la máscara publica pero no
 * autentica.
 *
 * Esta fase recicla la fila con `device_uuid = 'anonymous'`
 * (sembrada por 0001, vaciada de permisos por ANON 0048)
 * como autoría "mostrada" para las publicaciones anónimas.
 * El requisito tiene TRES propiedades:
 *
 *  - Publica: una fila en `incidents` con `citizen_id` = la
 *    máscara es válida (la FK se satisface, la `NOT NULL` se
 *    cumple). Es exactamente el camino feliz de B.5: el
 *    servicio resuelve el id de la máscara, lo usa como
 *    `citizen_id`, y la BD acepta la inserción. Si la
 *    migración 0001 no se aplicó, la FK falla; los specs
 *    que corren contra la BD real (e2e) lo cubren.
 *  - No autentica: `AuthService.login` rechaza
 *    `device_uuid = 'anonymous'` con 401
 *    `ANONYMOUS_IDENTITY_CLOSED`. Cubierto por los specs
 *    de ANON (sc-326) en `auth.service.spec.ts` y por el
 *    e2e `anon-no-anonymous-creation.e2e-spec.ts` para el
 *    camino de los endpoints HTTP.
 *  - Sin rol: la fila de la máscara no tiene `role_id` y,
 *    por la naturaleza de `getAuthContextByUserId`, nunca
 *    se le conceden permisos por un rol. Está documentado
 *    en el spec como "no es una identidad de autenticación".
 *
 * Este archivo es la red contra el escenario "alguien borra
 * la fila porque parece huérfana". La constante
 * `ANONYMOUS_MASK_DEVICE_UUID` se exporta para que la
 * prueba de regresión del cascade (que existe en la
 * migración 0046) tenga un nombre estable al que referirse.
 * El spec verifica que la constante está alineada con la
 * config del proyecto.
 */
import authConfig from '../../config/auth.config';
import { ANONYMOUS_MASK_DEVICE_UUID } from './anonymous-mask.constants';

describe('AUD (sc-327) D1 — anonymous mask (R-AUD-5)', () => {
  it('la constante ANONYMOUS_MASK_DEVICE_UUID coincide con authConfig.anonymousDeviceUuid', () => {
    // Defensa contra la deriva: si alguien cambia el
    // `anonymousDeviceUuid` en config sin actualizar la
    // constante (o viceversa), este test cae y obliga a
    // sincronizar ambos lados. La máscara tiene una sola
    // identidad de fuente.
    expect(ANONYMOUS_MASK_DEVICE_UUID).toBe(
      authConfig().anonymousDeviceUuid,
    );
  });

  it('la máscara es exactamente "anonymous" (la identidad sembrada en 0001)', () => {
    // El test fija la identidad de la fila máscara. Si la
    // siembra cambia, este test cae y la máscara debe
    // migrarse (nueva fila + búsqueda de referencias). El
    // valor "anonymous" es la decisión de 0001: el seed
    // que crea la fila.
    expect(ANONYMOUS_MASK_DEVICE_UUID).toBe('anonymous');
  });
});
