#!/usr/bin/env node
'use strict';
const config = require('./lib/config.js');
const cobertura = require('./lib/cobertura.js');

const cwd = process.cwd();
const r = cobertura.relatorio(cwd, config.carregarProjeto(cwd));

if (process.argv.indexOf('--json') !== -1) {
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
} else {
  process.stdout.write(cobertura.texto(r) + '\n');
}
process.exit(0);
