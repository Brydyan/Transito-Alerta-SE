# T7: E2E Tests (Playwright)

**Responsable:** QA / Frontend  
**Duración:** 1.5 semanas  
**Prioridad:** 🟡 MEDIA  
**Dependencia:** T2, T4 (Frontend), T1 (Backend)

---

## 📝 Descripción

Tests end-to-end simulando flujos reales con Playwright (desktop + mobile PWA).

---

## 🛠️ Pasos Detallados

### Paso 1: Setup Playwright

```bash
cd frontend

npm install -D @playwright/test

npx playwright install
```

**File: `playwright.config.ts`**
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'ng serve',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Paso 2: Citizen Report Flow

**File: `e2e/citizen-report.spec.ts`**
```typescript
import { test, expect, Page } from '@playwright/test';

test.describe('Citizen Report Flow', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/');
  });

  test('should create incident report offline', async () => {
    // Navigate to report form
    await page.click('button:has-text("Reportar")');
    await expect(page).toHaveURL('/report');

    // Grant geolocation permission
    await page.context().grantPermissions(['geolocation']);

    // Fill form
    await page.fill('input[name="title"]', 'Semáforo roto');
    await page.fill('textarea[name="description"]', 'Semáforo no funciona en esquina');
    await page.selectOption('select[name="priority"]', 'high');

    // Upload photo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('test-image.jpg');

    // Go offline
    await page.context().setOffline(true);

    // Submit
    await page.click('button:has-text("Enviar Reporte")');

    // Verify queued message
    await expect(page.locator('text=Guardado para enviar')).toBeVisible();
  });

  test('should sync when online', async () => {
    // Go online
    await page.context().setOffline(false);

    // Wait for sync
    await page.waitForLoadState('networkidle');

    // Verify success message
    await expect(page.locator('text=Sincronizado exitosamente')).toBeVisible();
  });

  test('should show offline status', async () => {
    await page.context().setOffline(true);

    // Verify offline badge
    const offlineBadge = page.locator('[data-test="offline-badge"]');
    await expect(offlineBadge).toBeVisible();

    await page.context().setOffline(false);
    await expect(offlineBadge).not.toBeVisible();
  });
});
```

### Paso 3: Admin Dashboard Flow

**File: `e2e/admin-dashboard.spec.ts`**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as operator
    await page.fill('input[name="email"]', 'operator@test.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL('/dashboard');
  });

  test('should display incidents list', async ({ page }) => {
    const incidentsList = page.locator('[data-test="incidents-list"]');
    await expect(incidentsList).toBeVisible();

    const rows = page.locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter incidents by priority', async ({ page }) => {
    // Click filter dropdown
    await page.click('select[name="priority-filter"]');
    await page.selectOption('select[name="priority-filter"]', 'high');

    // Wait for filtered results
    await page.waitForLoadState('networkidle');

    // Verify only high priority shown
    const priorityBadges = page.locator('span[data-priority="high"]');
    await expect(priorityBadges.first()).toBeVisible();
  });

  test('should update incident status', async ({ page }) => {
    // Click first incident
    await page.click('[data-test="incidents-list"] tr:first-child');
    await page.waitForURL('/incidents/*');

    // Change status
    await page.click('button:has-text("Cambiar Estado")');
    await page.selectOption('select[name="status"]', 'in_progress');
    await page.click('button:has-text("Actualizar")');

    // Verify update
    await expect(page.locator('text=Estado actualizado')).toBeVisible();
  });

  test('should show map view', async ({ page }) => {
    // Click map tab
    await page.click('a:has-text("Mapa")');
    
    // Verify map loaded
    const leafletMap = page.locator('.leaflet-map-pane');
    await expect(leafletMap).toBeVisible();

    // Verify markers visible
    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible();
  });
});
```

### Paso 4: Offline Simulation

**File: `e2e/offline-flow.spec.ts`**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Offline Mode', () => {
  test('should handle offline with IndexedDB', async ({ page, context }) => {
    await page.goto('/report');

    // Go offline
    await context.setOffline(true);

    // Create report while offline
    await page.fill('input[name="title"]', 'Offline Report');
    await page.fill('textarea[name="description"]', 'Created while offline');
    await page.click('button:has-text("Enviar")');

    // Should save to IndexedDB
    const offlineMsg = page.locator('text=Guardado localmente');
    await expect(offlineMsg).toBeVisible();

    // Go online
    await context.setOffline(false);
    await page.waitForLoadState('networkidle');

    // Verify sync happened
    const syncMsg = page.locator('text=Sincronizado');
    await expect(syncMsg).toBeVisible();
  });

  test('should retry failed syncs', async ({ page, context }) => {
    await page.goto('/report');

    // Simulate partial offline
    await context.setOffline(true);
    await page.fill('input[name="title"]', 'Retry Test');
    await page.click('button:has-text("Enviar")');

    // Go online but server returns error
    await context.setOffline(false);
    
    // Should show retry button
    const retryBtn = page.locator('button:has-text("Reintentar")');
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
      await page.waitForLoadState('networkidle');
    }
  });
});
```

