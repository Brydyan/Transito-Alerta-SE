#!/usr/bin/env node
// Corre la suite de tests real (backend Pest + frontend Vitest) y cuenta líneas
// de código real, para reemplazar los "casos" y "kloc" hardcodeados de E4 por
// datos vivos. Los defectos (severidad) y el desglose por módulo NO salen de acá:
// son juicio de QA y siguen viniendo de data/defectos-manual.json.
//
// Requisitos: `php` con la suite operativa (mismo entorno que CI, ver
// .github/workflows/ci.yml) y `npm` con dependencias instaladas en frontend/.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const backendDir = path.join(repoRoot, 'backend');
const frontendDir = path.join(repoRoot, 'frontend');
const outPath = path.join(scriptDir, '..', 'data', 'live-metrics.json');

function runIgnoringTestFailures(cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch {
    // Tests failing is real data, not a script error — the JUnit file is what matters.
  }
}

// JUnit is standard for both PHPUnit/Pest and Vitest's junit reporter, so a
// tag-count parser (no XML dependency) works for both without caring about nesting.
function parseJUnitCounts(xmlPath) {
  const xml = readFileSync(xmlPath, 'utf-8');
  const testcases = (xml.match(/<testcase\b/g) || []).length;
  const failures = (xml.match(/<failure\b/g) || []).length;
  const errors = (xml.match(/<error\b/g) || []).length;
  const skipped = (xml.match(/<skipped\b/g) || []).length;
  const ejecutados = testcases - skipped;
  const fallidos = failures + errors;
  return { ejecutados, aprobados: ejecutados - fallidos, fallidos };
}

function collectBackendCasos(tmpDir) {
  const junitPath = path.join(tmpDir, 'backend-junit.xml');
  // --no-coverage: this repo's phpunit.xml declares a <coverage> report but no
  // coverage driver (pcov/xdebug) is required for our indicators, and without
  // this flag PHPUnit aborts silently (no output, exit 1) when no driver is present.
  runIgnoringTestFailures(
    `php artisan test --no-coverage --log-junit "${junitPath}"`,
    backendDir
  );
  return parseJUnitCounts(junitPath);
}

function collectFrontendCasos(tmpDir) {
  const junitPath = path.join(tmpDir, 'frontend-junit.xml');
  runIgnoringTestFailures(
    `npm run test -- --reporter=junit --outputFile="${junitPath}"`,
    frontendDir
  );
  return parseJUnitCounts(junitPath);
}

const SOURCE_EXTENSIONS = new Set(['.php', '.js', '.mjs', '.ts', '.vue']);
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules', 'vendor', 'tests', 'test', '__tests__',
  '.git', 'storage', 'bootstrap', 'coverage', 'dist', 'build',
]);

function countLines(dir) {
  let lines = 0;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIR_NAMES.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      lines += countLines(full);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      lines += readFileSync(full, 'utf-8').split('\n').length;
    }
  }
  return lines;
}

function main() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'e5-live-metrics-'));

  console.log('Corriendo suite backend (php artisan test --no-coverage)...');
  const backendCasos = collectBackendCasos(tmpDir);

  console.log('Corriendo suite frontend (npm run test -- --reporter=junit)...');
  const frontendCasos = collectFrontendCasos(tmpDir);

  rmSync(tmpDir, { recursive: true, force: true });

  const casos = {
    ejecutados: backendCasos.ejecutados + frontendCasos.ejecutados,
    aprobados: backendCasos.aprobados + frontendCasos.aprobados,
    fallidos: backendCasos.fallidos + frontendCasos.fallidos,
  };

  console.log('Contando líneas de código real (app/ backend + frontend)...');
  const backendLines = countLines(path.join(backendDir, 'app'));
  const frontendLines = countLines(path.join(frontendDir, 'app'));
  const kloc = Math.round(((backendLines + frontendLines) / 1000) * 100) / 100;

  const snapshot = {
    timestamp: new Date().toISOString(),
    casos,
    backend: backendCasos,
    frontend: frontendCasos,
    kloc,
    lineas: { backend: backendLines, frontend: frontendLines },
  };

  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

  console.log('\nCasos (backend + frontend, real):');
  console.table(casos);
  console.log(`KLOC real: ${kloc} (backend ${backendLines} + frontend ${frontendLines} líneas)`);
  console.log(`\nGuardado en: ${outPath}`);
  console.log('Corré scripts/analyze-metrics.mjs para recalcular los indicadores con estos datos.');
}

main();
