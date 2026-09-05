import authConfig, { parseDurationSeconds } from './auth.config';

describe('parseDurationSeconds (T3.9 design §6 [R5])', () => {
  it.each([
    ['7d', 7 * 24 * 60 * 60],
    ['15m', 15 * 60],
    ['30s', 30],
    ['1h', 60 * 60],
  ])('parses %s -> %i seconds', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });

  it('throws on an invalid duration string', () => {
    expect(() => parseDurationSeconds('garbage')).toThrow();
    expect(() => parseDurationSeconds('')).toThrow();
    expect(() => parseDurationSeconds('7x')).toThrow();
  });
});

describe('authConfig — sessionRefreshTtlSeconds/sessionRefreshGraceSeconds (T3.9)', () => {
  const originalGrace = process.env.SESSION_REFRESH_GRACE_SECONDS;
  const originalRefreshExpiry = process.env.JWT_REFRESH_EXPIRES_IN;

  afterEach(() => {
    if (originalGrace === undefined) {
      delete process.env.SESSION_REFRESH_GRACE_SECONDS;
    } else {
      process.env.SESSION_REFRESH_GRACE_SECONDS = originalGrace;
    }
    if (originalRefreshExpiry === undefined) {
      delete process.env.JWT_REFRESH_EXPIRES_IN;
    } else {
      process.env.JWT_REFRESH_EXPIRES_IN = originalRefreshExpiry;
    }
  });

  it('derives sessionRefreshTtlSeconds from jwtRefreshExpiresIn', () => {
    delete process.env.JWT_REFRESH_EXPIRES_IN;
    expect(authConfig().sessionRefreshTtlSeconds).toBe(7 * 24 * 60 * 60);
  });

  it('defaults sessionRefreshGraceSeconds to 30 when unset', () => {
    delete process.env.SESSION_REFRESH_GRACE_SECONDS;
    expect(authConfig().sessionRefreshGraceSeconds).toBe(30);
  });

  it('reads sessionRefreshGraceSeconds from env when set', () => {
    process.env.SESSION_REFRESH_GRACE_SECONDS = '45';
    expect(authConfig().sessionRefreshGraceSeconds).toBe(45);
  });
});

describe('authConfig — anonymous permission ceiling (ANON sc-327)', () => {
  // ANON (sc-327) — la capacidad «reporte sin sesión» se cerró por
  // decisión de producto 2026-09-02. Los tests que afirmaban lo
  // contrario (los tres primeros: «lets an anonymous device…»)
  // INVIRTIERON su tesis. No se borran: la regla del fix B.6
  // es que la capacidad retirada tiene que seguir documentada
  // como retirada, no silenciada.
  const anonymous = () => authConfig().anonymousPermissions;

  it('ANON: the ceiling is empty — no anonymous login path', () => {
    // B.1 — `anonymousPermissions` se vacía. La identidad
    // anónima ya no concede nada: la ruta del reporte sin
    // sesión se cerró (decisión 2026-09-02). La fila máscara
    // queda en BD con `permissions = []` (migración 0048, B.2).
    expect(anonymous()).toEqual([]);
  });

  it('ANON: the ceiling grants no permission of any kind (READ, CREATE, UPDATE, DELETE, ASSIGN, CLAIM, RELEASE, CLOSE)', () => {
    // La lista es la lista vacía. Cualquier permiso que se
    // añada al array rompe este test — fail-loud en compilación
    // sería mejor, pero `expect([]).toEqual([])` ya es fail-loud
    // en CI: si alguien cambia el array, el test cae.
    const all = anonymous();
    expect(all).toHaveLength(0);
  });

  it('ANON: the four previously-agreed permissions are explicitly absent', () => {
    // B.6 — los tests del round 0 afirmaban que `READ/CREATE
    // incidents` y `READ/CREATE comments` estaban. ANON los
    // retira. Este test fija la propiedad «ausentes» de manera
    // explícita para que un futuro refactor que los re-introduzca
    // caiga aquí antes de que llegue a producción.
    const all = anonymous();
    expect(all).not.toContain('READ incidents');
    expect(all).not.toContain('CREATE incidents');
    expect(all).not.toContain('READ comments');
    expect(all).not.toContain('CREATE comments');
  });

  it('grants no UPDATE, DELETE or ASSIGN permission of any kind (kept from round 0 for symmetry)', () => {
    // El test del round 0 sigue siendo válido: la identidad
    // anónima nunca concedió UPDATE/DELETE/ASSIGN. La
    // afirmación es trivial con la lista vacía, pero la
    // mantenemos para que un cambio futuro que añada un
    // UPDATE explícito lo nombre como error.
    const forbidden = anonymous().filter((permission) =>
      /^(UPDATE|DELETE|ASSIGN) /.test(permission),
    );
    expect(forbidden).toEqual([]);
  });
});
