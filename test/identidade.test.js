'use strict';
// Pedido 32 (plano dos pedidos 30-32, Tarefa 4; D519, D522): a identidade visual do esquadro - um acento so, o ambar
// dos banners, sobre os neutros do tema. Na faixa: a chave de tema `warning` no terminal e no Desktop (D519); a cor
// crua no VS Code, onde a chave nao pinta (D522, sonda da s53). Fonte unica: o mod (que nao le Node) repete as duas
// cores, e este teste confere a copia.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const identidade = require('../scripts/lib/identidade.js');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

function maisFrequente(svg) {
  const conta = {};
  for (const c of svg.match(/#[0-9A-Fa-f]{6}\b/g) || []) conta[c.toUpperCase()] = (conta[c.toUpperCase()] || 0) + 1;
  return Object.keys(conta).sort(function (a, b) { return conta[b] - conta[a]; })[0];
}

test('identidade: o acento e a cor mais usada de cada banner (escuro e claro)', () => {
  assert.strictEqual(identidade.ACENTO.escuro, maisFrequente(ler('assets/banner-escuro.svg')));
  assert.strictEqual(identidade.ACENTO.claro, maisFrequente(ler('assets/banner-claro.svg')));
});

test('identidade: cor do acento por tela - cru no vscode (D522), chave de tema no resto (D519)', () => {
  assert.strictEqual(identidade.corDoAcento('vscode'), '#F59E0B');
  for (const tela of ['terminal', 'desktop', 'mobile', undefined, 'outra']) {
    assert.strictEqual(identidade.corDoAcento(tela), 'warning', String(tela));
  }
});

test('identidade: o mod repete as duas cores da lib (fonte unica conferida)', () => {
  const mod = ler('hooks/mods.tsx');
  assert.ok(mod.indexOf("const ACENTO_CRU = '" + identidade.ACENTO.escuro + "'") !== -1, 'ACENTO_CRU no mods.tsx');
  assert.ok(mod.indexOf("const ACENTO_TEMA = '" + identidade.TEMA + "'") !== -1, 'ACENTO_TEMA no mods.tsx');
  // um acento so: nenhuma outra cor crua no mod
  const cruas = (mod.match(/#[0-9A-Fa-f]{6}\b/g) || []).filter(function (c) { return c.toUpperCase() !== identidade.ACENTO.escuro; });
  assert.deepStrictEqual(cruas, []);
});

test('identidade: o README tem a secao "Aparencia" com as duas cores e a regra por tela', () => {
  const readme = ler('README.md');
  const i = readme.indexOf('### Aparência');
  assert.ok(i !== -1, 'secao ### Aparencia');
  const secao = readme.slice(i, readme.indexOf('\n#', i + 5) === -1 ? undefined : readme.indexOf('\n#', i + 5));
  for (const t of [identidade.ACENTO.escuro, identidade.ACENTO.claro, '`warning`', 'VS Code']) {
    assert.ok(secao.indexOf(t) !== -1, t + ' na secao: ' + secao);
  }
});
