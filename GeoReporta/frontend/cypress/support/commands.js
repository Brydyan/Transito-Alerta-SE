// Mirrors frontend/app/utils/role.js#homeRouteForUser — each role lands on
// a different post-login route, so the shared login helper can't assert a
// single hardcoded path.
function homeRouteForEmail(email) {
  if (email.startsWith('usuario')) return '/#/feed';
  if (email.startsWith('operador.')) return '/#/operator/dashboard';
  return '/#/dashboard';
}

Cypress.Commands.add('login', (email, password) => {
  cy.clearAllCookies();
  cy.clearAllSessionStorage();
  cy.visit('/#/login');
  cy.get('#email').type(email);
  cy.get('#password').type(password);
  cy.get('#login-form button[type="submit"]').click();
  cy.url().should('include', homeRouteForEmail(email));
});

Cypress.Commands.add('createIncidentViaAPI', (token, payload) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('API_BASE')}/incidents`,
    headers: { Authorization: `Bearer ${token}` },
    body: payload,
  }).then(res => res.body.data?.id ?? res.body.id);
});

Cypress.Commands.add('getAuthToken', (email, password) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('API_BASE')}/login`,
    body: { email, password },
  }).then(res => res.body.access_token);
});

Cypress.Commands.add('assignIncident', (incidentId, userId, role, token) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('API_BASE')}/incidents/${incidentId}/assignments`,
    headers: { Authorization: `Bearer ${token}` },
    body: { user_id: userId, role },
  });
});

Cypress.Commands.add('changeIncidentStatus', (incidentId, newStatus, token) => {
  return cy.request({
    method: 'PUT',
    url: `${Cypress.env('API_BASE')}/incidents/${incidentId}/estado`,
    headers: { Authorization: `Bearer ${token}` },
    body: { status: newStatus },
  });
});

Cypress.Commands.add('addComment', (incidentId, message, token) => {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('API_BASE')}/incidents/${incidentId}/comments`,
    headers: { Authorization: `Bearer ${token}` },
    body: { message },
  });
});