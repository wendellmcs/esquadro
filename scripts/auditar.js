#!/usr/bin/env node
'use strict';
const auditoria = require('./lib/auditoria.js');
const config = require('./lib/config.js');

const cwd = process.cwd();
const r = auditoria.auditar(cwd, config.carregarProjeto(cwd) || {});
process.stdout.write(JSON.stringify(r, null, 2) + '\n');
process.exit(0);
