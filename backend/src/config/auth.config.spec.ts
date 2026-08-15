import authConfig from './auth.config';

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
