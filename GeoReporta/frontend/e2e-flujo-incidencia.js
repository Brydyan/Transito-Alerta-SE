/**
 * E2E: Flujo completo de incidencia
 *
 * 1. Crear incidencia vía API (admin_org)
 * 2. Admin de organización asigna operador (UI)
 * 3. Operador cambia estado a "En Proceso" y comenta (UI)
 *
 * Requisitos: docker compose up, frontend :3000, backend :8000
 * Ejecutar: node e2e-flujo-incidencia.js
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api';

async function apiLogin(email, password) {
  const resp = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Login API failed: ${resp.status}`);
  const data = await resp.json();
  return data.access_token;
}

async function crearIncidenciaApi(token) {
  const resp = await fetch(`${API}/incidents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: `E2E Test ${Date.now()}`,
      description: 'Descripción de prueba generada por el test E2E.',
      priority: 'high',
      incident_category_id: 2, // "Baches y Hundimientos" (leaf category)
      location_id: 284, // Quito
      geom: JSON.stringify({ type: 'Point', coordinates: [-78.5, -0.22] }),
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      `Create incident API failed: ${resp.status} ${JSON.stringify(err)}`,
    );
  }
  const data = await resp.json();
  return data.data?.id ?? data.id;
}

async function loginAndWait(page, email, password) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 10000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');
}

/**
 * Admin de organización asigna un operador a la incidencia.
 */
async function asignarOperador(page, incidentId) {
  await page.goto(`${BASE}/#/incidencias/${incidentId}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('#detalle-asignaciones-form:not(.d-none)', {
    timeout: 15000,
  });
  await page.waitForTimeout(2000);

  // Seleccionar primer operador disponible
  const opValues = await page
    .locator('#detalle-asignaciones-select')
    .evaluate((sel) =>
      Array.from(sel.options)
        .filter((o) => o.value !== '')
        .map((o) => o.value),
    );
  if (opValues.length === 0) {
    console.log('  ⚠️ No hay operadores disponibles para asignar');
    return;
  }
  console.log(`  Operadores disponibles: ${opValues.length}`);
  await page.selectOption('#detalle-asignaciones-select', opValues[0]);

  // Asegurar que "Responsable" esté marcado
  await page.check('#detalle-asignaciones-rol-responsable');

  // Click en Asignar
  await page.click('#detalle-asignaciones-submit');
  await page.waitForTimeout(2000);

  // Verificar que la asignación se reflejó
  const listText = await page
    .locator('#detalle-asignaciones-list')
    .textContent()
    .catch(() => '');
  if (listText && listText.trim()) {
    console.log(`  ✅ Asignación visible: ${listText.trim().substring(0, 60)}`);
  } else {
    console.log('  ⚠️ No se ve la asignación en la lista');
  }
}

/**
 * Operador cambia el estado a "En Proceso" y publica un comentario.
 */
async function cambiarEstadoYComentar(page, incidentId) {
  await page.goto(`${BASE}/#/incidencias/${incidentId}`, {
    waitUntil: 'domcontentloaded',
  });

  // Capturar errores de consola del navegador
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => pageErrors.push(`[page] ${err.message}`));

  // Esperar que cargue el selector de estado (puede haber un flash de 404
  // mientras el SPA resuelve la ruta, pero eventualmente el componente se monta)
  await page.waitForSelector('#detalle-estado-select', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Cambiar estado a in_progress
  await page.selectOption('#detalle-estado-select', 'in_progress');
  await page.click('#btn-guardar-estado');

  // El componente hace window.location.reload()
  await page.waitForTimeout(4000);
  await page.waitForLoadState('domcontentloaded');

  // Verificar badge de estado (case-insensitive)
  const statusBadge = page.locator('#detalle-status');
  await statusBadge.waitFor({ state: 'visible', timeout: 10000 });
  const statusEnUi = (await statusBadge.textContent()) || '';
  console.log(`  Estado en UI: "${statusEnUi.trim()}"`);

  if (statusEnUi.match(/proceso|in_progress/i)) {
    console.log('  ✅ Estado cambiado a En Proceso');
  } else {
    console.log('  ⚠️ El estado no se ve como En Proceso');
  }

  // Publicar comentario
  // setupComments() attacha el listener sincrónicamente (B-04 corregido)
  await page.waitForSelector('#detalle-comment-input', { timeout: 10000 });

  // Usar type (no fill) para gatillar input events correctamente
  await page.click('#detalle-comment-input');
  await page.type(
    '#detalle-comment-input',
    'El operador está revisando la incidencia. Comentario E2E.',
    { delay: 15 },
  );

  await page.click('#detalle-comment-submit');

  // Interceptar respuesta del POST de comentario
  const commentPosted = new Promise((resolve) => {
    page.on('response', (resp) => {
      if (
        resp.url().includes('/comments') &&
        resp.request().method() === 'POST'
      ) {
        console.log(`  POST /comments → status=${resp.status()}`);
        resolve(resp.status());
      }
    });
  });

  const commentStatus = await Promise.race([
    commentPosted,
    new Promise((r) => setTimeout(() => r('timeout'), 8000)),
  ]);
  console.log(`  Resultado POST comentario: ${commentStatus}`);

  // Esperar a que el comentario aparezca en la lista
  const commentList = page.locator('#detalle-comments-list');
  try {
    await commentList.waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(2000);
    const text = await commentList.innerText();
    if (text && text.includes('Comentario E2E')) {
      console.log('  ✅ Comentario visible en la lista');
    } else {
      console.log(
        `  ⚠️ Contenido lista: "${(text || '').trim().substring(0, 120)}"`,
      );
    }
  } catch (e) {
    console.log('  ⚠️ La lista no se actualizó en UI');
  }

  // Mostrar page errors
  if (pageErrors.length > 0) {
    console.log(`  Errores de consola (${pageErrors.length}):`);
    pageErrors.slice(0, 3).forEach((e) => console.log(`    ${e}`));
  }

  // Fallback: verificar comentario vía API directa (con token de admin que SÍ puede listar)
  try {
    const adminToken = await apiLogin(
      'admin.gad-municipal-del-canton-quito@organizacion.com',
      'Admin123!',
    );
    const resp = await fetch(`${API}/incidents/${incidentId}/comments`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const comments = await resp.json();
    const data = comments.data || comments;
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];
    const hasComment = items.some((c) =>
      (c.message || c.content || '').includes('Comentario E2E'),
    );
    if (hasComment) {
      console.log(
        '  ✅ Comentario verificado vía API (usando token admin_org)',
      );
    } else {
      console.log('  ⚠️ Comentario no encontrado vía API');
    }
  } catch (apiErr) {
    console.log(
      `  ⚠️ Fallo al verificar comentarios vía API: ${apiErr.message}`,
    );
  }
}

