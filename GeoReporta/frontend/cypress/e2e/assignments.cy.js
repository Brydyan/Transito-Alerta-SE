describe('Incident Assignments', () => {
  it('CT-15: Assign responsable role', () => {
    cy.getAuthToken('admin.gad-municipal-del-canton-quito@organizacion.com', 'Admin123!').then(adminToken => {
      cy.getAuthToken('usuario@test.com', 'Usuario123!').then(citizenToken => {
        cy.fixture('incidents').then(data => {
          cy.createIncidentViaAPI(citizenToken, data.minimal).then(id => {
            cy.login('admin.gad-municipal-del-canton-quito@organizacion.com', 'Admin123!');
            cy.visit(`/#/incidencias/${id}`);

            cy.get('select[name*="assignment"], #detalle-asignaciones-select').select('5', { force: true });
            cy.get('input[value="responsable"], #detalle-asignaciones-rol-responsable').check({ force: true });
            cy.get('button:contains("Asignar"), #detalle-asignaciones-submit').click();

            cy.get('.alert-success, .toast-success, [class*="asignaci"]').should('exist');
          });
        });
      });
    });
  });

  it('CT-16: Cannot assign duplicate user', () => {
    cy.getAuthToken('admin.gad-municipal-del-canton-quito@organizacion.com', 'Admin123!').then(adminToken => {
      cy.getAuthToken('usuario@test.com', 'Usuario123!').then(citizenToken => {
        cy.fixture('incidents').then(data => {
          cy.createIncidentViaAPI(citizenToken, data.minimal).then(id => {
            // First assign
            cy.assignIncident(id, 5, 'responsable', adminToken);

            // Try assign same user again
            cy.request({
              method: 'POST',
              url: `${Cypress.env('API_BASE')}/incidents/${id}/assignments`,
              headers: { Authorization: `Bearer ${adminToken}` },
              body: { user_id: 5, role: 'responsable' },
              failOnStatusCode: false,
            }).then(res => {
              expect(res.status).to.be.oneOf([409, 422]);
            });
          });
        });
      });
    });
  });
});
