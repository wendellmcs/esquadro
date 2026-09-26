'use strict';
const test = require('node:test');
const assert = require('node:assert');
const glob = require('../scripts/lib/glob.js');
const caminho = require('../scripts/lib/caminho.js');
const marcha = require('../scripts/lib/marcha.js');

test('glob: * nao atravessa barra', () => {
  assert.ok(glob.casa('src/*.js', 'src/a.js', false));
  assert.ok(!glob.casa('src/*.js', 'src/sub/a.js', false));
});

test('glob: **/ casa zero ou mais niveis', () => {
  assert.ok(glob.casa('**/*.md', 'README.md', false));
  assert.ok(glob.casa('**/*.md', 'docs/a.md', false));
  assert.ok(glob.casa('**/*.md', 'a/b/c.md', false));
});

test('glob: ** no fim casa a subarvore inteira', () => {
  assert.ok(glob.casa('Projeto Vizinho/**', 'Projeto Vizinho/a/b.js', false));
  assert.ok(!glob.casa('Projeto Vizinho/**', 'outro/a.js', false));
});

test('glob: ponto e literal, nao coringa', () => {
  assert.ok(glob.casa('a.js', 'a.js', false));
  assert.ok(!glob.casa('a.js', 'axjs', false));
});

test('glob: barra invertida do Windows e normalizada', () => {
  assert.ok(glob.casa('src/**', 'src\\lib\\a.js', false));
});

test('glob: ignorarCaixa faz o casamento ser insensivel', () => {
  assert.ok(glob.casa('SRC/**', 'src/a.js', true));
  assert.ok(!glob.casa('SRC/**', 'src/a.js', false));
});

test('caminho: absoluto vira relativo POSIX ao projeto', () => {
  const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj';
  const alvo = process.platform === 'win32' ? 'C:\\proj\\src\\a.js' : '/proj/src/a.js';
  assert.strictEqual(caminho.relativoAoProjeto(alvo, cwd), 'src/a.js');
});

test('caminho: arquivo fora do projeto devolve null', () => {
  const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj';
  const fora = process.platform === 'win32' ? 'C:\\outro\\a.js' : '/outro/a.js';
  assert.strictEqual(caminho.relativoAoProjeto(fora, cwd), null);
});

test('caminho: entrada vazia devolve null', () => {
  assert.strictEqual(caminho.relativoAoProjeto(undefined, '/proj'), null);
  assert.strictEqual(caminho.relativoAoProjeto('', '/proj'), null);
});

const PROJETO = {
  marchaPadrao: 'padrao',
  marchas: {
    aaa: ['**/auth/**', 'manifest.json'],
    padrao: ['src/**', 'scripts/**'],
    rapida: ['**/*.md', 'docs/**']
  }
};

test('marcha: AAA vence quando o caminho casa em mais de uma lista', () => {
  assert.strictEqual(marcha.resolverMarcha('src/auth/token.js', PROJETO), 'aaa');
});

test('marcha: caminho de doc e rapida', () => {
  assert.strictEqual(marcha.resolverMarcha('docs/plano-v1.md', PROJETO), 'rapida');
});

test('marcha: caminho nao listado cai na marchaPadrao', () => {
  assert.strictEqual(marcha.resolverMarcha('outro/x.txt', PROJETO), 'padrao');
});

test('marcha: sem projeto, o default e padrao', () => {
  assert.strictEqual(marcha.resolverMarcha('qualquer.txt', null), 'padrao');
});

test('marcha: so padrao e AAA exigem escopo declarado', () => {
  assert.strictEqual(marcha.exigeEscopo('rapida'), false);
  assert.strictEqual(marcha.exigeEscopo('padrao'), true);
  assert.strictEqual(marcha.exigeEscopo('aaa'), true);
});

test('marcha: D8 - sobe sim, desce nao', () => {
  assert.ok(marcha.podeSubir('padrao', 'aaa'));
  assert.ok(marcha.podeSubir('padrao', 'padrao'));
  assert.ok(!marcha.podeSubir('aaa', 'padrao'));
  assert.ok(!marcha.podeSubir('padrao', 'rapida'));
});
