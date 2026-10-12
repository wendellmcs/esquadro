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

const SCRIPT = path.join(__dirname, '..', 'scripts', 'plano.js');
function painelEm(conteudoDoAtivo, args) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-'));
  try {
    fs.writeFileSync(path.join(base, 'plano.md'), PLANO);
    if (conteudoDoAtivo !== null) {
      fs.mkdirSync(path.join(base, '.claude', 'esquadro'), { recursive: true });
      fs.writeFileSync(path.join(base, '.claude', 'esquadro', 'plano-ativo.json'), conteudoDoAtivo);
    }
    return spawnSync(process.execPath, [SCRIPT].concat(args || ['--texto']), { cwd: base, encoding: 'utf8' });
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

// D442/3 (M-8/M-10/M-14 e o print do dono na s70): sem plano, o painel mandava rodar
// `node <pasta do plugin esquadro>/scripts/plano.js` - o dono nao sabe que pasta e essa. O script sabe onde esta.
test('D442/3: sem plano ativo, o painel diz o caminho real do plano.js, entre aspas', () => {
  const r = painelEm(null);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('<pasta do plugin') === -1, r.stdout);
  assert.ok(r.stdout.indexOf('node "' + SCRIPT + '" --abrir <caminho do plano>') !== -1, r.stdout);
  // caminho que nao e ASCII (R5) ou que o shell reinterpretaria: volta ao marcador, sem inventar
  assert.ok(/<pasta do plugin esquadro>/.test(planoLib.painelTexto(null, [], 'C:/Usuários/zé/plano.js')));
  assert.ok(/<pasta do plugin esquadro>/.test(planoLib.painelTexto(null, [], '/tmp/$x/plano.js')));
  assert.ok(/<pasta do plugin esquadro>/.test(planoLib.painelTexto(null, [])));
});

// D442/10 (M-28): o --texto nao caia (conferido: saida 0 em 10 formas de arquivo torto), mas DIZIA "nenhum plano
// ativo" com o arquivo la: JSON quebrado, e ate um plano valido gravado com BOM (comum no Windows, D124).
test('D442/10: plano-ativo.json com BOM vale; JSON quebrado diz que existe mas nao se le', () => {
  const comBom = painelEm('\uFEFF' + JSON.stringify({ arquivo: 'plano.md', sessionId: 's1' }));
  assert.strictEqual(comBom.status, 0, comBom.stderr);
  assert.ok(comBom.stdout.indexOf('tarefas: 1 de 3 concluidas') !== -1, comBom.stdout);
  for (const torto of ['{"arquivo": ', '[]', '"x"']) {
    const r = painelEm(torto);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('nenhum plano ativo') === -1, torto + ' -> ' + r.stdout);
    assert.ok(/plano-ativo\.json existe mas nao se le/.test(r.stdout), torto + ' -> ' + r.stdout);
    assert.ok(ASCII.test(r.stdout), JSON.stringify(r.stdout));
  }
});

// D442/9 (M-23/M-24): o painel em texto ja nao contava tarefa sem caixa como feita (D436), mas a saida JSON
// do plano.js (sem --texto) contava: `concluidas = tarefas - abertas`.
test('D442/9: plano.js (JSON) nao conta tarefa sem caixa como concluida e diz quantas sao', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-'));
  try {
    fs.writeFileSync(path.join(base, 'plano.md'), '### Tarefa 1: A\n- [x] um\n### Tarefa 2: B\nsem caixas\n');
    planoLib.abrir(base, 'plano.md', 's1');
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: base, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.strictEqual(j.tarefas, 2);
    assert.strictEqual(j.concluidas, 1, r.stdout);
    assert.strictEqual(j.semCaixas, 1, r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
