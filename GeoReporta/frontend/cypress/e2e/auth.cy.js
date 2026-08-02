describe('Authentication', () => {
  it('CT-01: Citizen login → feed', () => {
    cy.login('usuario@test.com', 'Usuario123!');
    cy.get('body').should('exist');
    cy.url().should('include', '/#/feed');
  });

  it('CT-02: Login failure (wrong password)', () => {
    cy.visit('/#/login');
    cy.get('#email').type('usuario@test.com');
    cy.get('#password').type('WrongPassword123!');
    cy.get('#login-form button[type="submit"]').click();
    cy.get('#login-error').should('not.have.class', 'd-none').and('not.be.empty');
  });

  it('CT-03: Logout → redirect to login', () => {
    cy.login('usuario@test.com', 'Usuario123!');
    cy.get('#app-shell-citizen-menu-trigger').click({ force: true });
    cy.get('#app-shell-citizen-menu-logout').click({ force: true });
    cy.url().should('include', '/#/login');
  });
});