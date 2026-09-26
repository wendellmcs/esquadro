'use strict';
const test = require('node:test');
const assert = require('node:assert');
const degraus = require('../scripts/lib/degraus.js');

test('degraus: aceita as tres formas e devolve sempre a canonica', () => {
  const r = degraus.normalizar([
    { agente: 'busca', apelido: 'barato' },
    { nome: 'arquiteto', model: 'caro' },
    'sem-apelido'
  ]);
  assert.deepStrictEqual(r, [
    { agente: 'busca', apelido: 'barato' },
    { agente: 'arquiteto', apelido: 'caro' },
    { agente: 'sem-apelido', apelido: '' }
  ]);
});

test('degraus: a ORDEM e o dado, e ela se preserva', () => {
  const r = degraus.paraProjeto([
    { agente: 'c', apelido: 'x' }, { agente: 'a', apelido: 'y' }, { agente: 'b', apelido: 'z' }
  ]);
  assert.deepStrictEqual(r.escada, ['c', 'a', 'b']);
  assert.deepStrictEqual(r.degraus.map((d) => d.agente), ['c', 'a', 'b']);
});

test('degraus: escada vazia e resposta legitima, nao erro', () => {
  assert.strictEqual(degraus.validar([]).ok, true);
});

test('degraus: um degrau sozinho nao e escada', () => {
  const r = degraus.validar([{ agente: 'unico', apelido: 'x' }]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('nao opina')), r.erros.join(' | '));
});

test('degraus: degrau sem apelido e erro nomeado', () => {
  const r = degraus.validar([{ agente: 'a', apelido: '' }, { agente: 'b', apelido: 'y' }]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('sem apelido')), r.erros.join(' | '));
});

// Decisao 12: apelido e METODO, id de modelo e RESULTADO - e resultado apodrece.
test('degraus: id de modelo no lugar do apelido e recusado', () => {
  const r = degraus.validar([{ agente: 'a', apelido: 'claude-opus-5' }, { agente: 'b', apelido: 'y' }]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('id de modelo')), r.erros.join(' | '));
});

test('degraus: agente repetido e erro - indexOf so acharia o primeiro', () => {
  const r = degraus.validar([{ agente: 'a', apelido: 'x' }, { agente: 'a', apelido: 'y' }]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('repetido')), r.erros.join(' | '));
});

test('degraus: escada de dois degraus limpos passa', () => {
  const r = degraus.validar([{ agente: 'busca', apelido: 'barato' }, { agente: 'arquiteto', apelido: 'caro' }]);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

test('degraus: escada e degraus casados nao acusam nada', () => {
  const a = degraus.paraProjeto([{ agente: 'a', apelido: 'x' }, { agente: 'b', apelido: 'y' }]);
  assert.deepStrictEqual(degraus.desalinhados(a), []);
});

test('degraus: configuracao anterior - escada sem degraus - continua valida', () => {
  assert.deepStrictEqual(degraus.desalinhados({ escada: ['a', 'b'] }), []);
});

test('degraus: degraus sem escada deixa o portao de custo mudo, e isso se acusa', () => {
  const r = degraus.desalinhados({ degraus: [{ agente: 'a', apelido: 'x' }] });
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].includes('mudo'), r[0]);
});

test('degraus: a MESMA ordem, nao so os mesmos nomes', () => {
  const r = degraus.desalinhados({
    escada: ['a', 'b'],
    degraus: [{ agente: 'b', apelido: 'y' }, { agente: 'a', apelido: 'x' }]
  });
  assert.strictEqual(r.length, 2, JSON.stringify(r));
  assert.ok(r[0].includes('posicao 1'), r[0]);
});

test('degraus: tamanhos diferentes viram problema nomeado', () => {
  const r = degraus.desalinhados({ escada: ['a', 'b', 'c'], degraus: [{ agente: 'a', apelido: 'x' }] });
  assert.ok(r.some((p) => p.includes('3 nome(s)')), JSON.stringify(r));
});

test('degraus: o motivo cita cada problema e diz o conserto', () => {
  const m = degraus.motivoDesalinhado(['posicao 1: a escada diz "a"']);
  assert.ok(m.includes('posicao 1'));
  assert.ok(m.includes('entrevista'));
});
