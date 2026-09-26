'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

function rodar(script, entrada) {
  return spawnSync(process.execPath, [path.join(RAIZ, 'scripts', script)], {
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
    encoding: 'utf8'
  });
}

function rodarArquivo(caminhoRelativo, entrada) {
  return spawnSync(process.execPath, [path.join(RAIZ, caminhoRelativo)], {
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
    encoding: 'utf8'
  });
}

test('io: exporta os cinco nomes que os portoes usam', () => {
  const io = require('../scripts/lib/io.js');
  for (const nome of ['lerEntrada', 'permitir', 'negarFerramenta', 'bloquearFecho', 'blindar']) {
    assert.strictEqual(typeof io[nome], 'function', 'falta ' + nome);
  }
});

test('io: blindar engole excecao e sai com 0', () => {
  const io = require('../scripts/lib/io.js');
  const saidaOriginal = process.exitCode;
  let saiu = null;
  const exitOriginal = process.exit;
  process.exit = (c) => { saiu = c; throw new Error('__parar__'); };
  try {
    io.blindar(() => { throw new Error('estourou de proposito'); });
  } catch (e) {
    if (e.message !== '__parar__') throw e;
  } finally {
    process.exit = exitOriginal;
    process.exitCode = saidaOriginal;
  }
  assert.strictEqual(saiu, 0);
});

test('abertura: hook responde 0 mesmo com stdin vazio', () => {
  const r = rodar('abertura.js', '');
  assert.strictEqual(r.status, 0, 'stderr: ' + r.stderr);
});

test('abertura: hook responde 0 com JSON invalido', () => {
  const r = rodar('abertura.js', '{isso nao e json');
  assert.strictEqual(r.status, 0, 'stderr: ' + r.stderr);
});

test('io: blindar cobre excecao lancada dentro do callback assincrono de lerEntrada', () => {
  const r = rodarArquivo('test/auxiliar-blindar-async.js', '');
  assert.strictEqual(r.status, 0, 'stderr: ' + r.stderr);
});
