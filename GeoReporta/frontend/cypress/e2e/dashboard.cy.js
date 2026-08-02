describe('Dashboard + Filters', () => {
  beforeEach(() => {
    cy.login('admin.gad-municipal-del-canton-quito@organizacion.com', 'Admin123!');
    cy.visit('/#/dashboard');
  });

  it('CT-08: Dashboard loads (stat cards + charts)', () => {
    cy.get('body').should('exist');
    cy.get('[class*="stat"], [class*="card"]').should('have.length.greaterThan', 0);
    cy.get('[id*="chart"], svg').should('exist');
  });

  it('CT-09: Filter by date range applies', () => {
    cy.get('#btn-open-filter-modal').click();
    cy.get('#filter-inicio').type('2026-07-01');
    cy.get('#filter-fin').type('2026-07-31');
    cy.get('#btn-filter-apply').click();

    cy.get('[class*="stat"], [class*="card"]').should('exist');
  });

  it('CT-10: Filter by type + location', () => {
    cy.get('#btn-open-filter-modal').click();
    cy.get('#filter-tipo').select(1, { force: true });
    cy.get('#filter-pais').select(1, { force: true });
    cy.get('#btn-filter-apply').click();

    cy.get('[id*="chart"], svg').should('exist');
  });

  it('CT-11: Weekly performance chart visible', () => {
    cy.get('[id*="chart"], svg').should('have.length.greaterThan', 0);
    cy.get('.gr-stat-card__label', { timeout: 15000 }).should('contain', 'Resueltas');
  });
});