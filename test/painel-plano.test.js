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
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, planoLib.parseItens(PLANO));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('plano ativo: p.md') !== -1, t);
  assert.ok(t.indexOf('tarefas: 1 de 3 concluidas') !== -1, t);
  assert.ok(t.indexOf('[x] Tarefa 1: Medidor') !== -1, t);
  assert.ok(t.indexOf('[ ] Tarefa 2: Painel (2 de 3 passos abertos)') !== -1, t);
  assert.ok(t.indexOf('proxima: Tarefa 2 "Painel" - faltam 2 de 3 passos') !== -1, t);
});

test('painelTexto: tudo feito diz que nao ha tarefa aberta', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, planoLib.parseItens('### Tarefa 1: A\n- [x] um'));
  assert.ok(t.indexOf('tarefas: 1 de 1 concluidas') !== -1, t);
  assert.ok(t.indexOf('proxima: nenhuma tarefa aberta') !== -1, t);
});

test('painelTexto: tarefa sem nenhuma caixa de passo nao aparece como concluida (revisao cega do M, lib/plano B:115)', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' },
    planoLib.parseItens('### Tarefa 1: A\n- [x] um\n### Tarefa 2: Revisar\nsem caixas aqui'));
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

// D476 (Tarefa 4 da 0.7.1): nada chamava `plano.js --abrir`, entao o /esquadro-plano dizia "nenhum plano ativo"
// numa sessao que trabalhava num plano. Sem plano-ativo.json, o plano vem da frente vinculada: o ULTIMO
// "Plano: <caminho>" do Objetivo do arquivo da frente. Sem vinculo: uma frente com plano no disco -> ela.
function projetoComFrentes(opcoes) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-frente-'));
  const tmp = path.join(base, '_tmp');
  fs.mkdirSync(path.join(base, '.claude', 'esquadro', 'escopos'), { recursive: true });
  fs.writeFileSync(path.join(base, 'plano.md'), PLANO);
  fs.writeFileSync(path.join(base, 'velho.md'), '### Tarefa 1: Velha\n- [ ] nada\n');
  for (const nome of Object.keys(opcoes.frentes || {})) {
    fs.writeFileSync(path.join(base, '.claude', 'esquadro', 'escopos', nome + '.md'),
      '# Escopo\n**Objetivo:** ' + opcoes.frentes[nome] + '\n## Dentro\n- x/**\n');
  }
  if (opcoes.vinculo) {
    fs.mkdirSync(path.join(tmp, 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'esquadro', 's-frente.json'), JSON.stringify({ frente: opcoes.vinculo }));
  }
  if (opcoes.ativo) planoLib.abrir(base, opcoes.ativo, 's1');
  const env = Object.assign({}, process.env, { ESQUADRO_TMP: tmp });
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_SESSION_ID;
  try {
    return spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 's-frente'], { cwd: base, encoding: 'utf8', env: env });
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

test('D476: sem plano-ativo.json, o painel acha o plano pelo ULTIMO "Plano:" do Objetivo da frente vinculada', () => {
  const r = projetoComFrentes({
    frentes: { f1: 'fazer X. Plano: velho.md. (sessao 1, hoje) agora a 2a parte. Plano: plano.md', f2: 'outra. Plano: velho.md' },
    vinculo: 'f1'
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('nenhum plano ativo') === -1, r.stdout);
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: f1)') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('tarefas: 1 de 3 concluidas') !== -1, r.stdout);
  // D476 (item 4): o Objetivo chega ao painel pelo plano.js - 1 marca, 1 feita, 2 faltam
  assert.ok(r.stdout.indexOf('sessoes gastas: 1 (marcas') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('estimativa: 2 sessoes para as 2 que faltam (base: media de 1,0 sessao por tarefa feita = ' +
    '1 sessao / 1 feita)') !== -1, r.stdout);
});

