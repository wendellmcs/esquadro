#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const regraLib = require('./lib/regra.js');

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  return i !== -1 ? process.argv[i + 1] : null;
}

const gatilho = (arg('gatilho') || '').trim();
const acao = (arg('acao') || '').trim();
const gravar = process.argv.indexOf('--gravar') !== -1;
const alvo = path.join(process.cwd(), '.claude', 'esquadro', 'regras.md');

if (!gatilho || !acao) {
  process.stdout.write('uso: propor-regra.js --gatilho "<quando>" --acao "<o que fazer>" [--gravar]\n');
  process.exit(1);
}

const bruta = gatilho + ' -> ' + acao;
const v = regraLib.validarRegra(bruta);

if (!v.ok) {
  process.stdout.write('RECUSADA: ' + bruta + '\n');
  for (const e of v.erros) process.stdout.write('  - ' + e + '\n');
  process.exit(1);
}

if (!gravar) {
  // D11: nada e gravado sem OK explicito. O default e NAO escrever.
  process.stdout.write('PROPOSTA (nao gravei nada):\n\n  - ' + bruta + '\n\n');
  process.stdout.write('Destino: ' + alvo + '\n');
  process.stdout.write('Para gravar, rode de novo com --gravar, DEPOIS de o dono aprovar.\n');
  process.exit(0);
}

let texto = '';
try { texto = fs.readFileSync(alvo, 'utf8'); } catch (e) { texto = '# Regras deste projeto\n'; }

if (texto.indexOf(bruta) !== -1) {
  process.stdout.write('JA EXISTE, nao dupliquei: ' + bruta + '\n');
  process.exit(0);
}

const novo = texto.replace(/\s*$/, '') + '\n- ' + bruta + '\n';
const conferencia = regraLib.validarArquivo(novo);
if (!conferencia.ok) {
  process.stdout.write('ERRO: o arquivo ficaria invalido. Nao gravei.\n');
  for (const e of conferencia.erros) process.stdout.write('  - ' + e + '\n');
  process.exit(1);
}

fs.mkdirSync(path.dirname(alvo), { recursive: true });
fs.writeFileSync(alvo, novo, 'utf8');
process.stdout.write('GRAVADA em ' + alvo + ':\n  - ' + bruta + '\n');
process.stdout.write('Total de regras agora: ' + conferencia.total + '\n');
process.exit(0);
