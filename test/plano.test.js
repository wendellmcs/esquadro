'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plano = require('../scripts/lib/plano.js');

const PLANO = [
  '# Plano',
  '',
  '### Tarefa 1: esqueleto',
  '',
  '- [x] **Passo 1: escrever o teste**',
  '- [x] **Passo 2: rodar**',
  '',
  '### Tarefa 2: marcha',
  '',
  '- [x] **Passo 1: escrever o teste**',
  '- [ ] **Passo 2: implementar**',
  '- [ ] **Passo 3: commit**'
].join('\n');

function tmp(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-plano-'));
  for (const [rel, txt] of Object.entries(arquivos || {})) {
    const alvo = path.join(dir, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, txt, 'utf8');
  }
  return dir;
}

test('plano: conta subitem aberto e fechado por tarefa', () => {
  const t = plano.parseTarefas(PLANO);
  assert.strictEqual(t.length, 2);
  assert.deepStrictEqual([t[0].n, t[0].abertos, t[0].total], [1, 0, 2]);
  assert.deepStrictEqual([t[1].n, t[1].abertos, t[1].total], [2, 2, 3]);
});

test('plano: le o titulo da tarefa junto com o numero', () => {
  assert.strictEqual(plano.parseTarefas(PLANO)[1].titulo, 'marcha');
});

test('plano: texto sem tarefa nao estoura', () => {
  assert.deepStrictEqual(plano.parseTarefas('# nada aqui'), []);
});

test('plano: abrir grava dono e tarefa; ler devolve o mesmo', () => {
  const dir = tmp({ 'docs/p.md': PLANO });
  try {
    const a = plano.abrir(dir, 'docs/p.md', 'sessao-A');
    assert.strictEqual(a.sessionId, 'sessao-A');
    assert.strictEqual(a.arquivo, 'docs/p.md');
    assert.strictEqual(plano.lerAtivo(dir).sessionId, 'sessao-A');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plano: sessao diferente da dona e detectada (a colisao de hoje)', () => {
  const dir = tmp({ 'docs/p.md': PLANO });
  try {
    const a = plano.abrir(dir, 'docs/p.md', 'sessao-A');
    assert.strictEqual(plano.donoOutro(a, 'sessao-B'), true);
    assert.strictEqual(plano.donoOutro(a, 'sessao-A'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plano: sem plano ativo, donoOutro e falso', () => {
  assert.strictEqual(plano.donoOutro(null, 'sessao-A'), false);
});

test('plano: proximaDecisao le o maior numero DO DISCO', () => {
  const dir = tmp({ 'd.md': '### D7 · a\n### D23 · b\n### D9 · c\n' });
  try {
    assert.strictEqual(plano.proximaDecisao(path.join(dir, 'd.md')), 24);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plano: arquivo de decisoes ausente comeca em 1', () => {
  assert.strictEqual(plano.proximaDecisao('/nao/existe.md'), 1);
});

test('plano: alegacao de etapa concluida e reconhecida', () => {
  assert.strictEqual(plano.alegaEtapaConcluida('Tarefa 2 concluida.'), true);
  assert.strictEqual(plano.alegaEtapaConcluida('Fechei a etapa 3.'), true);
  assert.strictEqual(plano.alegaEtapaConcluida('Segui para o proximo passo.'), false);
});

test('plano: motivo cita quantos subitens ficaram abertos', () => {
  const t = plano.parseTarefas(PLANO)[1];
  const m = plano.motivoSubitemAberto(t);
  assert.ok(m.includes('2'));
  assert.ok(m.includes('Tarefa 2'));
  assert.ok(/^[\x20-\x7E\n]+$/.test(m), 'motivo tem de ser ASCII (R5)');
});
