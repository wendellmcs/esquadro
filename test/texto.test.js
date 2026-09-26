'use strict';
const test = require('node:test');
const assert = require('node:assert');
const texto = require('../scripts/lib/texto.js');

const BOM = String.fromCharCode(65279);

test('texto: remove o BOM inicial', () => {
  assert.strictEqual(texto.semBom(BOM + '{"a":1}'), '{"a":1}');
});

test('texto: string sem BOM fica intacta', () => {
  assert.strictEqual(texto.semBom('{"a":1}'), '{"a":1}');
});

test('texto: BOM que nao esta no inicio nao e tocado', () => {
  const s = 'a' + BOM + 'b';
  assert.strictEqual(texto.semBom(s), s);
});

test('texto: converte valor nao-string com String()', () => {
  assert.strictEqual(texto.semBom(123), '123');
  assert.strictEqual(texto.semBom(null), 'null');
  assert.strictEqual(texto.semBom(undefined), 'undefined');
});

test('texto: string vazia nao estoura', () => {
  assert.strictEqual(texto.semBom(''), '');
});

test('texto: Buffer lido como utf8 com BOM tambem funciona', () => {
  const bruto = Buffer.from(BOM + '{"a":1}', 'utf8').toString('utf8');
  assert.strictEqual(texto.semBom(bruto), '{"a":1}');
});
