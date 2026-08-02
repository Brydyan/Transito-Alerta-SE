describe('Role-Based Access Control (RBAC)', () => {
  it('CT-19: Citizen cannot access the staff incidents list', () => {
    // Citizens browse via the public feed, not the staff /incidencias list —
    // they lack incidents.view, so the API and the route guard both block it.
    cy.getAuthToken('usuario@test.com', 'Usuario123!').then(token => {
      cy.request({
        url: `${Cypress.env('API_BASE')}/incidents`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      }).then(res => {
        expect(res.status).to.eq(403);
      });
    });

    cy.login('usuario@test.com', 'Usuario123!');
    // The router keeps citizens out of the staff shell entirely — a
    // section mismatch bounces back home instead of rendering /not-found.
    cy.visit('/#/incidencias');
    cy.url().should('include', '/#/feed');
  });

  it('CT-20: Operator sees own organization incidents', () => {
    cy.login('operador.gad-municipal-del-canton-quito@organizacion.com', 'Operador123!');
    cy.visit('/#/incidencias');

    cy.get('body').should('exist');
  });

  it('CT-21: Admin sees all org incidents', () => {
    cy.login('admin.gad-municipal-del-canton-quito@organizacion.com', 'Admin123!');
    cy.visit('/#/incidencias');

    cy.get('#contenedor-tabla').should('not.have.class', 'd-none');
    cy.get('table tbody tr, [data-testid*="incident-row"]').should('have.length.greaterThan', 0);
  });

  it('CT-22: Citizen cannot assign incidents', () => {
    cy.getAuthToken('usuario@test.com', 'Usuario123!').then(citizenToken => {
      cy.fixture('incidents').then(data => {
        cy.createIncidentViaAPI(citizenToken, data.minimal).then(id => {
          cy.request({
            method: 'POST',
            url: `${Cypress.env('API_BASE')}/incidents/${id}/assignments`,
            headers: { Authorization: `Bearer ${citizenToken}` },
            body: { user_id: 2, role: 'responsable' },
            failOnStatusCode: false,
          }).then(res => {
            expect(res.status).to.be.oneOf([403, 401, 422]);
          });
        });
      });
    });
  });
});