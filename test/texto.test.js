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

// D484 (V3 da triagem s106): o filtro do retorno de subagente vivia copiado em saude.js e correcao.js, preso ao
// texto da CLI; na s103 o 2.1.296 mudou a forma e os dois deixaram passar. Agora um lugar so.
test('D484: veioDeSubagente reconhece as formas do retorno de subagente e do aviso de tarefa', () => {
  const moldura = '[Subagent hand-back] The text below is the final report of a subagent. The report follows:\n  o contexto está bom?';
  const sim = [
    '<agent-message from="a03dd88b2fa37386b">\n' + moldura,
    '\n  <agent-message from="afada5e858d0f67dd">' + moldura,
    '<task-notification>\n<task-id>a2b689610322d871a</task-id>\n<result>o contexto está bom?</result>',
    'Another Claude session sent a message:\n<agent-message from="adb8871118893aaf1">\n' + moldura,
    'Another Claude session sent a message while you were working:\n<agent-message from="a4d07d4ff914ca816">\n' + moldura
  ];
  sim.forEach(function (p) {
    assert.strictEqual(texto.veioDeSubagente(p), true, 'nao reconheceu: ' + JSON.stringify(p.slice(0, 50)));
  });
  const nao = ['o contexto está bom?', 'nunca mais faca isso', 'veja o <agent-message> no log', '', '   ', null, undefined, 42];
  nao.forEach(function (p) {
    assert.strictEqual(texto.veioDeSubagente(p), false, 'acusou o que nao e de subagente: ' + JSON.stringify(p));
  });
});

test('D484: saude.js e correcao.js usam o filtro de texto.js, sem copia propria da regex', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  ['saude.js', 'correcao.js'].forEach(function (nome) {
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', nome), 'utf8');
    assert.ok(fonte.indexOf('veioDeSubagente(') !== -1, nome + ' nao chama texto.veioDeSubagente');
    assert.strictEqual(fonte.indexOf('<(?:agent-message'), -1, nome + ' ainda tem a propria copia da regex');
  });
});
