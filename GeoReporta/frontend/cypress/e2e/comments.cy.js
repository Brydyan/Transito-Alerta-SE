describe('Incident Comments', () => {
  it('CT-17: Add comment to incident (UI)', () => {
    cy.getAuthToken('usuario@test.com', 'Usuario123!').then(token => {
      cy.fixture('incidents').then(data => {
        cy.createIncidentViaAPI(token, data.minimal).then(id => {
          cy.login('usuario@test.com', 'Usuario123!');
          // Citizens view incidents via /feed/:id (feed-detail component),
          // not /incidencias/:id — that route is staff-only and bounces
          // citizens back to /feed regardless of feed.detail permission.
          cy.visit(`/#/feed/${id}`);

          cy.get('#fd-comment-input').type('Este es mi comentario E2E');
          cy.get('#fd-comment-submit').click();

          cy.get('#fd-comments-list').should('contain', 'Este es mi comentario E2E');
        });
      });
    });
  });

  it('CT-18: Comment appears in API list', () => {
    cy.getAuthToken('usuario@test.com', 'Usuario123!').then(token => {
      cy.fixture('incidents').then(data => {
        cy.createIncidentViaAPI(token, data.minimal).then(id => {
          cy.addComment(id, 'Test comment E2E', token).then(() => {
            cy.request({
              url: `${Cypress.env('API_BASE')}/incidents/${id}/comments`,
              headers: { Authorization: `Bearer ${token}` },
            }).then(res => {
              const comments = res.body.data || res.body;
              expect(Array.isArray(comments)).to.be.true;
              expect(comments.length).to.be.greaterThan(0);
              const hasComment = comments.some(c => (c.message || c.content || '').includes('Test comment E2E'));
              expect(hasComment).to.be.true;
            });
          });
        });
      });
    });
  });
});