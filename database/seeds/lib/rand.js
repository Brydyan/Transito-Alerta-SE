#!/usr/bin/env node
/**
 * database/seeds/lib/rand.js
 *
 * T7.9.D5 (design.md D8) — PRNG determinista + derivación de IDs.
 *
 * Principios:
 *  - Cero `Math.random()`, cero `Date.now()`, cero `gen_random_uuid()`
 *    dentro de los seeders (los IDs derivados se mantienen estables entre
 *    corridas; `gen_random_uuid()` rompería la idempotencia).
 *  - Una sola instancia de `mulberry32` por corrida, sembrada con la
 *    constante congelada SEED = 0x20260825 (la fecha del corte — el bit
 *    pattern es estable aunque el año del calendario cambie).
 *  - `uuidV5(name, ns)` es el mismo helper que `generate-geo-zones-seed.js`
 *    ya tenía (T7.9.C3, design.md D1) — version nibble 5, RFC-4122
 *    variant, `node:crypto` puro, sin la dependencia `uuid`.
 *
 * Usado por:
 *   - demo-incidents.js — IDs `uuidV5('demo/incident/'+i, NS_SEED)`.
 *   - volume-incidents.js — IDs `uuidV5('vol/incident/'+i, NS_SEED)`.
 *
 * Frozen constants — NO cambiar. Regenerar IDs rompe:
 *   1. La idempotencia del seeder (un re-run duplicaría filas que la
 *      constraint `ON CONFLICT (id) DO NOTHING` ya no matchearía).
 *   2. La trazabilidad entre la suite E2E y la base sembrada a mano.
 */
'use strict';

const crypto = require('crypto');

/** Semilla congelada del PRNG (design.md D8). */
const SEED = 0x20260825;

/**
 * Namespace congelado para los UUIDs v5 derivados por los seeders.
 * Estructuralmente distinto de `NS_GEO_ZONE` (T7.9.C3) para que
 * parroquias y seeders nunca puedan colisionar aunque compartan el
 * prefijo `uuidV5(...)`.
 *
 * NO regenerar.
 */
const NS_SEED = 'b71c4f0a-3e89-5d72-9a1c-2f8d6e0b4a73';

/**
 * PRNG mulberry32 (Tommy Ettinger / FastPRNG, dominio público). Salida
 * determinista de 32 bits. Inline — sin import, sin dependencias.
 *
 * IMPORTANTE: cada llamada a `mulberry32(SEED)` devuelve una instancia
 * NUEVA; mantener una referencia estable durante la corrida para que el
 * orden de consumo de aleatorios sea reproducible.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero uniforme en [min, max) (ambos enteros). */
function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

/** Selección uniforme de un elemento del array. */
function pick(rng, arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('rand.pick: empty or non-array input');
  }
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Timestamp relativo como `Date`. Se modela como offset sobre EPOCH
 * (en segundos) para mantener todo determinista: nada de `Date.now()`.
 *
 * @param {Date} epoch
 * @param {number} secondsOffset - desplazamiento desde epoch en segundos.
 * @returns {Date}
 */
function deterministicDate(epoch, secondsOffset) {
  return new Date(epoch.getTime() + secondsOffset * 1000);
}

/**
 * RFC-4122 v5 UUID (sha1(namespace || name), 16 bytes, version nibble 5,
 * variant RFC-4122). Misma implementación que `generate-geo-zones-seed.js`
 * (T7.9.C3, design.md D1) — extraída aquí para que demo y volume
 * coincidan exactamente con el formato de las parroquias.
 */
function uuidV5(name, namespace) {
  const nsBytes = Buffer.from(String(namespace).replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(String(name), 'utf8');
  const hash = crypto.createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

module.exports = {
  SEED,
  NS_SEED,
  mulberry32,
  randInt,
  pick,
  deterministicDate,
  uuidV5,
};
