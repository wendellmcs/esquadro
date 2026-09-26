#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const alvo = path.join(process.cwd(), '.claude', 'esquadro', 'contadores.json');
let dados = null;
try { dados = JSON.parse(fs.readFileSync(alvo, 'utf8')); } catch (e) { dados = null; }

if (!dados || Object.keys(dados).length === 0) {
  process.stdout.write('esquadro: nenhum disparo registrado ainda em ' + alvo + '\n');
  process.exit(0);
}

const linhas = Object.keys(dados).map(function (k) { return [k, dados[k]]; })
  .sort(function (a, b) { return b[1] - a[1]; });
const total = linhas.reduce(function (s, l) { return s + l[1]; }, 0);

process.stdout.write('esquadro - disparos por trava (' + alvo + ')\n\n');
for (const [chave, n] of linhas) {
  process.stdout.write('  ' + String(n).padStart(6) + ' | ' + chave + '\n');
}
process.stdout.write('\n  ' + String(total).padStart(6) + ' | TOTAL\n\n');
process.stdout.write('Manter ou tirar trava se decide por estes numeros, nao por impressao.\n');
process.exit(0);
