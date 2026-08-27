#!/usr/bin/env node
/**
 * database/seeds/lib/deps.js
 *
 * T7.9.D3 (design.md D7) — reexport `pg.Client` y `bcrypt` desde el árbol
 * `backend/node_modules` para que los scripts de `database/seeds/*.js` los
 * consuman sin reinventar el resolver de Node.
 *
 * Por qué hace falta (la trampa):
 *   - No existe `package.json` en la raíz del repo (sólo en `backend/`).
 *   - Node resuelve `require('pg')` desde el directorio del archivo que
 *     importa, no desde el cwd. Un `require('pg')` directo dentro de
 *     `database/seeds/users.js` fallaría con `Cannot find module 'pg'`,
 *     sin importar cómo se invoque el script.
 *   - `createRequire(path.resolve(__dirname, '../../../backend/package.json'))`
 *     fija el "directorio de resolución" en `backend/`, y desde allí
 *     `pg`/`bcrypt` sí son visibles.
 *
 * Por qué NO otras alternativas (todas rechazadas en design.md D7):
 *   - Crear un `package.json` raíz con sus propias deps ⇒ dos bcrypts nativos,
 *     drift de versiones, contradice `working_dir: backend` de config.yaml.
 *   - `NODE_PATH=../backend/node_modules` en el npm script ⇒ deprecated hook
 *     de resolver, se rompe si el operador corre `node users.js` a mano.
 *   - Hash literal en el repo ⇒ credencial en git, no rotable.
 *   - Boot Nest para obtener `PasswordHasher` ⇒ viola R22.2 (generadores en
 *     JS plano) y arrastra TypeORM + Redis + el grafo DI entero por una
 *     función.
 *
 * Usado por: users.js, demo-incidents.js, volume-incidents.js,
 * rebuild-feed.ts (vía require()). Mantener API estable — todo `*.js` en
 * este directorio debería poder hacer:
 *
 *     const { Client, bcrypt } = require('./lib/deps');
 *
 * sin re-implementar el bridge.
 */
'use strict';

const { createRequire } = require('module');
const path = require('path');

/**
 * Resolvedor anclado al package.json del backend. Un solo punto de
 * verdad: cambiar la ubicación del backend ⇒ un único path a editar.
 */
const backendRequire = createRequire(
  path.resolve(__dirname, '../../../backend/package.json'),
);

const { Client } = backendRequire('pg');
const bcrypt = backendRequire('bcrypt');

module.exports = { Client, bcrypt };