test('D476: sem vinculo e com UMA frente com plano no disco, o painel usa ela; ponto final do caminho nao entra', () => {
  const r = projetoComFrentes({ frentes: { so: 'fazer X. Plano: plano.md.', semplano: 'nada aqui' } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: so)') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('tarefas: 1 de 3 concluidas') !== -1, r.stdout);
});

test('D476: sem vinculo e com VARIAS frentes com plano, o painel lista as frentes e diz como escolher', () => {
  const r = projetoComFrentes({ frentes: { fa: 'A. Plano: plano.md', fb: 'B. Plano: velho.md' } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(ASCII.test(r.stdout), JSON.stringify(r.stdout));
  assert.ok(r.stdout.indexOf('tarefas:') === -1, r.stdout);
  assert.ok(/fa: plano\.md/.test(r.stdout) && /fb: velho\.md/.test(r.stdout), r.stdout);
  assert.ok(/\.claude\/esquadro\/escopos\/<frente>\.md/.test(r.stdout) && /--abrir/.test(r.stdout), r.stdout);
});

test('D476: plano-ativo.json presente manda, mesmo com a sessao vinculada a uma frente com outro plano', () => {
  const r = projetoComFrentes({ frentes: { f1: 'X. Plano: velho.md' }, vinculo: 'f1', ativo: 'plano.md' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano ativo: plano.md') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('tarefas: 1 de 3 concluidas') !== -1, r.stdout);
});

test('D476: frente vinculada sem "Plano:" no Objetivo diz isso, e nao pega o plano de outra frente', () => {
  const r = projetoComFrentes({ frentes: { f1: 'sem plano anotado', f2: 'X. Plano: plano.md' }, vinculo: 'f1' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('tarefas:') === -1, r.stdout);
  assert.ok(/a frente f1 nao tem "Plano: <caminho>" no Objetivo/.test(r.stdout), r.stdout);
});

// D476: o painel le o formato real dos planos (o da 0.7 usa "### Item N —" sem caixas): cabecalho #{2,4} com
// Tarefa|Item|Etapa|Onda|Fase + numero (3a, 3b) + separador ":" "." "-" travessao. Sem caixas, [FEITO]/(feito)
// no cabecalho = feita; senao "sem marca" (o painel nao inventa). O portao de fecho segue no formato de hoje.
const PLANO_REAL = [
  '# Plano',
  '## Tarefa 1 \u2014 Publicar',
  '- [x] export',
  '### Item 2 \u2014 calibrador (sess\u00e3o 93) [FEITO]',
  'texto sem caixa',
  '### Item 3a \u2014 ligado por padr\u00e3o (feito)',
  '### Item 3b \u2014 sob chave',
  '### Etapa 4. Revis\u00e3o',
  '- [ ] lente 1',
  '- [x] lente 2',
  '#### Onda 5 - Fecho',
  '### Fase 6: Publicar',
  '- [ ] push'
].join('\n');

test('D476: parseItens le Tarefa/Item/Etapa/Onda/Fase, numero com letra e os 4 separadores', () => {
  const itens = planoLib.parseItens(PLANO_REAL);
  assert.deepStrictEqual(itens.map(function (t) { return t.tipo + ' ' + t.id; }),
    ['Tarefa 1', 'Item 2', 'Item 3a', 'Item 3b', 'Etapa 4', 'Onda 5', 'Fase 6']);
  assert.deepStrictEqual(itens.map(function (t) { return t.estado; }),
    ['feita', 'feita', 'feita', 'sem marca', 'aberta', 'sem marca', 'aberta']);
  // as caixas mandam: [FEITO] no cabecalho com passo aberto segue aberta
  assert.strictEqual(planoLib.parseItens('### Fase 7: X [FEITO]\n- [ ] y')[0].estado, 'aberta');
});

test('D476: o painel mostra o formato real em ASCII, com [FEITO] sem caixa como feita e "sem marca" como [?]', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1' }, planoLib.parseItens(PLANO_REAL));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('tarefas: 3 de 7 concluidas') !== -1, t);
  assert.ok(t.indexOf('[x] Item 2: calibrador (sessao 93)') !== -1, t);
  assert.ok(t.indexOf('[x] Item 3a: ligado por padrao') !== -1, t);
  assert.ok(t.indexOf('[?] Item 3b: sob chave (sem caixas de passo nem [FEITO]') !== -1, t);
  assert.ok(t.indexOf('[ ] Etapa 4: Revisao (1 de 2 passos abertos)') !== -1, t);
  assert.ok(t.indexOf('proxima: Etapa 4 "Revisao" - faltam 1 de 2 passos') !== -1, t);
});

test('D476: o portao de fecho segue no formato de hoje - parseTarefas nao le "Item N" nem travessao', () => {
  assert.deepStrictEqual(planoLib.parseTarefas('### Item 1 \u2014 X\n- [ ] a\n## Tarefa 2 \u2014 Y\n- [ ] b'), []);
});

// D476 (item 3): sessoes gastas = marcas "(sessao N" / "(sessão N" no Objetivo da frente; estimativa =
// (sessoes / feitas) x as que faltam, arredondada; sem tarefa feita nao ha base.
test('D476: sessoesDoObjetivo conta as marcas "(sessao N" com e sem acento, e so com numero', () => {
  assert.strictEqual(planoLib.sessoesDoObjetivo(
    'X (sessao 91, hoje: a) Y (sessão 92) (Sessao 93: b) sessao 94 sem parentese (sessao sem numero) (sessao 95'), 4);
  assert.strictEqual(planoLib.sessoesDoObjetivo(''), 0);
  assert.strictEqual(planoLib.sessoesDoObjetivo(null), 0);
});

test('D476: estimativaDeSessoes = media por tarefa feita x as que faltam, arredondada; sem feita = sem base', () => {
  assert.deepStrictEqual(planoLib.estimativaDeSessoes(10, 4, 2), { sessoes: 5, media: 2.5 });
  assert.deepStrictEqual(planoLib.estimativaDeSessoes(4, 3, 4), { sessoes: 5, media: 4 / 3 });
  assert.deepStrictEqual(planoLib.estimativaDeSessoes(5, 3, 1), { sessoes: 2, media: 5 / 3 });
  assert.deepStrictEqual(planoLib.estimativaDeSessoes(7, 3, 0), { sessoes: 0, media: 7 / 3 });
  assert.strictEqual(planoLib.estimativaDeSessoes(5, 0, 3), null);
});

// D476 (item 4): o painel diz o que falta, as sessoes gastas e a estimativa com a base, em ASCII.
test('D476: painel com frente mostra falta, sessoes gastas e estimativa com a base', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', objetivo: 'X (sessao 1) (sessão 2) (sessao 3) (sessao 4)' },
    planoLib.parseItens(PLANO_REAL));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('falta: 4 de 7 (Item 3b, Etapa 4, Onda 5, Fase 6)') !== -1, t);
  assert.ok(t.indexOf('sessoes gastas: 4 (marcas "(sessao N, ...)" no Objetivo da frente f1)') !== -1, t);
  assert.ok(t.indexOf('estimativa: 5 sessoes para as 4 que faltam (base: media de 1,3 sessoes por tarefa feita = ' +
    '4 sessoes / 3 feitas)') !== -1, t);
  // a ordem do plano: proxima, falta, sessoes gastas, estimativa
  assert.ok(t.indexOf('proxima:') < t.indexOf('falta:') && t.indexOf('falta:') < t.indexOf('sessoes gastas:') &&
    t.indexOf('sessoes gastas:') < t.indexOf('estimativa:'), t);
});

test('D476: plano aberto por --abrir (sem frente) diz que nao conta sessoes nem estima', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, planoLib.parseItens(PLANO));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('falta: 2 de 3 (Tarefa 2, Tarefa 3)') !== -1, t);
  // R1 da revisao cega (microcopy): aspa fechada e o que fazer para passar a contar
  assert.ok(t.indexOf('sessoes gastas: nao contadas - este plano foi aberto com --abrir, sem frente; as sessoes se contam ' +
    'pelas marcas "(sessao N, ...)" que cada sessao anota no Objetivo da frente') !== -1, t);
  assert.ok(t.indexOf('estimativa: sem as sessoes gastas nao ha base (para contar, anote "Plano: <caminho>" no Objetivo ' +
    'de uma frente e apague .claude/esquadro/plano-ativo.json)') !== -1, t);
});

