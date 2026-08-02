#!/usr/bin/env node
// Calcula los indicadores de calidad de E5 (docs/Entregables/E5/GUIA_E5_METRICAS_INDICADORES.md)
// combinando dos fuentes:
//   - data/live-metrics.json: casos ejecutados/aprobados/fallidos + KLOC, generados
//     de verdad por scripts/collect-live-metrics.mjs (test suite real + conteo de líneas).
//   - data/defectos-manual.json: severidad de defectos y desglose por módulo, que
//     es juicio de QA y no tiene fuente automática.
// Guarda un snapshot en data/latest.json y lo agrega a data/metrics-history.json
// para poder graficar tendencia en Grafana.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, '..', 'data');
const manualPath = path.join(dataDir, 'defectos-manual.json');
const livePath = path.join(dataDir, 'live-metrics.json');
const latestPath = path.join(dataDir, 'latest.json');
const historyPath = path.join(dataDir, 'metrics-history.json');

const round2 = (n) => Math.round(n * 100) / 100;

function computeIndicadores({ casos, defectos, kloc, modulos }) {
  const tasaExito = round2((casos.aprobados / casos.ejecutados) * 100);

  const modulosConCobertura = modulos.filter(
    (m) => m.aprobados / m.disenados >= 0.5
  ).length;
  const coberturaFuncional = round2((modulosConCobertura / modulos.length) * 100);

  const densidadDefectos = round2(defectos.total / kloc);

  const porcentajeCorreccion = round2((defectos.cerrados / defectos.total) * 100);

  const indicePeligrosidad = round2(
    ((defectos.criticos + defectos.altos) / defectos.total) * 100
  );

  return {
    tasaExito,
    coberturaFuncional,
    densidadDefectos,
    porcentajeCorreccion,
    indicePeligrosidad,
    severidad: {
      criticos: defectos.criticos,
      altos: defectos.altos,
      medios: defectos.medios,
      bajos: defectos.bajos,
    },
    severidadRows: [
      { nivel: 'Críticos', cantidad: defectos.criticos },
      { nivel: 'Altos', cantidad: defectos.altos },
      { nivel: 'Medios', cantidad: defectos.medios },
      { nivel: 'Bajos', cantidad: defectos.bajos },
    ],
  };
}

function computeModulos(modulos) {
  return modulos.map((m) => ({
    ...m,
    tasaAprobacion: round2((m.aprobados / m.disenados) * 100),
  }));
}

function main() {
  if (!existsSync(manualPath)) {
    console.error(`No existe ${manualPath}`);
    process.exit(1);
  }
  if (!existsSync(livePath)) {
    console.error(
      `No existe ${livePath}.\nCorré primero: node scripts/collect-live-metrics.mjs`
    );
    process.exit(1);
  }

  const manual = JSON.parse(readFileSync(manualPath, 'utf-8'));
  const live = JSON.parse(readFileSync(livePath, 'utf-8'));

  const merged = {
    casos: live.casos,
    kloc: live.kloc,
    defectos: manual.defectos,
    modulos: manual.modulos,
  };

  const snapshot = {
    timestamp: new Date().toISOString(),
    fechaDatosManual: manual.fechaDatos,
    fuenteManual: manual.fuente,
    fechaDatosLive: live.timestamp,
    casos: merged.casos,
    defectos: merged.defectos,
    kloc: merged.kloc,
    indicadores: computeIndicadores(merged),
    modulos: computeModulos(merged.modulos),
    burndown: manual.burndown,
  };

  writeFileSync(latestPath, JSON.stringify(snapshot, null, 2));

  const history = existsSync(historyPath)
    ? JSON.parse(readFileSync(historyPath, 'utf-8'))
    : [];
  history.push(snapshot);
  writeFileSync(historyPath, JSON.stringify(history, null, 2));

  console.log('Indicadores calculados:');
  console.table(snapshot.indicadores);
  console.log(`\nGuardado en:\n  ${latestPath}\n  ${historyPath} (${history.length} snapshots)`);
}

main();
