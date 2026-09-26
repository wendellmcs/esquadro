'use strict';
const test = require('node:test');
const assert = require('node:assert');
const aud = require('../scripts/lib/auditoria.js');

test('auditoria: duas skills com o mesmo gatilho sao apontadas', () => {
  const r = aud.sobreposicoes([
    { nome: 'revisar', descricao: 'Use quando for revisar codigo antes de fechar' },
    { nome: 'code-review', descricao: 'Use quando precisar revisar codigo do diff' },
    { nome: 'deploy', descricao: 'Use quando for publicar em producao' }
  ]);
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].termos.includes('revisar'));
});

test('auditoria: skills sem termo em comum nao sao apontadas', () => {
  assert.strictEqual(aud.sobreposicoes([
    { nome: 'a', descricao: 'Use quando for publicar em producao' },
    { nome: 'b', descricao: 'Use quando precisar desenhar um grafico' }
  ]).length, 0);
});

test('auditoria: palavra vazia nao conta como sobreposicao', () => {
  assert.strictEqual(aud.sobreposicoes([
    { nome: 'a', descricao: 'Use quando o usuario pedir para fazer uma coisa no projeto' },
    { nome: 'b', descricao: 'Use quando o usuario pedir para ver outra coisa no projeto' }
  ]).length, 0);
});

test('auditoria: mesmo gatilho com acoes diferentes e contradicao', () => {
  const r = aud.contradicoes([
    { gatilho: 'ao fechar tarefa', acao: 'colar a saida do comando' },
    { gatilho: 'ao fechar tarefa', acao: 'resumir sem colar saida' },
    { gatilho: 'ao editar', acao: 'rodar git status' }
  ]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].acoes.length, 2);
});

test('auditoria: mesmo gatilho com a MESMA acao e duplicata, nao contradicao', () => {
  const r = aud.contradicoes([
    { gatilho: 'ao editar', acao: 'rodar git status' },
    { gatilho: 'ao editar', acao: 'rodar git status' }
  ]);
  assert.strictEqual(r.length, 0);
});

test('auditoria: gatilho comparado sem caixa e sem acento sobrando', () => {
  const r = aud.contradicoes([
    { gatilho: 'Ao Fechar Tarefa', acao: 'x' },
    { gatilho: 'ao fechar tarefa', acao: 'y' }
  ]);
  assert.strictEqual(r.length, 1);
});