test('D476: frente sem tarefa feita nao estima; tudo feito diz que nada falta; 1 sessao no singular', () => {
  const sem = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', objetivo: '(sessao 1)' },
    planoLib.parseItens('### Item 1: A\n- [ ] a\n### Item 2: B'));
  assert.ok(sem.indexOf('sessoes gastas: 1 (marcas') !== -1, sem);
  assert.ok(sem.indexOf('estimativa: sem base para estimar ainda (nenhuma tarefa feita)') !== -1, sem);
  const tudo = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', objetivo: '(sessao 1) (sessao 2)' },
    planoLib.parseItens('### Item 1: A\n- [x] a'));
  assert.ok(tudo.indexOf('falta: nada') !== -1, tudo);
  assert.ok(tudo.indexOf('estimativa: nada falta') !== -1, tudo);
  const um = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', objetivo: '(sessao 1) (sessao 2)' },
    planoLib.parseItens('### Item 1: A\n- [x] a\n### Item 2: B [FEITO]\n### Item 3: C\n- [ ] c'));
  assert.ok(um.indexOf('estimativa: 1 sessao para a 1 que falta (base: media de 1,0 sessao por tarefa feita = ' +
    '2 sessoes / 2 feitas)') !== -1, um);
});

// R1 da revisao cega D469 de scripts/lib/plano.js (sessao 101).
test('R1: caminho do plano entre crases ou aspas pode ter espaco; sem elas, vale ate o primeiro espaco', () => {
  assert.strictEqual(planoLib.planoDoObjetivo('X. Plano: `docs/meu plano.md`. (sessao 1, hoje)'), 'docs/meu plano.md');
  assert.strictEqual(planoLib.planoDoObjetivo('X. Plano: "docs/meu plano.md"'), 'docs/meu plano.md');
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: a.md. depois Plano: `b c.md`'), 'b c.md');
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: `b c.md` e depois Plano: d.md.'), 'd.md');
});

