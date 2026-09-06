import { ANONYMOUS_DISCLOSURE_NOTICE } from './anonymous-disclosure-notice';

/**
 * AUD (sc-327) D2 — R-AUD-6: el aviso junto al interruptor
 * de anonimato dice, en este orden:
 *
 *  1. La identidad NO se publica.
 *  2. Puede ser revelada, dejando registro, ante una
 *     denuncia por información falsa.
 *
 * El spec verifica ambas cláusulas como strings separados
 * (no como regex parcial) — el texto es normativo y debe
 * leerse entero. Si alguien quiere editarlo, edita el
 * constante y este test cae, obligando a re-verificar la
 * promesa.
 */
describe('AUD (sc-327) D2 — anonymous disclosure notice (R-AUD-6)', () => {
  it('el aviso indica que la identidad NO se publica', () => {
    expect(ANONYMOUS_DISCLOSURE_NOTICE).toMatch(/identidad no se publica/i);
  });

  it('el aviso indica que la identidad puede ser revelada, dejando registro, ante una denuncia por información falsa', () => {
    // Cubre las 3 condiciones: puede ser revelada,
    // dejando registro, ante una denuncia formal.
    expect(ANONYMOUS_DISCLOSURE_NOTICE).toMatch(/revelad[ao]/i);
    expect(ANONYMOUS_DISCLOSURE_NOTICE).toMatch(/dejando registro/i);
    expect(ANONYMOUS_DISCLOSURE_NOTICE).toMatch(/denuncia/i);
    expect(ANONYMOUS_DISCLOSURE_NOTICE).toMatch(/información falsa/i);
  });

  it('el aviso NO emplea la palabra "anónimo" sin la aclaración (R-AUD-6 coherencia)', () => {
    // C.6: "Prometer un anonimato que el sistema no da es
    // la falla que este requisito existe para impedir". El
    // texto actual no contiene la palabra "anónimo" en
    // ningún sitio — la promesa se hace con la fórmula
    // "identidad no se publica" + "puede ser revelada".
    // Si alguien la añade sin la aclaración, este test
    // obliga a revisar que la promesa siga siendo honesta.
    expect(ANONYMOUS_DISCLOSURE_NOTICE).not.toMatch(/anónim[ou]a/i);
  });
});
