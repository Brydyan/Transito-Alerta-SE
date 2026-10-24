import { renderMailTemplate } from './mail-templates';

describe('renderMailTemplate — invitation / password-reset (T3.6 task 7.3)', () => {
  describe('invitation', () => {
    it('renders the link, role and organization name, all escaped', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost:3000/accept-invitation?token=abc123',
        roleName: 'operator_org',
        organizationName: 'Santa Elena Transito',
      });

      expect(html).toContain('http://localhost:3000/accept-invitation?token=abc123');
      expect(html).toContain('operator_org');
      expect(html).toContain('Santa Elena Transito');
      expect(html).toMatch(/48 horas/);
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

    it('renders the Telegram activation section when telegramLink is provided', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'admin_org',
        organizationName: 'Org Test',
        telegramLink: 'https://t.me/tase_alert_bot?start=abc123',
      });

      expect(html).toContain('https://t.me/tase_alert_bot?start=abc123');
      expect(html).toContain('Iniciar bot de Telegram');
      expect(html).toContain('Este enlace expira en 24 horas');
    });

    it('renders the role guide section when roleGuide is provided', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'operator_org',
        organizationName: 'Org Test',
        roleGuide: 'Recibirás las alertas en Telegram.',
      });

      expect(html).toContain('Recibirás las alertas en Telegram.');
      expect(html).toContain('Lo que harás como operator_org');
    });

    it('omits Telegram and role guide sections when neither field is provided', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'admin_org',
        organizationName: 'Org Test',
      });

      expect(html).not.toContain('Iniciar bot de Telegram');
      expect(html).not.toContain('Lo que harás como');
    });

    it('escapes a poisoned telegramLink', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'admin_org',
        organizationName: 'Org Test',
        telegramLink: '"><script>alert(1)</script>',
      });

      expect(html).not.toContain('<script>');
    });

    // 2026-10-16-invitation-email-styled-template (D2) — el template
    // pasó de un fragmento sin layout a un documento HTML completo
    // con saludo personalizado y tarjeta de detalles. Los tests de
    // abajo cubren los campos nuevos y las defensas de escape.

    it('renders inviterName in the details card', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        organizationName: 'Santa Elena',
        inviterName: 'Carlos Mendoza',
        recipientEmail: 'maria@test.com',
      });
      expect(html).toContain('Carlos Mendoza');
      expect(html).toContain('Invitado por');
    });

    it('renders recipientFirstName in the greeting when provided', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        organizationName: '',
        recipientFirstName: 'María',
        recipientEmail: 'maria@test.com',
      });
      expect(html).toContain('Hola, María');
    });

    it('falls back to generic greeting when recipientFirstName is absent', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        recipientEmail: 'maria@test.com',
      });
      expect(html).toContain('Hola 👋');
      expect(html).not.toContain('Hola, ');
    });

    it('renders formatted expiresAt in the details card', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        recipientEmail: 'maria@test.com',
        expiresAt: new Date('2026-10-15T23:59:00Z').toISOString(),
      });
      expect(html).toContain('UTC-5');
      expect(html).toContain('Expira');
    });

    it('renders recipientEmail in the footer', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        recipientEmail: 'maria@test.com',
      });
      expect(html).toContain('maria@test.com');
    });

    it('escapes inviterName — poisoned value never reaches body unescaped', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        inviterName: '<script>alert(1)</script>',
        recipientEmail: 'maria@test.com',
      });
      expect(html).not.toContain('<script>');
    });

    it('returns a full HTML document (<!DOCTYPE html>)', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost/accept',
        roleName: 'Operador de Organización',
        recipientEmail: 'maria@test.com',
      });
      expect(html).toMatch(/^<!DOCTYPE html>/i);
    });
  });

  describe('password-reset', () => {
    it('renders the link, escaped, with no password hint', () => {
      const html = renderMailTemplate('password-reset', {
        link: 'http://localhost:3000/reset-password?token=xyz789',
      });

      expect(html).toContain('http://localhost:3000/reset-password?token=xyz789');
      expect(html).toMatch(/24 horas/);
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

  it('el momento se muestra en hora de Santa Elena (UTC-5), no en UTC', () => {
    // 19:33:41 UTC son las 14:33 en Ecuador (GMT-5, sin horario
    // de verano). La aserción es la hora EXACTA a propósito: la
    // versión anterior esperaba `19:33 (GMT-5)` —la hora UTC sin
    // convertir, con la etiqueta puesta igual— y pasaba sólo
    // porque el helper sumaba el offset del runtime y en una
    // máquina en Ecuador los dos errores se cancelaban. En CI,
    // que corre en UTC, se separaron.
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: 'Chrome/120',
      attemptedAt: '2026-09-06T19:33:41.123Z',
    });
    expect(html).toContain('14:33 (GMT-5)');
    expect(html).toContain('6 de septiembre de 2026');
  });

  it('la conversión cruza el día correctamente', () => {
    // 02:15 UTC del día 7 son las 21:15 del día 6 en Ecuador.
    // Este caso es el que delata un error de signo o un offset
    // tomado del runtime: comprueba la hora Y el día, así que
    // una conversión que no ocurre o que va al revés no puede
    // pasarlo por casualidad.
    const html = renderMailTemplate('existing_account_attempt', {
      ip: '190.15.142.87',
      userAgent: 'Chrome/120',
      attemptedAt: '2026-09-07T02:15:00.000Z',
    });
    expect(html).toContain('6 de septiembre de 2026, 21:15 (GMT-5)');
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