test('R1: cabecalho que so agrupa (sem caixa nem [FEITO], com cabecalhos mais fundos abaixo) nao vira tarefa', () => {
  const itens = planoLib.parseItens('## Fase 1: Grupo\n### Tarefa 1: A\n- [x] a\n### Tarefa 2: B\n- [ ] b\n' +
    '## Fase 2: Com passo proprio\n- [ ] c\n### Tarefa 3: C\n- [x] c');
  assert.deepStrictEqual(itens.map(function (t) { return t.tipo + ' ' + t.id; }), ['Tarefa 1', 'Tarefa 2', 'Fase 2', 'Tarefa 3']);
  // mesmo nivel, sem caixas: segue "sem marca" (o painel nao inventa)
  assert.deepStrictEqual(planoLib.parseItens('### Item 1: X\n### Item 2: Y').map(function (t) { return t.estado; }),
    ['sem marca', 'sem marca']);
  // [FEITO] no agrupador o mantem como item
  assert.strictEqual(planoLib.parseItens('## Fase 1: G [FEITO]\n### Tarefa 1: A\n- [x] a').length, 2);
});

test('R1: Objetivo sem marca "(sessao N" e com tarefa feita nao estima 0 sessoes', () => {
  assert.strictEqual(planoLib.estimativaDeSessoes(0, 2, 3), null);
  const t = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', objetivo: 'sem marca' },
    planoLib.parseItens('### Item 1: A\n- [x] a\n### Item 2: B\n- [ ] b'));
  assert.ok(t.indexOf('sessoes gastas: 0 (marcas') !== -1, t);
  assert.ok(t.indexOf('estimativa: sem base (o Objetivo da frente nao tem nenhuma marca "(sessao N, ...)"; cada sessao ' +
    'anota a sua)') !== -1, t);
});

test('R1: arquivo da frente vinculada que nao se le nao vira "nao tem Plano:"', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-ilegivel-'));
  try {
    const tmp = path.join(base, '_tmp');
    fs.mkdirSync(path.join(base, '.claude', 'esquadro', 'escopos', 'f1.md'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'esquadro', 's-frente.json'), JSON.stringify({ frente: 'f1' }));
    const env = Object.assign({}, process.env, { ESQUADRO_TMP: tmp });
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_SESSION_ID;
    const r = spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 's-frente'], { cwd: base, encoding: 'utf8', env: env });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('nao tem "Plano:') === -1, r.stdout);
    assert.ok(/nao consegui ler o arquivo da frente f1 \(\.claude\/esquadro\/escopos\/f1\.md\)/.test(r.stdout), r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('R1: varias frentes - o painel diz o que e frente e como ligar a sessao a uma delas', () => {
  const t = planoLib.painelVariasFrentes([{ frente: 'fa', arquivo: 'a.md' }, { frente: 'fb', arquivo: 'b.md' }], null);
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('nenhum plano ativo, e esta sessao nao esta ligada a nenhuma frente (frente = linha de trabalho com ' +
    'arquivo proprio em .claude/esquadro/escopos/). Frentes com plano:') !== -1, t);
  assert.ok(t.indexOf('Para escolher: edite o arquivo da frente que voce quer, .claude/esquadro/escopos/<frente>.md ' +
    '(qualquer edicao liga esta sessao a ela), e rode /esquadro-plano de novo; ou abra um plano:') !== -1, t);
});