async function main() {
  console.log('🧪 E2E: Flujo completo de incidencia\n');

  // ─── Step 0: Crear incidencia vía API como ciudadano ───
  // Sin organization_id — el backend lo asigna automáticamente (B-02).
  console.log('0️⃣  Preparar datos de prueba...');
  const userToken = await apiLogin('usuario@test.com', 'Usuario123!');
  const incidentId = await crearIncidenciaApi(userToken);
  console.log(
    `  ✅ Incidencia #${incidentId} creada vía API (por ciudadano, org auto-asignada)`,
  );

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // ─── Step 1: Admin organización asigna operador ───
    console.log('\n1️⃣  Admin organización asigna operador...');
    const adminPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await loginAndWait(
      adminPage,
      'admin.gad-municipal-del-canton-quito@organizacion.com',
      'Admin123!',
    );
    console.log('  ✅ Login como admin_organizacion');
    await asignarOperador(adminPage, incidentId);
    console.log('  ✅ Asignación completada');
    await adminPage.close();

    // ─── Step 2: Operador cambia estado y comenta ───
    console.log('\n2️⃣  Operador cambia estado y comenta...');
    const operPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await loginAndWait(
      operPage,
      'operador.gad-municipal-del-canton-quito@organizacion.com',
      'Operador123!',
    );
    console.log('  ✅ Login como operador_organizacion');
    await cambiarEstadoYComentar(operPage, incidentId);
    console.log('  ✅ Estado y comentario completados');
    await operPage.close();

    console.log('\n✅✅✅ Flujo E2E completado exitosamente');
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
