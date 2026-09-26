'use strict';
const test = require('node:test');
const assert = require('node:assert');
const molde = require('../scripts/lib/molde.js');

const PROJETO = { provaDePronto: 'npm test', quemDecide: 'Ana' };

test('molde: acha as duas formas de fatia', () => {
  const s = molde.slots('a {{campo:provaDePronto}} b {{texto:portoes}} c');
  assert.strictEqual(s.length, 2);
  assert.deepStrictEqual(s.map((x) => x.tipo), ['campo', 'texto']);
  assert.deepStrictEqual(s.map((x) => x.nome), ['provaDePronto', 'portoes']);
});

test('molde: fatia de campo vira REFERENCIA, nunca o valor (D10)', () => {
  const r = molde.preencher('Rode {{campo:provaDePronto}}.', {}, PROJETO);
  assert.ok(r.includes('projeto.json'));
  assert.ok(r.includes('provaDePronto'));
  assert.ok(!r.includes('npm test'), 'o valor nao pode ser cravado no texto');
});

test('molde: fatia de texto recebe o que a entrevista respondeu', () => {
  const r = molde.preencher('Portoes: {{texto:portoes}}', { portoes: 'contrato de UX' }, PROJETO);
  assert.ok(r.includes('contrato de UX'));
});

test('molde: fatia de texto sem resposta vira marca visivel, nao some', () => {
  const r = molde.preencher('Portoes: {{texto:portoes}}', {}, PROJETO);
  assert.ok(r.includes('POR PREENCHER'), r);
});

test('molde: validar recusa fatia por preencher', () => {
  const r = molde.validar('Portoes: (POR PREENCHER: portoes)');
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('portoes')));
});

test('molde: validar recusa chave de fatia que sobrou sem substituir', () => {
  const r = molde.validar('a {{texto:portoes}} b');
  assert.strictEqual(r.ok, false);
});

test('molde: validar recusa fato volatil vindo da entrevista (D10)', () => {
  const cheio = molde.preencher('Portoes: {{texto:portoes}}', { portoes: 'usar a versao 2.1.220' }, PROJETO);
  const r = molde.validar(cheio);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('volatil')));
});

test('molde: texto limpo e preenchido passa', () => {
  const cheio = molde.preencher(
    'Prova: {{campo:provaDePronto}}\nPortoes: {{texto:portoes}}',
    { portoes: 'contrato de UX antes de fechar' },
    PROJETO
  );
  assert.strictEqual(molde.validar(cheio).ok, true, molde.validar(cheio).erros.join(' | '));
});

test('molde: campo inexistente no projeto.json e erro nomeado', () => {
  const r = molde.preencher('{{campo:naoExiste}}', {}, PROJETO);
  assert.ok(r.includes('POR PREENCHER'));
  assert.strictEqual(molde.validar(r).ok, false);
});

test('molde: o molde de verdade do plugin preenche e valida', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'modelos', 'skill-projeto.md'), 'utf8');
  const valores = {};
  for (const s of molde.slots(texto)) {
    if (s.tipo === 'texto') valores[s.nome] = 'conteudo de ensaio para ' + s.nome;
  }
  const projeto = {
    nome: 'ensaio', provaDePronto: 'npm test', quemDecide: 'dono',
    modeloDeAmeaca: 'interno', marchas: {}, intocaveis: [], fontesCanonicas: [],
    agentes: { escada: [] }, marchaPadrao: 'padrao', limiares: {}
  };
  const cheio = molde.preencher(texto, valores, projeto);
  const r = molde.validar(cheio);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});
