import { ENQUEUED_TEMPLATE_NAMES, renderMailTemplate } from './mail-templates';

describe('renderMailTemplate — invitation / password-reset (T3.6 task 7.3)', () => {
  describe('invitation', () => {
    it('renders the link, role and organization name, all escaped', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost:3000/accept-invitation?token=abc123',
        roleName: 'operador_org',
        organizationName: 'Santa Elena Transito',
      });

      expect(html).toContain('http://localhost:3000/accept-invitation?token=abc123');
      expect(html).toContain('operador_org');
      expect(html).toContain('Santa Elena Transito');
      expect(html).toMatch(/48 hours/);
    });

    it('escapes a poisoned token/link — no unescaped HTML reaches the body', () => {
      const html = renderMailTemplate('invitation', {
        link: '"><script>alert(1)</script>',
        roleName: 'reporter',
        organizationName: '<b>Org</b>',
      });

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>Org</b>');
    });
  });

  describe('password-reset', () => {
    it('renders the link, escaped, with no password hint', () => {
      const html = renderMailTemplate('password-reset', {
        link: 'http://localhost:3000/reset-password?token=xyz789',
      });

      expect(html).toContain('http://localhost:3000/reset-password?token=xyz789');
      expect(html).toMatch(/24 hours/);
      expect(html.toLowerCase()).not.toContain('your password is');
    });

    it('escapes a poisoned link', () => {
      const html = renderMailTemplate('password-reset', {
        link: '"><img src=x onerror=alert(1)>',
      });

      expect(html).not.toContain('<img');
    });
  });
});

// ───── MAIL (sc-327) — render de las dos plantillas nuevas ─────

describe('renderMailTemplate — email_verification (MAIL A.2/A.5)', () => {
  it('renderiza el OTP y los minutos de vigencia (D4)', () => {
    const html = renderMailTemplate('email_verification', {
      otp: '408736',
      expiresMinutes: 15,
    });
    expect(html).toContain('408736');
    expect(html).toContain('15');
  });

  it('escapa un OTP con marcado HTML (R13, defensa en profundidad)', () => {
    const html = renderMailTemplate('email_verification', {
      otp: '<script>alert("xss")</script>',
      expiresMinutes: 15,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('el cuerpo lleva el pie de GeoReporta (H.3, R-AUD-6 single source)', () => {
    const html = renderMailTemplate('email_verification', {
      otp: '408736',
      expiresMinutes: 15,
    });
    expect(html).toContain('GeoReporta');
  });
});

describe('renderMailTemplate — existing_account_attempt (MAIL A.2/A.5, D4/D9)', () => {
  it('muestra dispositivo, IP enmascarada y momento (D9)', () => {
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    // Dispositivo: navegador en sistema, sin versiones
    expect(html).toContain('Chrome en Linux');
    expect(html).not.toContain('120.0.0.0');
    expect(html).not.toContain('537.36');
    // IP enmascarada: dos octetos, los dos últimos enmascarados
    expect(html).toContain('190.15.x.x');
    expect(html).not.toContain('142.87');
    // La cadena completa de user-agent NO aparece
    expect(html).not.toContain('AppleWebKit');
    expect(html).not.toContain('Safari/537.36');
  });

  it('IPv6 muestra los dos primeros grupos', () => {
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '2001:db8:85a3:0:0:8a2e:370:7334',
      userAgent: 'Firefox/115',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(html).toContain('2001:db8:x:x');
  });

  it('muestra "desconocida" cuando la IP es nula o vacía (D9, escenarios)', () => {
    const htmlEmpty = renderMailTemplate('existing_account_attempt', {
      ip: '',
      userAgent: 'Firefox/115',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(htmlEmpty).toContain('desconocida');

    // El helper es defensivo: aunque el service ya pasa
    // 'desconocida' para null, un dato null en el render
    // también cae al fallback.
    const htmlNull = renderMailTemplate('existing_account_attempt', {
      ip: null as never,
      userAgent: 'Firefox/115',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(htmlNull).toContain('desconocida');
  });

  it('muestra "desconocido" cuando el user-agent es nulo (D9)', () => {
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: '',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(html).toContain('desconocido');
  });

  it('NO contiene OTP ni enlace de acción (D4, R-AUD-6: aviso sin vector)', () => {
    // El servicio encola con `data: { ip, userAgent, attemptedAt }`.
    // El render nunca debe mostrar un código que el titular no
    // pidió. La defensa por mutación: aunque alguien inyecte
    // `otp` y `link` en los datos, la plantilla los ignora.
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: 'Chrome/120',
      attemptedAt: '2026-09-06T19:33:41.123Z',
      // Campos inyectados por error / por ataque — la plantilla
      // no debe renderizarlos.
      otp: '999999',
      link: 'http://attacker.example/reset',
    } as never);
    expect(html).not.toContain('999999');
    expect(html).not.toContain('attacker.example');
    expect(html).not.toMatch(/<a[^>]+href/i);
  });

  it('el momento del intento se muestra en hora local (no UTC)', () => {
    // El helper convierte a GMT-5 (Ecuador). Una fecha que en
    // UTC es 19:33:41, en Ecuador es 14:33:41 del mismo día. La
    // aserción es determinista: `formatAttemptTime` NO depende
    // de la zona horaria del runtime (regresión: sumaba
    // `getTimezoneOffset()` y el resultado cambiaba según la TZ
    // del proceso).
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: 'Chrome/120',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(html).toMatch(/14:33 \(GMT-5\)/);
    // Y no muestra la hora UTC sin convertir.
    expect(html).not.toMatch(/19:33 \(GMT-5\)/);
  });

  it('escapa user-agent con marcado HTML (R13)', () => {
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: '<script>alert(1)</script>',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(html).not.toContain('<script>');
    // Si el user-agent es HTML, el helper no puede describir
    // nada reconocible; el fallback es "desconocido".
    expect(html).toContain('desconocido');
  });
});

describe('renderMailTemplate — todos los nombres encolados están cubiertos (MAIL C.2)', () => {
  // El test recorre la costura: por cada nombre que el código
  // encola (derivado de `ENQUEUED_TEMPLATE_NAMES`), `renderMailTemplate`
  // lo acepta sin lanzar. El test NO enumera los nombres a mano:
  // eso volvería a partir la costura en dos (lo que este test
  // existe para evitar).
  it('todos los `ENQUEUED_TEMPLATE_NAMES` se renderizan sin error', () => {
    for (const name of ENQUEUED_TEMPLATE_NAMES) {
      expect(() =>
        renderMailTemplate(name, { _placeholder: 'x' }),
      ).not.toThrow();
    }
  });
});
