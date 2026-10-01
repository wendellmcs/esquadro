#!/usr/bin/env node
'use strict';
const auditoria = require('./lib/auditoria.js');
const config = require('./lib/config.js');

// --memoria <caminho do MEMORY.md>: quem chama (a skill) passa o caminho; o script nao o adivinha.
// Sem o argumento, ou sem valor depois dele, a chave `memoria` diz "nao medida" e a causa.
function valor(nome) {
  const i = process.argv.indexOf(nome);
  const v = i !== -1 ? process.argv[i + 1] : null;
  return v && !v.startsWith('--') ? v : null;
}

const cwd = process.cwd();
const r = auditoria.auditar(cwd, config.carregarProjeto(cwd) || {}, { memoria: valor('--memoria') });
process.stdout.write(JSON.stringify(r, null, 2) + '\n');
process.exit(0);
