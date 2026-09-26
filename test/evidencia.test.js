'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ev = require('../scripts/lib/evidencia.js');

test('evidencia: alegacao sem bloco e sem ressalva bloqueia', () => {
  assert.strictEqual(ev.deveBloquear('Pronto, os testes passaram.'), true);
  assert.strictEqual(ev.deveBloquear('Corrigido e funcionando.'), true);
  assert.strictEqual(ev.deveBloquear('All tests pass now.'), true);
});

test('evidencia: alegacao COM bloco de saida passa', () => {
  const texto = 'Os testes passaram.\n\n```\n$ npm test\n# pass 12\n# fail 0\n```';
  assert.strictEqual(ev.deveBloquear(texto), false);
});

test('evidencia: alegacao COM declaracao de nao-rodado passa', () => {
  assert.strictEqual(ev.deveBloquear('Implementado. Nao rodei os testes: nao ha runner neste repo.'), false);
  assert.strictEqual(ev.deveBloquear('Corrigido, mas nao testei em Windows.'), false);
});

test('evidencia: conversa sem alegacao passa', () => {
  assert.strictEqual(ev.deveBloquear('O arquivo de rotas fica em src/rotas.js.'), false);
  assert.strictEqual(ev.deveBloquear(''), false);
  assert.strictEqual(ev.deveBloquear(undefined), false);
});

test('evidencia: alegacao DENTRO de bloco de codigo nao conta como alegacao', () => {
  const texto = 'Ajustei o texto do botao.\n\n```js\nconst msg = "pronto";\n```';
  const a = ev.analisar(texto);
  assert.strictEqual(a.alegaSucesso, false, 'a palavra estava dentro do bloco');
  assert.strictEqual(ev.deveBloquear(texto), false);
});

test('evidencia: analisar separa os tres sinais', () => {
  const a = ev.analisar('Passou.');
  assert.deepStrictEqual(a, { alegaSucesso: true, temBloco: false, declaraNaoRodou: false });
});

test('evidencia: MOTIVO e ASCII puro (R5) e diz o que fazer', () => {
  assert.ok(/^[\x20-\x7E\n]+$/.test(ev.MOTIVO), 'MOTIVO tem caractere fora de ASCII');
  assert.ok(ev.MOTIVO.includes('declare'));
  assert.ok(ev.MOTIVO.includes('```') || ev.MOTIVO.includes('bloco'));
});

// D31: a trava para de aceitar qualquer par de crases.

test('evidencia D31: bloco vazio de crases nao conta como evidencia (burla fechada)', () => {
  const texto = 'Pronto, os testes passaram.\n\n```\n```';
  assert.strictEqual(ev.deveBloquear(texto), true);
});

test('evidencia D31: bloco de codigo-fonte nao conta como evidencia (burla fechada)', () => {
  const texto = 'Pronto, os testes passaram.\n\n```js\nconsole.log("ok");\n```';
  assert.strictEqual(ev.deveBloquear(texto), true);
});

test('evidencia D31: "sem teste" solto nao conta mais como ressalva honesta (burla fechada)', () => {
  const texto = 'Pronto, sem teste.';
  assert.strictEqual(ev.deveBloquear(texto), true);
});
