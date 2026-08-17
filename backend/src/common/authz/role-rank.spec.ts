import { rankOf, ROLE_RANK } from './role-rank';

describe('ROLE_RANK', () => {
  it('orders the five roles from most to least privileged', () => {
    expect(ROLE_RANK.admin_sistema).toBeLessThan(ROLE_RANK.operador_sistema);
    expect(ROLE_RANK.operador_sistema).toBeLessThan(ROLE_RANK.admin_organizacion);
    expect(ROLE_RANK.admin_organizacion).toBeLessThan(ROLE_RANK.operador_organizacion);
    expect(ROLE_RANK.operador_organizacion).toBeLessThan(ROLE_RANK.reporter);
  });
});

describe('rankOf', () => {
  it('resolves a known role to its numeric rank', () => {
    expect(rankOf('admin_sistema')).toBe(ROLE_RANK.admin_sistema);
    expect(rankOf('reporter')).toBe(ROLE_RANK.reporter);
  });

  it('unknown role -> MAX_SAFE_INTEGER (manages nobody)', () => {
    expect(rankOf('made_up_role')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('null role -> MAX_SAFE_INTEGER', () => {
    expect(rankOf(null)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
