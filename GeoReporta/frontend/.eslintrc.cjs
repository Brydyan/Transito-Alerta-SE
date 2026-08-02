module.exports = {
  root: true,
  env: {
    browser: true,
    es2024: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  globals: {
    L: 'readonly',
    TomSelect: 'readonly',
    bootstrap: 'readonly',
    afterEach: 'readonly',
    beforeEach: 'readonly',
    describe: 'readonly',
    expect: 'readonly',
    it: 'readonly',
    test: 'readonly',
    vi: 'readonly',
  },
  ignorePatterns: ['coverage', 'dist', 'node_modules'],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
  },
};
