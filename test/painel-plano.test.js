'use strict';
// Bloco M / M2 (D435): o painel do plano em texto - o que o comando /esquadro-plano do mod responde
// (o chat da extensao do VS Code nao desenha mod). Mostra antes, a vista, o que o portao de fecho so
// barra no fim: etapa com passo aberto nao esta concluida.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const planoLib = require('../scripts/lib/plano.js');

const ASCII = /^[\x20-\x7E\n]*$/;
const PLANO = [
  '# Plano',
  '### Tarefa 1: Medidor',
  '- [x] teste vermelho',
  '- [x] codigo',
  '### Tarefa 2: Painel',
  '- [x] teste vermelho',
  '- [ ] codigo',
  '- [ ] revisao cega',
  '### Tarefa 3: Vigia',
  '- [ ] desenho'
].join('\n');

test('painelTexto: conta concluidas, marca cada tarefa e aponta a proxima com os passos que faltam', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, planoLib.parseTarefas(PLANO));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('plano ativo: p.md') !== -1, t);
  assert.ok(t.indexOf('tarefas: 1 de 3 concluidas') !== -1, t);
  assert.ok(t.indexOf('[x] Tarefa 1: Medidor') !== -1, t);
  assert.ok(t.indexOf('[ ] Tarefa 2: Painel (2 de 3 passos abertos)') !== -1, t);
  assert.ok(t.indexOf('proxima: Tarefa 2 "Painel" - faltam 2 de 3 passos') !== -1, t);
});

test('painelTexto: tudo feito diz que nao ha tarefa aberta', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, planoLib.parseTarefas('### Tarefa 1: A\n- [x] um'));
  assert.ok(t.indexOf('tarefas: 1 de 1 concluidas') !== -1, t);
  assert.ok(t.indexOf('proxima: nenhuma tarefa aberta') !== -1, t);
});

test('painelTexto: tarefa sem nenhuma caixa de passo nao aparece como concluida (revisao cega do M, lib/plano B:115)', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' },
    planoLib.parseTarefas('### Tarefa 1: A\n- [x] um\n### Tarefa 2: Revisar\nsem caixas aqui'));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('[x] Tarefa 2') === -1, t);
  assert.ok(t.indexOf('[?] Tarefa 2: Revisar (sem caixas de passo') !== -1, t);
  assert.ok(t.indexOf('tarefas: 1 de 2 concluidas') !== -1, t);
  // D436: sem tarefa de passo aberto mas com [?], a "proxima" nao diz que o plano acabou.
  assert.ok(t.indexOf('proxima: nenhuma tarefa aberta') === -1, t);
  assert.ok(t.indexOf('proxima: nenhuma tarefa com passo aberto; 1 sem caixas de passo, confira a mao') !== -1, t);
});

test('painelTexto: sem plano ativo diz como abrir um', () => {
  const t = planoLib.painelTexto(null, []);
  assert.ok(/nenhum plano ativo/.test(t) && /--abrir/.test(t), t);
});

test('painelTexto: plano sem cabecalho "Tarefa N:" diz que nao consegue contar, em vez de 0 de 0', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, []);
  assert.ok(/Tarefa N:/.test(t), t);
  assert.ok(t.indexOf('0 de 0') === -1, t);
});

test('plano.js --texto: le o plano ativo do projeto e imprime o painel', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-'));
  try {
    fs.writeFileSync(path.join(base, 'plano.md'), PLANO);
    planoLib.abrir(base, 'plano.md', 's1');
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'plano.js'), '--texto'], { cwd: base, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('tarefas: 1 de 3 concluidas') !== -1, r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('plano.js --texto: sem plano ativo, saida 0 e o texto de como abrir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-'));
  try {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'plano.js'), '--texto'], { cwd: base, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(/nenhum plano ativo/.test(r.stdout), r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
