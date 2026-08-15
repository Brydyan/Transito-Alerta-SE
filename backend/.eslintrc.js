module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules', 'coverage'],
  rules: {
    // NestJS DI relies on decorator metadata; explicit return types on every
    // provider method adds noise without catching anything the compiler misses.
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // `any` is a warning, not an error: test doubles and cache-manager's
    // loose typings use it legitimately, but new production code should not.
    '@typescript-eslint/no-explicit-any': 'warn',

    // Unused args are allowed when prefixed with _ (NestJS interceptor and
    // guard signatures require positional params that are often unused).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    // A floating promise in a request handler silently swallows failures —
    // cache writes and Redis XADDs are exactly where that has bitten us.
    '@typescript-eslint/no-floating-promises': 'error',
  },
};