// R2 da revisao cega D469 de scripts/lib/plano.js (sessao 101).
test('R2: "Plano:" com markdown, aspas simples, aspa sem fechar, valor vazio e quebra de linha', () => {
  assert.strictEqual(planoLib.planoDoObjetivo('**Plano:** docs/x.md'), 'docs/x.md');
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: **docs/x.md**'), 'docs/x.md');
  assert.strictEqual(planoLib.planoDoObjetivo("Plano: 'docs/meu plano.md'"), 'docs/meu plano.md');
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: docs/x.md"'), 'docs/x.md');
  assert.strictEqual(planoLib.planoDoObjetivo('Plano:\nOutra coisa'), null);
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: "docs/meu plano.md'), null);
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: ""'), null);
  // valor que nao e caminho nao apaga o anterior
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: a.md. depois Plano: ...'), 'a.md');
  assert.strictEqual(planoLib.planoDoObjetivo('Plano: a.md e Plano: "b c.md'), 'a.md');
});

test('R2: com varios "Plano:", vale o ultimo que existe no disco; nenhum existe -> o ultimo, e o painel da a dica', () => {
  const r = projetoComFrentes({ frentes: { f1: 'X. Plano: plano.md. depois Plano: pendente' }, vinculo: 'f1' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: f1)') !== -1, r.stdout);
  const s = projetoComFrentes({ frentes: { f1: 'X. Plano: docs/meu plano.md' }, vinculo: 'f1' });
  assert.strictEqual(s.status, 0, s.stderr);
  assert.ok(s.stdout.indexOf('nao consegui ler docs/meu') !== -1, s.stdout);
  assert.ok(s.stdout.indexOf('se o caminho tem espaco, ponha-o entre crases no Objetivo') !== -1, s.stdout);
});

test('R2: estimativa com trabalho pela frente nunca sai 0 sessoes', () => {
  assert.deepStrictEqual(planoLib.estimativaDeSessoes(1, 3, 1), { sessoes: 1, media: 1 / 3 });
  assert.deepStrictEqual(planoLib.estimativaDeSessoes(7, 3, 0), { sessoes: 0, media: 7 / 3 });
});

test('R2: sem vinculo, frente cujo arquivo nao se le aparece na lista (e sozinha diz que nao se le)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-ilegivel2-'));
  const env = Object.assign({}, process.env, { ESQUADRO_TMP: path.join(base, '_tmp') });
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_SESSION_ID;
  try {
    const escopos = path.join(base, '.claude', 'esquadro', 'escopos');
    fs.mkdirSync(path.join(escopos, 'fa.md'), { recursive: true });
    const so = spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 'nada'], { cwd: base, encoding: 'utf8', env: env });
    assert.ok(/nao consegui ler o arquivo da frente fa/.test(so.stdout), so.stdout);
    fs.writeFileSync(path.join(escopos, 'fb.md'), '**Objetivo:** X. Plano: plano.md\n');
    const duas = spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 'nada'], { cwd: base, encoding: 'utf8', env: env });
    assert.ok(/fa: \(o arquivo da frente nao se le\)/.test(duas.stdout) && /fb: plano\.md/.test(duas.stdout), duas.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('D476: plano.js --texto usa o leitor novo (plano no formato real, achado pela frente)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-real-'));
  try {
    fs.mkdirSync(path.join(base, '.claude', 'esquadro', 'escopos'), { recursive: true });
    fs.writeFileSync(path.join(base, 'real.md'), PLANO_REAL);
    fs.writeFileSync(path.join(base, '.claude', 'esquadro', 'escopos', 'so.md'), '**Objetivo:** X. Plano: real.md\n');
    const env = Object.assign({}, process.env, { ESQUADRO_TMP: path.join(base, '_tmp') });
    delete env.CLAUDE_CODE_SESSION_ID;
    const r = spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 'nada'], { cwd: base, encoding: 'utf8', env: env });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('tarefas: 3 de 7 concluidas') !== -1, r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
