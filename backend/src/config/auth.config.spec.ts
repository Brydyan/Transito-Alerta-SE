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

describe('authConfig — anonymous permission ceiling (ANON sc-326, ronda 1)', () => {
  const anonymous = () => authConfig().anonymousPermissions;

  // ANON (sc-326) — los 3 tests del round 0 ("lets an anonymous
  // device…") se sustituyeron por sus inversiones. La regla
  // del spec: el test afirma la nueva propiedad, no se queda
  // callado sobre la vieja. Estos tests sustituyen a:
  //   - "lets an anonymous device report an emergency without logging in"
  //   - "lets an anonymous device read what the public posted"
  //   - "lets an anonymous device comment on public reports"
  //   - "grants exactly the four agreed permissions and nothing more"
  // …que afirmaban la propiedad VIEJA (techo abierto).
  it('ANON: the ceiling is empty — no anonymous login path grants any permission', () => {
    expect(anonymous()).toEqual([]);
  });

  it('ANON: the ceiling grants no permission of any kind', () => {
    expect(anonymous().length).toBe(0);
  });

  it('ANON: the four previously-agreed permissions are explicitly absent', () => {
    // Defensa explícita: si alguien reintroduce cualquiera de
    // los 4 strings del round 0, este test cae con el nombre
    // del permiso reintroducido. Es la red que faltaba: el
    // test anterior "grants exactly the four…" era un
    // espejo del código y desaparecía junto con él.
    expect(anonymous()).not.toContain('READ incidents');
    expect(anonymous()).not.toContain('CREATE incidents');
    expect(anonymous()).not.toContain('READ comments');
    expect(anonymous()).not.toContain('CREATE comments');
  });

  // Test preservado del round 0 para simetría: con la lista
  // vacía el filtro de "UPDATE/DELETE/ASSIGN" sigue siendo
  // trivialmente vacío, pero la afirmación sigue siendo
  // legítima — la invariante debe ser estructural, no
  // accidental.
  it('grants no UPDATE, DELETE or ASSIGN permission of any kind', () => {
    const forbidden = anonymous().filter((permission) =>
      /^(UPDATE|DELETE|ASSIGN) /.test(permission),
    );

    expect(forbidden).toEqual([]);
  });
});
