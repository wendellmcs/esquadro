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

// causaDoErro (F3-22, D297 secao 4)
const TRADUCOES = {
  ENOENT: 'nao existe (ENOENT)',
  EACCES: 'sem permissao (EACCES)',
  EPERM: 'sem permissao (EPERM)',
  EISDIR: 'e uma pasta (EISDIR)',
  ENOTDIR: 'parte do caminho nao e uma pasta (ENOTDIR)',
  EBUSY: 'em uso (EBUSY)',
  EEXIST: 'ja existe (EEXIST)',
  ENOSPC: 'disco cheio (ENOSPC)',
};

for (const [codigo, esperado] of Object.entries(TRADUCOES)) {
  test('texto: causaDoErro traduz ' + codigo, () => {
    const e = Object.assign(new Error('falhou'), { code: codigo });
    assert.strictEqual(texto.causaDoErro(e), esperado);
  });
}

test('texto: causaDoErro aceita objeto simples com code (nao e Error)', () => {
  assert.strictEqual(texto.causaDoErro({ code: 'ENOENT' }), 'nao existe (ENOENT)');
});

test('texto: causaDoErro codigo fora da tabela devolve so o codigo', () => {
  const e = Object.assign(new Error('x'), { code: 'ECONNRESET' });
  assert.strictEqual(texto.causaDoErro(e), 'ECONNRESET');
});

test('texto: causaDoErro codigo com nome de propriedade do prototipo nao quebra', () => {
  assert.strictEqual(texto.causaDoErro({ code: 'constructor' }), 'constructor');
  assert.strictEqual(texto.causaDoErro({ code: 'toString' }), 'toString');
});

test('texto: causaDoErro code numerico vira String(code), sem traduzir', () => {
  assert.strictEqual(texto.causaDoErro({ code: 13 }), '13');
});

test('texto: causaDoErro erro sem code usa name: message (SyntaxError real)', () => {
  let erro;
  try { JSON.parse('{'); } catch (e) { erro = e; }
  const r = texto.causaDoErro(erro);
  assert.ok(r.startsWith('SyntaxError: '), r);
  assert.ok(r.includes(erro.message.replace(/\s+/g, ' ').slice(0, 50)), r);
});

test('texto: causaDoErro valores que nao sao erro viram String()', () => {
  assert.strictEqual(texto.causaDoErro('texto solto'), 'texto solto');
  assert.strictEqual(texto.causaDoErro(null), 'null');
  assert.strictEqual(texto.causaDoErro(undefined), 'undefined');
  assert.strictEqual(texto.causaDoErro(42), '42');
});

test('texto: causaDoErro colapsa espacos e quebras em um espaco', () => {
  const e = new Error('a  b\n\tc\r\nd');
  assert.strictEqual(texto.causaDoErro(e), 'Error: a b c d');
});

test('texto: causaDoErro corta em 200 caracteres', () => {
  const r = texto.causaDoErro(new Error('x'.repeat(500)));
  assert.strictEqual(r.length, 200);
  assert.ok(r.startsWith('Error: xxx'));
});

test('texto: causaDoErro corta depois de colapsar (200 sobre o texto ja colapsado)', () => {
  const r = texto.causaDoErro(new Error('a' + ' '.repeat(300) + 'b'));
  assert.strictEqual(r, 'Error: a b');
});
