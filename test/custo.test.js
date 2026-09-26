'use strict';
const test = require('node:test');
const assert = require('node:assert');
const custo = require('../scripts/lib/custo.js');
const degraus = require('../scripts/lib/degraus.js');

const PROJETO = {
  marchaPadrao: 'padrao',
  marchas: { aaa: ['**/auth/**'], padrao: ['src/**'], rapida: ['**/*.md'] },
  agentes: { escada: ['busca-rapida', 'tarefas-simples', 'desenvolvedor', 'arquiteto', 'especialista'] }
};

test('custo: escada vai do mais barato ao mais caro', () => {
  assert.ok(custo.nivelDoAgente('busca-rapida', PROJETO) < custo.nivelDoAgente('especialista', PROJETO));
});

test('custo: agente fora da escada tem nivel 0 e nunca e barrado', () => {
  assert.strictEqual(custo.nivelDoAgente('inspetor', PROJETO), 0);
  assert.strictEqual(custo.permitido('inspetor', 'rapida', PROJETO).ok, true);
});

test('custo: escopo so de doc tem marcha maxima rapida', () => {
  const esc = { dentro: ['docs/a.md', 'README.md'], fora: [] };
  assert.strictEqual(custo.marchaMaximaDoEscopo(esc, PROJETO), 'rapida');
});

test('custo: escopo com um caminho AAA tem marcha maxima aaa', () => {
  const esc = { dentro: ['docs/a.md', 'src/auth/token.js'], fora: [] };
  assert.strictEqual(custo.marchaMaximaDoEscopo(esc, PROJETO), 'aaa');
});

test('custo: sem escopo declarado, nao ha teto e nada e barrado', () => {
  assert.strictEqual(custo.marchaMaximaDoEscopo(null, PROJETO), 'aaa');
  assert.strictEqual(custo.permitido('especialista', 'aaa', PROJETO).ok, true);
});

test('custo: agente do topo em escopo so de marcha rapida e barrado (F18)', () => {
  const r = custo.permitido('especialista', 'rapida', PROJETO);
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.includes('especialista'));
  assert.ok(/^[\x20-\x7E\n]+$/.test(r.motivo), 'motivo tem de ser ASCII (R5)');
});

test('custo: agente barato em escopo de marcha rapida passa', () => {
  assert.strictEqual(custo.permitido('busca-rapida', 'rapida', PROJETO).ok, true);
  assert.strictEqual(custo.permitido('tarefas-simples', 'rapida', PROJETO).ok, true);
});

test('custo: em marcha padrao ou AAA, todos passam - rigor e eixo independente do custo', () => {
  assert.strictEqual(custo.permitido('especialista', 'padrao', PROJETO).ok, true);
  assert.strictEqual(custo.permitido('especialista', 'aaa', PROJETO).ok, true);
});

test('custo: projeto sem escada configurada nao barra ninguem', () => {
  assert.strictEqual(custo.permitido('especialista', 'rapida', { marchas: {} }).ok, true);
});

// Ronda 1 do 8c.5: o portao deixava de opinar abaixo de um `2` cru, e o relatorio de
// cobertura acusa o mesmo limite pelo degraus.MINIMO. Os dois tem de concordar sobre onde
// fica a linha, ou um diz "nao opina" onde o outro opina.
test('custo: o portao passa a opinar exatamente no degraus.MINIMO, o limite que a cobertura acusa', () => {
  const MIN = degraus.MINIMO;
  const projeto = (n) => ({ marchaPadrao: 'padrao', marchas: PROJETO.marchas,
    agentes: { escada: Array.from({ length: n }, (_, i) => 'agente-' + i) } });
  assert.strictEqual(custo.permitido('agente-' + (MIN - 2), 'rapida', projeto(MIN - 1)).ok, true,
    'com ' + (MIN - 1) + ' nome(s) na escada o portao nao opina');
  assert.strictEqual(custo.permitido('agente-' + (MIN - 1), 'rapida', projeto(MIN)).ok, false,
    'com ' + MIN + ' nomes o do topo em marcha rapida e barrado');
});
