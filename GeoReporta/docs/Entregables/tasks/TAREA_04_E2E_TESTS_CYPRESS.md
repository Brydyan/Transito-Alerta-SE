# 📋 TAREA 04 — E2E Tests (Cypress)

**Asignado a**: Equipo QA (Todos)  
**Prioridad**: 🟡 ALTA  
**Estimado**: 2-3 días  
**Dificultad**: Media-Alta  
**Sprint**: THIS WEEK  

---

## 📌 DESCRIPCIÓN

Zero E2E tests found. Dashboard filters, workflows, form submissions untested in browser. **30-40% of integration bugs only surface in E2E**.

**Objetivo**: Implement Cypress E2E test suite covering 15+ critical user journeys.

---

## 🎯 IMPACTO

- **Antes**: Manual testing only; bugs in browser automation missed
- **Después**: CI/CD runs 100+ E2E tests automatically before deploy
- **Ganancia**: 30-40% integration bug reduction; confidence in releases

---

## 📁 ARCHIVOS A CREAR

```
cypress/e2e/
├── auth.cy.js              (Login, logout, token refresh)
├── incidents.cy.js         (CRUD incidents workflow)
├── dashboard.cy.js         (Filters: date, type, location + chart updates)
├── status-flow.cy.js       (Pendiente → En Proceso → Resuelto state machine)
├── assignments.cy.js       (Asignar responsable/apoyo)
├── comments.cy.js          (Agregar, listar, eliminar comentarios)
└── claims.cy.js            (Claim/Release workflow — multitenant)

cypress/fixtures/
├── users.json              (Test user data)
└── incidents.json          (Sample incident data)

cypress.config.js           (Configuration file)
cypress/support/commands.js (Custom commands: login, createIncident, etc.)
```

---

## 🔧 PASOS DE IMPLEMENTACIÓN

### Paso 1: Install Cypress
**Terminal**:
```bash
cd /path/to/proyecto

# Install via npm
npm install --save-dev cypress

# Open Cypress Test Runner
npx cypress open
```

---

### Paso 2: Configure cypress.config.js
**Archivo**: `cypress.config.js` (create new)

```javascript
module.exports = {
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    setupNodeEvents(on, config) {
      // Implement node event listeners here
    },
  },
};
```

---

### Paso 3: Create Custom Commands
**Archivo**: `cypress/support/commands.js`

```javascript
// Login command
Cypress.Commands.add('login', (email = 'admin@sistema.com', password = 'Admin123!') => {
  cy.visit('/login');
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/dashboard');
});

// Create incident command
Cypress.Commands.add('createIncident', (data = {}) => {
  const payload = {
    title: 'Test Incident',
    description: 'Test Description',
    priority: 'media',
    tipo: 'Infraestructura',
    subtipo: 'Alumbrado',
    latitude: -2.123,
    longitude: -79.456,
    ...data,
  };
  
  cy.request('POST', '/api/incidents', payload);
});

// Assign responsable
Cypress.Commands.add('assignResponsible', (incidentId, userId) => {
  cy.request('POST', `/api/incidents/${incidentId}/assignments`, {
    user_id: userId,
    role: 'responsable',
  });
});
```

---

### Paso 4: Create Test Files

**File 1**: `cypress/e2e/auth.cy.js`
```javascript
describe('Authentication Flow', () => {
  it('should login with valid credentials', () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type('admin@sistema.com');
    cy.get('input[name="password"]').type('Admin123!');
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('.stat-card').should('be.visible');
  });

  it('should reject invalid email', () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type('invalid');
    cy.get('button[type="submit"]').click();
    cy.get('.invalid-feedback').should('contain', 'email válido');
  });

  it('should logout', () => {
    cy.login();
    cy.get('[data-cy="logout-btn"]').click();
    cy.url().should('include', '/login');
  });

  it('should refresh token automatically', () => {
    cy.login();
    cy.wait(30000); // Wait 30s
    cy.get('[data-cy="stat-total"]').should('be.visible'); // Still logged in
  });
});
```

**File 2**: `cypress/e2e/incidents.cy.js`
```javascript
describe('Incidents CRUD Workflow', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/incidencias');
  });

  it('should list incidents', () => {
    cy.get('[data-cy="incident-list"]').should('exist');
    cy.get('[data-cy="incident-row"]').should('have.length.greaterThan', 0);
  });

  it('should create incident with form', () => {
    cy.get('[data-cy="btn-new-incident"]').click();
    cy.url().should('include', '/incidencias/crear');
    
    cy.get('input[name="title"]').type('Bache en calle X');
    cy.get('textarea[name="description"]').type('Descripción del bache');
    cy.get('select[name="priority"]').select('alta');
    cy.get('input[name="latitude"]').type('-2.123');
    cy.get('input[name="longitude"]').type('-79.456');
    
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/incidencias');
    cy.get('[data-cy="success-toast"]').should('contain', 'creada');
  });

  it('should view incident detail', () => {
    cy.get('[data-cy="incident-row"]').first().click();
    cy.url().should('match', /\/incidencias\/\d+/);
    cy.get('[data-cy="incident-title"]').should('be.visible');
  });
});
```

