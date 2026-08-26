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

describe('authConfig — anonymous permission ceiling', () => {
  const anonymous = () => authConfig().anonymousPermissions;

  it('lets an anonymous device report an emergency without logging in', () => {
    expect(anonymous()).toContain('CREATE incidents');
  });

  it('lets an anonymous device read what the public posted', () => {
    expect(anonymous()).toEqual(
      expect.arrayContaining(['READ incidents', 'READ comments']),
    );
  });

  it('lets an anonymous device comment on public reports', () => {
    expect(anonymous()).toContain('CREATE comments');
  });

  // The ceiling is read-and-contribute, never modify: an unauthenticated
  // device must not be able to alter or remove anything, its own included.
  it('grants no UPDATE, DELETE or ASSIGN permission of any kind', () => {
    const forbidden = anonymous().filter((permission) =>
      /^(UPDATE|DELETE|ASSIGN) /.test(permission),
    );

    expect(forbidden).toEqual([]);
  });

  it('grants exactly the four agreed permissions and nothing more', () => {
    expect(anonymous().sort()).toEqual(
      [
        'CREATE comments',
        'CREATE incidents',
        'READ comments',
        'READ incidents',
      ].sort(),
    );
  });
});
