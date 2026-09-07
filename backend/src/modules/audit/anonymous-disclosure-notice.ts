/**
 * AUD (sc-327) D2 — texto normativo del aviso al ciudadano
 * sobre la posibilidad de revelar la autoría de una
 * publicación anónima.
 *
 * Esta constante existe para que el requisito `R-AUD-6`
 * (mostrar el aviso junto al interruptor de anonimato) se
 * verifique en F4 contra una sola versión del texto, en
 * vez de dejar que cada componente lo redacte por su cuenta.
 *
 * El texto dice dos cosas, en este orden:
 *  - La identidad NO se publica. Es decir, el ciudadano
 *    no aparece como autor.
 *  - Puede ser revelada, dejando registro, ante una
 *    denuncia por información falsa. Es decir, la decisión
 *    de anonimato no es absoluta.
 *
 * Prometer un anonimato que el sistema no da es la falla
 * que este requisito existe para impedir. Por eso la
 * constante está en este módulo y se exporta, no en F4
 * (que la consume).
 *
 * Ver `openspec/changes/back/2026-09-02-aud-audit-trail-and-identity-reveal/specs/audit-trail/spec.md` (R-AUD-6).
 */
export const ANONYMOUS_DISCLOSURE_NOTICE =
  'Tu identidad no se publica. Si tu reporte se usa para difundir información falsa, ' +
  'puede ser revelada, dejando registro de quién y por qué se hizo, ante una denuncia formal.';