**File 3**: `cypress/e2e/dashboard.cy.js`
```javascript
describe('Dashboard Filters', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/dashboard');
  });

  it('should display stats cards', () => {
    cy.get('[data-cy="stat-total"]').should('be.visible');
    cy.get('[data-cy="stat-pending"]').should('be.visible');
    cy.get('[data-cy="stat-resolved"]').should('be.visible');
  });

  it('should filter by date range', () => {
    cy.get('[data-cy="btn-filter"]').click();
    cy.get('input[type="date"][name="inicio"]').type('2026-07-01');
    cy.get('input[type="date"][name="fin"]').type('2026-07-14');
    cy.get('[data-cy="btn-apply"]').click();
    
    // Verify charts updated
    cy.get('[data-cy="chart-status"]').should('exist');
  });

  it('should filter by type', () => {
    cy.get('[data-cy="btn-filter"]').click();
    cy.get('select[name="tipo_id"]').select('Infraestructura');
    cy.get('[data-cy="btn-apply"]').click();
    
    cy.get('[data-cy="stat-total"]').then($stat => {
      const count = $stat.text();
      expect(count).to.match(/\d+/); // Should be a number
    });
  });

  it('should filter by location cascade', () => {
    cy.get('[data-cy="btn-filter"]').click();
    cy.get('select[name="pais_id"]').select('Ecuador');
    cy.get('select[name="provincia_id"]').should('be.visible');
    cy.get('select[name="provincia_id"]').select('Santa Elena');
    cy.get('[data-cy="btn-apply"]').click();
  });
});
```

**File 4**: `cypress/e2e/status-flow.cy.js`
```javascript
describe('Status Workflow', () => {
  it('should transition through states correctly', () => {
    cy.login();
    cy.createIncident({ title: 'Status Test' }).then(({ body: incident }) => {
      cy.visit(`/incidencias/${incident.data.id}`);
      
      // Pendiente → En Proceso
      cy.get('[data-cy="btn-status"]').click();
      cy.get('[data-cy="status-en_proceso"]').click();
      cy.get('[data-cy="status-badge"]').should('contain', 'En Proceso');
      
      // En Proceso → Resuelto
      cy.get('[data-cy="btn-status"]').click();
      cy.get('[data-cy="status-resuelto"]').click();
      cy.get('[data-cy="status-badge"]').should('contain', 'Resuelto');
    });
  });
});
```

---

### Paso 5: Add Test Data (Fixtures)
**Archivo**: `cypress/fixtures/users.json`

```json
{
  "admin": {
    "email": "admin@sistema.com",
    "password": "Admin123!"
  },
  "operator": {
    "email": "operador@sistema.com",
    "password": "Operador123!"
  }
}
```

---

### Paso 6: Run Tests
**Terminal**:
```bash
# Open Cypress UI
npx cypress open

# Run tests in headless mode (CI/CD)
npx cypress run

# Run specific test file
npx cypress run --spec "cypress/e2e/auth.cy.js"

# Generate report
npx cypress run --reporter junit --reporter-options "mochaFile=test-results/junit.xml"
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

- [ ] 7 E2E test files created (auth, incidents, dashboard, status-flow, assignments, comments, claims)
- [ ] All tests PASS: `npx cypress run`
- [ ] Coverage: 15+ critical user journeys tested
- [ ] Custom commands working (login, createIncident, etc.)
- [ ] Tests can run in CI/CD headless mode
- [ ] Screenshots/videos generated on failure
- [ ] Average test runtime < 5 minutes total

---

## 🧪 VERIFICACIÓN

```bash
# 1. Run all tests headless
npx cypress run

# 2. Check test count
npx cypress run --dry-run | grep "passing\|failing"

# 3. Generate coverage report
npx cypress run --coverage

# 4. Run specific test
npx cypress run --spec "cypress/e2e/dashboard.cy.js"
```

---

## 📝 NOTAS

- **data-cy attributes**: Add `data-cy="identifier"` to HTML for reliable selectors
- **Headless mode**: Faster in CI/CD; UI mode for development
- **Flaky tests**: Use `cy.intercept()` to mock API calls if needed
- **Screenshots**: Automatically saved on failure in `cypress/screenshots/`

---

**Status**: 🔲 NO INICIADO  
**Asignado a**: Todos (parallelizable por file)  
**Fecha inicio**: 2026-07-15  
**Fecha fin estimada**: 2026-07-17

