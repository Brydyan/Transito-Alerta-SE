export default {
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    requestTimeout: 15000,
    responseTimeout: 15000,
    defaultCommandTimeout: 15000,
    env: {
      API_BASE: 'http://localhost:8000/api',
    },
  },
};