### Paso 5: Mobile PWA Tests

**File: `e2e/mobile-pwa.spec.ts`**
```typescript
import { test, expect, devices } from '@playwright/test';

test.describe('Mobile PWA', () => {
  test.use(devices['Pixel 5']);

  test('should install PWA', async ({ page }) => {
    await page.goto('/');

    // Check for install prompt
    const installPrompt = page.locator('[data-test="install-pwa"]');
    if (await installPrompt.isVisible()) {
      await installPrompt.click();
      // Would trigger native install in real scenario
    }
  });

  test('should work offline on mobile', async ({ page, context }) => {
    await page.goto('/');

    // Go offline
    await context.setOffline(true);

    // Should still load cached assets
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();

    // Navigation should work
    await page.click('button:has-text("Reportar")');
    await expect(page).toHaveURL('/report');
  });

  test('should capture photo on mobile', async ({ page }) => {
    await page.goto('/report');

    // Note: Real photo capture requires device interaction
    // This simulates file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('test-image.jpg');

    // Verify preview
    const preview = page.locator('img[data-test="photo-preview"]');
    await expect(preview).toBeVisible();
  });
});
```

### Paso 6: Ejecutar Tests

```bash
cd frontend

# Run all tests
npx playwright test

# Run specific file
npx playwright test e2e/citizen-report.spec.ts

# Debug mode
npx playwright test --debug

# Generate report
npx playwright show-report
```

---

## ✅ Criterios de Aceptación

- [ ] **Setup**
  - [ ] playwright.config.ts configurado
  - [ ] Proyectos: chromium, firefox, mobile chrome
  - [ ] baseURL apunta a http://localhost:4200
  - [ ] Reporter HTML configurado

- [ ] **Citizen Report Flow**
  - [ ] Navega a /report
  - [ ] Rellena formulario (title, description, priority)
  - [ ] Carga foto correctamente
  - [ ] Offline: guardado localmente, toast visible
  - [ ] Online: sincronización automática
  - [ ] Éxito: mensajeconfirmación

- [ ] **Admin Dashboard**
  - [ ] Login como operador funciona
  - [ ] Lista de incidentes visible
  - [ ] Filtro por prioridad funciona
  - [ ] Filtro por estado funciona
  - [ ] Click en incidente → detalle
  - [ ] Cambio de status actualiza UI en tiempo real
  - [ ] Mapa visible con marcadores

- [ ] **Offline Simulation**
  - [ ] context.setOffline(true/false) funciona
  - [ ] Reportes quedan en IndexedDB offline
  - [ ] Sincronización al volver online
  - [ ] Retry logic funcionando

- [ ] **Mobile PWA**
  - [ ] Responsive en Pixel 5
  - [ ] Funciona offline en mobile
  - [ ] Photo capture simula correctamente
  - [ ] Touch interactions funcionan

- [ ] **Execution**
  - [ ] Todos los tests pasan en CI
  - [ ] HTML report generado
  - [ ] Screenshots/videos en fallos
  - [ ] Retries configurados

---

## 🔗 Referencias

- **Playwright:** https://playwright.dev/
- **Playwright Testing Guide:** https://playwright.dev/docs/intro

---

**Status:** ⏳ TODO  
**Assigned to:** QA / Frontend Developer  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
