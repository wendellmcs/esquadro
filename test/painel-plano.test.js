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
  fs.writeFileSync(path.join(base, 'plano.md'), opcoes.plano != null ? opcoes.plano : PLANO);
  fs.writeFileSync(path.join(base, 'velho.md'), '### Tarefa 1: Velha\n- [ ] nada\n');
  // D502: o escopo.md da raiz (o escopo em vigor da sessao sem vinculo)
  if (opcoes.escopo != null) {
    fs.writeFileSync(path.join(base, '.claude', 'esquadro', 'escopo.md'), '# Escopo\n**Objetivo:** ' + opcoes.escopo + '\n## Dentro\n- x/**\n');
  }
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
  // D502: a marca "(sessao 1" do Objetivo e da frente, nao do plano - o plano sem marca nao conta sessoes
  assert.ok(r.stdout.indexOf('sessoes gastas: nao contadas') !== -1, r.stdout);
});

test('D502: as sessoes gastas vem das marcas do PLANO, nao das 40 do Objetivo da frente', () => {
  const marcas = [];
  for (let i = 1; i <= 40; i++) marcas.push('(sessao ' + i + ', hoje)');
  const r = projetoComFrentes({
    frentes: { f1: marcas.join(' ') + ' Plano: plano.md' }, vinculo: 'f1',
    plano: '### Tarefa 1: A\n- [x] um (s37: feito)\n- [x] dois (s37, depois)\n### Tarefa 2: B\n- [x] tres (s38: ok)\n' +
      '### Tarefa 3: C\n- [ ] quatro'
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('sessoes gastas: 2 (marcas "(sN" ou "(sessao N" distintas no plano)') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('estimativa: 1 sessao para a 1 que falta (base: media de 1,0 sessao por tarefa feita = ' +
    '2 sessoes / 2 feitas)') !== -1, r.stdout);
});

test('D502: sessao sem vinculo le o escopo.md da raiz antes das frentes', () => {
  const r = projetoComFrentes({ escopo: 'APP. Plano: velho.md', frentes: { so: 'outra frente. Plano: plano.md' } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(ASCII.test(r.stdout), JSON.stringify(r.stdout));
  assert.ok(r.stdout.indexOf('plano: velho.md (anotado no escopo desta sessao, .claude/esquadro/escopo.md)') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('frente: so') === -1, r.stdout);
  // varias frentes com plano tambem nao passam na frente do escopo.md
  const v = projetoComFrentes({ escopo: 'APP. Plano: velho.md', frentes: { fa: 'A. Plano: plano.md', fb: 'B. Plano: plano.md' } });
  assert.ok(v.stdout.indexOf('plano: velho.md (anotado no escopo desta sessao, .claude/esquadro/escopo.md)') !== -1, v.stdout);
});

test('D502: a forma que o escopo da raiz ja escreve, plano `caminho.md` (minusculo, sem dois-pontos), vale', () => {
  const r = projetoComFrentes({ escopo: 'ETAPA P2 (plano `velho.md` secao 7, linha P2)', frentes: { so: 'X. Plano: plano.md' } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano: velho.md (anotado no escopo desta sessao, .claude/esquadro/escopo.md)') !== -1, r.stdout);
});

test('R1 D502: escopo.md da raiz que nao se le e dito; Plano: dele que nao existe no disco nao cai noutra frente', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-raiz-'));
  const env = Object.assign({}, process.env, { ESQUADRO_TMP: path.join(base, '_tmp') });
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_SESSION_ID;
  try {
    fs.mkdirSync(path.join(base, '.claude', 'esquadro', 'escopo.md'), { recursive: true });
    fs.mkdirSync(path.join(base, '.claude', 'esquadro', 'escopos'), { recursive: true });
    fs.writeFileSync(path.join(base, 'plano.md'), PLANO);
    fs.writeFileSync(path.join(base, '.claude', 'esquadro', 'escopos', 'so.md'), '**Objetivo:** X. Plano: plano.md\n');
    const r = spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 'nada'], { cwd: base, encoding: 'utf8', env: env });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('nao consegui ler o escopo .claude/esquadro/escopo.md. Confira se ele e um arquivo') !== -1, r.stdout);
    assert.ok(r.stdout.indexOf('frente: so') === -1, r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
  const p = projetoComFrentes({ escopo: 'APP. Plano: pendente.md', frentes: { so: 'X. Plano: plano.md' } });
  assert.ok(p.stdout.indexOf('nao consegui ler pendente.md') !== -1, p.stdout);
  assert.ok(p.stdout.indexOf('frente: so') === -1, p.stdout);
});

test('D502: sem plano no escopo.md, cai na frente unica e diz que a sessao nao esta ligada a ela', () => {
  const r = projetoComFrentes({ escopo: 'APP sem plano anotado', frentes: { so: 'X. Plano: plano.md' } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: so; esta sessao nao esta ligada a ela - para ligar, edite .claude/esquadro/escopos/so.md)') !== -1, r.stdout);
});

test('D502: plano minusculo so com crase ou aspas e .md; "Plano:" ganha quando os dois existem', () => {
  const p = planoLib.planosCitados;
  assert.deepStrictEqual(p('o plano 0.7.3 e o plano 074) e plano §3 e PLANO DA 0.5 e plano docs/x.md'), []);
  assert.deepStrictEqual(p('(plano `docs/meu plano.md` secao 7) e plano "b.md" e Plano \'c.md\''), ['docs/meu plano.md', 'b.md', 'c.md']);
  assert.deepStrictEqual(p('plano `notas.txt`'), []);
  const r = projetoComFrentes({ frentes: { f1: 'X. Plano: plano.md (s1) depois o plano `velho.md` citado' }, vinculo: 'f1' });
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: f1)') !== -1, r.stdout);
});

test('D476: sem vinculo e com UMA frente com plano no disco, o painel usa ela; ponto final do caminho nao entra', () => {
  const r = projetoComFrentes({ frentes: { so: 'fazer X. Plano: plano.md.', semplano: 'nada aqui' } });
  assert.strictEqual(r.status, 0, r.stderr);
  // D502: sem vinculo, o rotulo diz que a sessao nao e da frente
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: so; esta sessao nao esta ligada a ela - para ligar, edite .claude/esquadro/escopos/so.md)') !== -1, r.stdout);
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
  assert.ok(r.stdout.indexOf('a frente f1 nao declara plano no Objetivo (o paragrafo "**Objetivo:**" de ' +
    '.claude/esquadro/escopos/f1.md). Anote no fim dele "Plano: <caminho>" (ou plano `<caminho>.md`, entre crases)') !== -1, r.stdout);
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

// D502 (era D476 item 3, no Objetivo da frente): sessoes gastas = marcas "(sN" / "(sessao N" DISTINTAS no plano;
// estimativa = (sessoes / feitas) x as que faltam, arredondada; sem tarefa feita nao ha base.
test('D502: sessoesDoPlano conta "(sN" e "(sessao N" distintas, com e sem acento, e so com numero', () => {
  assert.strictEqual(planoLib.sessoesDoPlano(
    'X (sessao 91, hoje: a) Y (sessão 92) (Sessao 93: b) sessao 94 sem parentese (sessao sem numero) (sessao 95'), 4);
  assert.strictEqual(planoLib.sessoesDoPlano('- [x] a (s37: um)\n- [x] b (s37, dois)\n- [x] c (S38)\n(s39x) (sim) (s 40)'), 2);
  // exemplo entre crases nao e marca
  assert.strictEqual(planoLib.sessoesDoPlano('(sessão 38, hoje) as marcas `(s37` e `(s38` e `(sessão 12,`'), 1);
  assert.strictEqual(planoLib.sessoesDoPlano(''), 0);
  assert.strictEqual(planoLib.sessoesDoPlano(null), 0);
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
  const t = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: 4 },
    planoLib.parseItens(PLANO_REAL));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('falta: 4 de 7 (Item 3b, Etapa 4, Onda 5, Fase 6)') !== -1, t);
  assert.ok(t.indexOf('sessoes gastas: 4 (marcas "(sN" ou "(sessao N" distintas no plano)') !== -1, t);
  assert.ok(t.indexOf('estimativa: 5 sessoes para as 4 que faltam (base: media de 1,3 sessoes por tarefa feita = ' +
    '4 sessoes / 3 feitas)') !== -1, t);
  // a ordem do plano: proxima, falta, sessoes gastas, estimativa
  assert.ok(t.indexOf('proxima:') < t.indexOf('falta:') && t.indexOf('falta:') < t.indexOf('sessoes gastas:') &&
    t.indexOf('sessoes gastas:') < t.indexOf('estimativa:'), t);
});

test('D502: plano sem marca de sessao (com ou sem frente) diz como anotar e nao estima', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1' }, planoLib.parseItens(PLANO));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('falta: 2 de 3 (Tarefa 2, Tarefa 3)') !== -1, t);
  assert.ok(t.indexOf('sessoes gastas: nao contadas - o plano nao tem marca de sessao; ao marcar uma caixa, anote ' +
    '"(sN: o que fez)", com N o numero da sessao') !== -1, t);
  assert.ok(t.indexOf('estimativa: sem as sessoes gastas nao ha base') !== -1, t);
  // D502: aberto por --abrir tambem conta, se o plano tem marca
  const a = planoLib.painelTexto({ arquivo: 'p.md', sessionId: 's1', sessoesDoPlano: 2 }, planoLib.parseItens(PLANO));
  assert.ok(a.indexOf('sessoes gastas: 2 (marcas') !== -1, a);
  assert.ok(a.indexOf('estimativa: 4 sessoes para as 2 que faltam') !== -1, a);
});

test('D502: plano.js --texto conta as marcas do plano tambem no plano aberto por --abrir', () => {
  const r = projetoComFrentes({ ativo: 'plano.md', plano: '### Tarefa 1: A\n- [x] a (s5: ok)\n### Tarefa 2: B\n- [ ] b' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano ativo: plano.md') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('sessoes gastas: 1 (marcas') !== -1, r.stdout);
});

test('D476: frente sem tarefa feita nao estima; tudo feito diz que nada falta; 1 sessao no singular', () => {
  const sem = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: 1 },
    planoLib.parseItens('### Item 1: A\n- [ ] a\n### Item 2: B'));
  assert.ok(sem.indexOf('sessoes gastas: 1 (marcas') !== -1, sem);
  assert.ok(sem.indexOf('estimativa: sem base para estimar ainda (nenhuma tarefa feita)') !== -1, sem);
  const tudo = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: 2 },
    planoLib.parseItens('### Item 1: A\n- [x] a'));
  assert.ok(tudo.indexOf('falta: nada') !== -1, tudo);
  assert.ok(tudo.indexOf('estimativa: nada falta') !== -1, tudo);
  const um = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: 2 },
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

test('R1: plano sem marca de sessao e com tarefa feita nao estima 0 sessoes', () => {
  assert.strictEqual(planoLib.estimativaDeSessoes(0, 2, 3), null);
  const t = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: 0 },
    planoLib.parseItens('### Item 1: A\n- [x] a\n### Item 2: B\n- [ ] b'));
  assert.ok(t.indexOf('sessoes gastas: nao contadas') !== -1, t);
  assert.ok(t.indexOf('estimativa: sem as sessoes gastas nao ha base') !== -1, t);
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
    assert.ok(r.stdout.indexOf('nao declara plano') === -1, r.stdout);
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

// D506/D507/D509 (Tarefa 6 da 0.7.8): o plano do APP lista as etapas numa tabela (secao 7, P0-P7), sem caixa nem
// [FEITO]; o estado vive no Objetivo do escopo ("ETAPA P2"). Forma copiada do plano real (so as colunas e os ids),
// com as outras tabelas dele, que nao sao de etapas (1a celula "#" e "Arquivo", esta com uma coluna "Etapa").
const PLANO_TABELA = [
  '# Plano do app -- parte 2',
  '## 4. Fatos que decidem o desenho',
  '| # | Fato | Fonte |',
  '|---|---|---|',
  '| F1 | 16 abas no registro | `x.js:1` [V] |',
  '## 7. Etapas (~11-12 sessoes [I]) -- ordem nova',
  '',
  '| Etapa | O que | Onde mexe | Aceite | Release/deploy |',
  '|---|---|---|---|---|',
  '| **P0 provas** (~2) | N1-N7, N9-N12 (secao 6; N8 saiu) | copia + prototipo descartavel | aceite do P0 (6) | nenhum |',
  '| **P1 extensão: preparo** (~1,75) | superficie `app` | `workspace.js` | contrato | release da extensao |',
  '| **P2 motor do app** (~2) | protocolo, 2 janelas | `app-desktop/main.js` | N1-N7 de novo | nenhum |',
  '| **P3 app: telas + ponte** (~2) | servidor da ponte | `app-desktop/src/*` | estados | nenhum |',
  '| **P4 release do app** (~0,5) | 1.1.0 | `package.json` | 1.0.1 -> 1.1.0 | **release do app** |',
  '',
  '## 8. Contagem por arquivo',
  '| Arquivo | Pontos | Etapa |',
  '|---|---|---|',
  '| `extension/background.js` | guarda | P1 |'
].join('\n');
const OBJETIVO_APP = 'APP PARTE 2 -- ETAPA P3 "APP: TELAS + PONTE" (plano `plano.md` secao 7, linha P3)';

test('D509: parseItens le a tabela de etapas (1a celula Etapa/Item/Tarefa/Onda/Fase), id sem **, e so ela', () => {
  const itens = planoLib.parseItens(PLANO_TABELA);
  assert.deepStrictEqual(itens.map(function (t) { return t.tipo + ' ' + t.id; }),
    ['Etapa P0', 'Etapa P1', 'Etapa P2', 'Etapa P3', 'Etapa P4']);
  assert.deepStrictEqual(itens.map(function (t) { return t.titulo; }),
    ['provas (~2)', 'extensão: preparo (~1,75)', 'motor do app (~2)', 'app: telas + ponte (~2)', 'release do app (~0,5)']);
  assert.deepStrictEqual(itens.map(function (t) { return t.estado; }), ['sem marca', 'sem marca', 'sem marca', 'sem marca', 'sem marca']);
  // os outros nomes da 1a celula, no plural, id so numero, e o titulo da 2a celula quando a 1a so tem o id
  assert.deepStrictEqual(planoLib.parseItens('| Fases | O que |\n|---|---|\n| 1 | preparo |\n| 2a - fecho | x |')
    .map(function (t) { return t.tipo + ' ' + t.id + ': ' + t.titulo; }), ['Fase 1: preparo', 'Fase 2a: fecho']);
  for (const nome of ['Item', 'Tarefa', 'Onda', '**Etapa**']) {
    assert.strictEqual(planoLib.parseItens('| ' + nome + ' | X |\n|---|---|\n| D1 | a |').length, 1, nome);
  }
  // linha de tabela sem id na 1a celula nao vira etapa; tabela sem a linha |---| nao e tabela
  assert.strictEqual(planoLib.parseItens('| Etapa | X |\n|---|---|\n| Preparo | a |').length, 0);
  assert.strictEqual(planoLib.parseItens('| Etapa | X |\n|---|---|\n| 3dias de prova | a |').length, 0);
  assert.strictEqual(planoLib.parseItens('| Etapa | X |\n| P0 | a |').length, 0);
  // ids reais: "2b-0" (decisor-local) e "I0.0" (superplano) inteiros
  assert.deepStrictEqual(planoLib.parseItens('| Fase | X |\n|---|---|\n| 2b-0 | Laya |\n| **I0.0** caracterizacao | a |')
    .map(function (t) { return t.id + ': ' + t.titulo; }), ['2b-0: Laya', 'I0.0: caracterizacao']);
});

test('D509: so a 1a tabela de etapas com id vale, id repetido nao conta, e plano com caixas ignora tabela', () => {
  // o plano do APP parte 1: a tabela "| Item | Onde |" (pedidos 51-63) depois das etapas nao e etapa
  const duas = PLANO_TABELA + '\n\n| Item | Onde |\n|---|---|\n| 51 (par identico) | 4.3 |\n| 54 (abas) | todo |';
  assert.deepStrictEqual(planoLib.parseItens(duas).map(function (t) { return t.id; }), ['P0', 'P1', 'P2', 'P3', 'P4']);
  // a 1a tabela sem linha de id (plano de evolucao: "| Item |" com "Modelo") nao toma o lugar da de etapas
  const semId = '| Item | O que |\n|---|---|\n| Modelo | jina |\n\n| Fase | X |\n|---|---|\n| **0 — Enxergar** | a |';
  assert.deepStrictEqual(planoLib.parseItens(semId).map(function (t) { return t.tipo + ' ' + t.id + ': ' + t.titulo; }),
    ['Fase 0: Enxergar']);
  // id repetido (tabela de resultado do superplano: I0 em 4 linhas) conta uma vez
  assert.strictEqual(planoLib.parseItens('| Tarefa | R |\n|---|---|\n| I0 a | x |\n| I0 b | y |\n| D0 | z |').length, 2);
  // plano de caixas com tabela-resumo das tarefas: as caixas mandam, a tabela nao duplica
  const resumo = '### Tarefa 1: A\n- [x] um\n### Tarefa 2: B\n- [ ] dois\n\n| Tarefa | Arquivos |\n|---|---|\n| 1 | a.js |\n| 2 | b.js |';
  assert.deepStrictEqual(planoLib.parseItens(resumo).map(function (t) { return t.id + '=' + t.estado; }), ['1=feita', '2=aberta']);
});

test('D509: [FEITO] na celula da etapa = feita; noutra celula nao conta; as caixas seguem no cabecalho de cima', () => {
  const plano = PLANO_TABELA.replace('**P0 provas** (~2)', '**P0 provas** (~2) [FEITO]')
    .replace('| contrato |', '| contrato [FEITO] |');
  const itens = planoLib.parseItens(plano);
  assert.strictEqual(itens[0].estado, 'feita');
  assert.strictEqual(itens[0].titulo, 'provas (~2)');
  assert.strictEqual(itens[1].estado, 'sem marca');
  // caixa depois da tabela e do cabecalho de tarefa acima, nao da ultima linha da tabela (e, com caixa, a tabela sai)
  const misto = planoLib.parseItens('### Tarefa 1: A\n| Etapa | X |\n|---|---|\n| E1 | a |\n- [ ] passo');
  assert.deepStrictEqual(misto.map(function (t) { return t.id + '=' + t.estado; }), ['1=aberta']);
});

test('D509: sem marca na tabela, deduz pela "ETAPA <id>" do Objetivo (anteriores feitas, ela em curso) e avisa', () => {
  const itens = planoLib.deduzirPeloEscopo(planoLib.parseItens(PLANO_TABELA), OBJETIVO_APP);
  assert.deepStrictEqual(itens.map(function (t) { return t.estado; }), ['feita', 'feita', 'feita', 'em curso', 'a fazer']);
  const t = planoLib.painelTexto({ arquivo: 'plano.md', escopo: '.claude/esquadro/escopo.md' }, itens);
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('tarefas: 3 de 5 concluidas') !== -1, t);
  assert.ok(t.indexOf('(em curso, pelo escopo)') !== -1, t);
  assert.ok(t.indexOf('o Objetivo do escopo (o paragrafo "Objetivo:"), que diz ETAPA P3') !== -1, t);
  assert.ok(t.indexOf('[x] Etapa P1: extensao: preparo (~1,75)') !== -1, t);
  assert.ok(t.indexOf('[>] Etapa P3: app: telas + ponte (~2) (em curso, pelo escopo)') !== -1, t);
  assert.ok(t.indexOf('[ ] Etapa P4: release do app (~0,5)') !== -1, t);
  assert.ok(t.indexOf('[?]') === -1, t);
  assert.ok(t.indexOf('proxima: Etapa P3 "app: telas + ponte (~2)" - em curso (pelo escopo)') !== -1, t);
  assert.ok(t.indexOf('falta: 2 de 5 (Etapa P3, Etapa P4)') !== -1, t);
  // caixa baixa vale; vale a ULTIMA etapa citada que existe na tabela
  const baixa = planoLib.deduzirPeloEscopo(planoLib.parseItens(PLANO_TABELA), 'etapa P1 feita (s1). agora etapa p2; ETAPA P9');
  assert.deepStrictEqual(baixa.map(function (x) { return x.estado; }), ['feita', 'feita', 'em curso', 'a fazer', 'a fazer']);
});

test('D509: com marca na tabela a marca manda; sem "ETAPA <id>" que exista na tabela, fica "sem marca" como hoje', () => {
  const marcado = planoLib.parseItens(PLANO_TABELA.replace('**P0 provas** (~2)', '**P0 provas** (~2) [FEITO]'));
  assert.deepStrictEqual(planoLib.deduzirPeloEscopo(marcado, OBJETIVO_APP).map(function (t) { return t.estado; }),
    ['feita', 'sem marca', 'sem marca', 'sem marca', 'sem marca']);
  for (const objetivo of ['APP sem etapa', 'ETAPA P9', 'etapa 3', '', null]) {
    const itens = planoLib.deduzirPeloEscopo(planoLib.parseItens(PLANO_TABELA), objetivo);
    assert.ok(itens.every(function (t) { return t.estado === 'sem marca'; }), String(objetivo));
    assert.ok(planoLib.painelTexto({ arquivo: 'p.md' }, itens).indexOf('pelo escopo') === -1, String(objetivo));
  }
  // so a tabela se deduz: cabecalho de lista com caixas fica com as caixas
  const lista = planoLib.deduzirPeloEscopo(planoLib.parseItens('### Etapa 1: A\n- [ ] x\n### Etapa 2: B\n- [ ] y'), 'ETAPA 2');
  assert.deepStrictEqual(lista.map(function (t) { return t.estado; }), ['aberta', 'aberta']);
  // o painel sem itens fala tambem da tabela
  assert.ok(/tabela/.test(planoLib.painelTexto({ arquivo: 'p.md' }, [])));
});

test('D509: plano.js --texto mostra a tabela do plano do escopo com a deducao; plano aberto por --abrir nao deduz', () => {
  const r = projetoComFrentes({ escopo: OBJETIVO_APP, plano: PLANO_TABELA });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(ASCII.test(r.stdout), JSON.stringify(r.stdout));
  assert.ok(r.stdout.indexOf('plano: plano.md (anotado no escopo desta sessao, .claude/esquadro/escopo.md)') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('tarefas: 3 de 5 concluidas') !== -1, r.stdout);
  assert.ok(r.stdout.indexOf('[>] Etapa P3') !== -1, r.stdout);
  const aberto = projetoComFrentes({ escopo: OBJETIVO_APP, plano: PLANO_TABELA, ativo: 'plano.md' });
  assert.ok(aberto.stdout.indexOf('tarefas: 0 de 5 concluidas') !== -1, aberto.stdout);
  assert.ok(aberto.stdout.indexOf('pelo escopo') === -1, aberto.stdout);
});

// D512 (Tarefa 7 da 0.7.8): os P2 de comportamento da revisao cega (lista em p2-078-s41.md, numero entre parenteses).
test('P2 #5: sessoesDoPlano em texto ("1") conta como numero, e o singular sai certo', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: '1' },
    planoLib.parseItens('### Item 1: A\n- [x] a\n### Item 2: B\n- [ ] b'));
  assert.ok(t.indexOf('sessoes gastas: 1 (marcas') !== -1, t);
  assert.ok(t.indexOf('= 1 sessao / 1 feita)') !== -1, t);
  for (const torto of ['abc', '1.5', -2, null]) {
    const x = planoLib.painelTexto({ arquivo: 'p.md', frente: 'f1', sessoesDoPlano: torto }, planoLib.parseItens('### Item 1: A\n- [x] a'));
    assert.ok(x.indexOf('sessoes gastas: nao contadas') !== -1, String(torto) + ' -> ' + x);
  }
});

test('P2 #6: plano do Objetivo fora da pasta do projeto nao e lido, e o painel diz por que', () => {
  assert.strictEqual(planoLib.dentroDoProjeto('/p', 'docs/x.md'), true);
  assert.strictEqual(planoLib.dentroDoProjeto('/p', 'a/../x.md'), true);
  assert.strictEqual(planoLib.dentroDoProjeto('/p', '../x.md'), false);
  assert.strictEqual(planoLib.dentroDoProjeto('/p', 'a/../../x.md'), false);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-fora-'));
  const proj = path.join(base, 'proj');
  const env = Object.assign({}, process.env, { ESQUADRO_TMP: path.join(base, '_tmp') });
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_SESSION_ID;
  try {
    fs.mkdirSync(path.join(proj, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(base, 'fora.md'), PLANO);
    fs.writeFileSync(path.join(proj, '.claude', 'esquadro', 'escopo.md'), '**Objetivo:** X. Plano: ../fora.md\n');
    const r = spawnSync(process.execPath, [SCRIPT, '--texto', '--sessao', 'nada'], { cwd: proj, encoding: 'utf8', env: env });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(ASCII.test(r.stdout), JSON.stringify(r.stdout));
    assert.ok(r.stdout.indexOf('tarefas:') === -1, r.stdout);
    assert.ok(r.stdout.indexOf('o plano ../fora.md fica fora da pasta do projeto') !== -1, r.stdout);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// Plano legivel cujo parse lanca: o `-r` troca a funcao da lib antes do plano.js rodar (o require e o mesmo objeto).
function painelQueLanca(funcao) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-painel-lanca-'));
  const env = Object.assign({}, process.env, { ESQUADRO_TMP: path.join(base, '_tmp') });
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_SESSION_ID;
  try {
    fs.mkdirSync(path.join(base, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(base, 'plano.md'), PLANO);
    fs.writeFileSync(path.join(base, '.claude', 'esquadro', 'escopo.md'), '**Objetivo:** X. Plano: plano.md\n');
    const pre = path.join(base, 'lanca.js');
    fs.writeFileSync(pre, 'require(' + JSON.stringify(path.join(__dirname, '..', 'scripts', 'lib', 'plano.js')) + ').' +
      funcao + ' = function () { throw new Error("quebrou"); };\n');
    return spawnSync(process.execPath, ['-r', pre, SCRIPT, '--texto', '--sessao', 'nada'], { cwd: base, encoding: 'utf8', env: env });
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

test('P2 #8 e #15: erro ao montar o painel de um plano lido nao vira "nao consegui ler"', () => {
  for (const funcao of ['sessoesDoPlano', 'parseItens', 'deduzirPeloEscopo']) {
    const r = painelQueLanca(funcao);
    assert.strictEqual(r.status, 0, funcao + ': ' + r.stderr);
    assert.ok(r.stdout.indexOf('nao consegui ler') === -1, funcao + ' -> ' + r.stdout);
    assert.ok(r.stdout.indexOf('li plano.md, mas o painel falhou ao montar a conta (quebrou)') !== -1, funcao + ' -> ' + r.stdout);
    // R1 da s43: a mensagem diz o que fazer agora
    assert.ok(r.stdout.indexOf('veja as tarefas direto no arquivo do plano e registre a mensagem') !== -1, funcao + ' -> ' + r.stdout);
  }
});

test('P2 #9: "(s1, s2: ...)" conta as duas sessoes; numero sem "s" na lista nao e sessao', () => {
  assert.strictEqual(planoLib.sessoesDoPlano('(s1, s2: refeito) (s3 e s4) (s5, dois) (sessao 6, sessao 7) (s8, s9x)'), 8);
  assert.strictEqual(planoLib.sessoesDoPlano('(sessao 3, 2026-10-13 22:41: x) (s3/s4)'), 1);
  assert.strictEqual(planoLib.sessoesDoPlano('exemplo `(s1, s2: x)` nao conta'), 0);
});

test('P2 #12: Plano: que nao existe no disco perde para o plano citado que existe', () => {
  const r = projetoComFrentes({ frentes: { f1: 'X. Plano: sumiu.md e depois o plano `plano.md` citado' }, vinculo: 'f1' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('plano: plano.md (frente: f1)') !== -1, r.stdout);
});

test('P2 #16: linha da tabela de etapas sem id fica fora da conta, e o painel avisa', () => {
  const itens = planoLib.parseItens('| Etapa | X |\n|---|---|\n| P0 | a |\n| Alfa | b |\n| P1 | c |');
  assert.deepStrictEqual(itens.map(function (t) { return t.id; }), ['P0', 'P1']);
  assert.deepStrictEqual(itens.semId, [{ linha: 4, texto: 'Alfa' }]);
  const t = planoLib.painelTexto({ arquivo: 'p.md' }, planoLib.deduzirPeloEscopo(itens, 'ETAPA P1'));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('aviso: 1 linha da tabela de etapas sem id no comeco da 1a celula ficou fora da conta ' +
    '(linha 4: "Alfa")') !== -1, t);
  // tabela que nao conta (sem nenhuma linha de id, ou plano com caixas) nao avisa
  const semId = '| Item | O que |\n|---|---|\n| Modelo | jina |\n\n| Fase | X |\n|---|---|\n| **0 — Enxergar** | a |';
  assert.strictEqual(planoLib.parseItens(semId).semId, undefined);
  assert.strictEqual(planoLib.parseItens('### Tarefa 1: A\n- [ ] a\n| Etapa | X |\n|---|---|\n| P0 | a |\n| Alfa | b |').semId, undefined);
  assert.ok(planoLib.painelTexto({ arquivo: 'p.md' }, planoLib.parseItens(PLANO_TABELA)).indexOf('aviso:') === -1);
});

test('P2 #17: etapa sem titulo aparece com "(sem titulo)", nao com a linha cortada', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md' }, planoLib.parseItens('| Etapa | O que |\n|---|---|\n| P0 | |'));
  assert.ok(t.indexOf('[?] Etapa P0: (sem titulo) (sem [FEITO]') !== -1, t);
});

test('P2 #18: tipo da tabela no plural vira singular ("Etapas P0" -> "Etapa P0")', () => {
  assert.strictEqual(planoLib.parseItens('| Etapas | X |\n|---|---|\n| P0 | a |')[0].tipo, 'Etapa');
  assert.strictEqual(planoLib.parseItens('| **ONDAS** | X |\n|---|---|\n| 1 | a |')[0].tipo, 'ONDA');
});

test('P2 #19: cabecalho sem caixa logo antes da tabela de etapas nao some como agrupador', () => {
  const itens = planoLib.parseItens('### Etapa 1: Preparar\n| Etapa | X |\n|---|---|\n| P0 | a |\n| P1 | b |');
  assert.deepStrictEqual(itens.map(function (t) { return t.tipo + ' ' + t.id + '=' + t.estado; }),
    ['Etapa 1=sem marca', 'Etapa P0=sem marca', 'Etapa P1=sem marca']);
  // o agrupador de cabecalhos mais fundos segue saindo (R1)
  assert.deepStrictEqual(planoLib.parseItens('## Fase 1: G\n### Tarefa 1: A\n- [x] a').map(function (t) { return t.id; }), ['1']);
});

test('P2 #20 e #21: item do painel sem "n" (id e a chave) e deducao sem etapaDoEscopo repetido em toda linha', () => {
  const itens = planoLib.parseItens(PLANO_REAL).concat(planoLib.parseItens('| Etapa | X |\n|---|---|\n| P1 | a |\n| E1 | b |'));
  assert.strictEqual(itens.length, 9);
  assert.ok(itens.every(function (t) { return !('n' in t); }), JSON.stringify(itens));
  const ded = planoLib.deduzirPeloEscopo(planoLib.parseItens(PLANO_TABELA), OBJETIVO_APP);
  assert.ok(ded.every(function (t) { return !('etapaDoEscopo' in t); }), JSON.stringify(ded));
  assert.ok(planoLib.painelTexto({ arquivo: 'p.md' }, ded).indexOf('ETAPA P3') !== -1);
});

test('D513 #1: barra vertical escapada na celula nao corta o titulo da etapa', () => {
  const itens = planoLib.parseItens('| Etapa | O que |\n|---|---|\n| P0 | usa `a\\|b` no filtro |\n| P1 x\\|y | b |');
  assert.deepStrictEqual(itens.map(function (t) { return t.id + ': ' + t.titulo; }), ['P0: usa `a|b` no filtro', 'P1: x|y']);
});

test('D513 #2: plano com BOM nao perde o cabecalho da 1a linha', () => {
  assert.deepStrictEqual(planoLib.parseItens('\uFEFF### Tarefa 1: A\n- [ ] a').map(function (t) { return t.id + ' ' + t.estado; }),
    ['1 aberta']);
});

test('D513 #16: painel de plano-ativo.json com acento no caminho e no dono sai em ASCII (R5)', () => {
  const t = planoLib.painelTexto({ arquivo: 'docs/planó.md', sessionId: 'sessão' }, planoLib.parseItens('### Tarefa 1: A\n- [ ] a'));
  assert.ok(ASCII.test(t), JSON.stringify(t));
  assert.ok(t.indexOf('plano ativo: docs/plano.md (dono: sessao)') !== -1, t);
});

test('D513 #12 e #21: os avisos do painel dizem o que mudar no plano', () => {
  const t = planoLib.painelTexto({ arquivo: 'p.md' }, planoLib.parseItens('| Etapa | X |\n|---|---|\n| P0 | a |\n| Alfa | b |'));
  assert.ok(t.indexOf('ficou fora da conta (linha 4: "Alfa"); para contar, comece a 1a celula pelo id (P0, 2a, 2b-0)') !== -1, t);
  const vazio = planoLib.painelTexto({ arquivo: 'p.md' }, []);
  assert.ok(ASCII.test(vazio), JSON.stringify(vazio));
  assert.ok(vazio.indexOf('o painel nao consegue contar as tarefas. Para contar, escreva as tarefas num desses formatos.') !== -1, vazio);
});

test('R2 da s44: tabela colada na de etapas, sem linha em branco, e outra tabela (nao soma etapas nem vira "sem id")', () => {
  const colada = '| Etapa | Estado |\n|---|---|\n| P0 | x |\n| Item | Onde |\n|---|---|\n| 51 | y |';
  const itens = planoLib.parseItens(colada);
  assert.deepStrictEqual(itens.map(function (t) { return t.tipo + ' ' + t.id; }), ['Etapa P0']);
  assert.strictEqual(itens.semId, undefined);
  const outra = planoLib.parseItens('| Etapa | Estado |\n|---|---|\n| P0 | x |\n| Risco | Dono |\n|---|---|\n| Alfa | y |\n| P1 | z |');
  assert.deepStrictEqual(outra.map(function (t) { return t.id; }), ['P0']);
  assert.strictEqual(outra.semId, undefined);
  // Linha sem "|" antes do |---| nao abre tabela.
  assert.deepStrictEqual(planoLib.parseItens('Etapa\n|---|---|\n| P0 | x |'), []);
});

test('D514 #1: linha vazia da tabela de etapas (espacador) nao vira "sem id" nem fecha a tabela', () => {
  const itens = planoLib.parseItens('| Etapa | X |\n|---|---|\n| P0 | a |\n| | |\n|  |\n|\n| P1 | b |');
  assert.deepStrictEqual(itens.map(function (t) { return t.id; }), ['P0', 'P1']);
  assert.strictEqual(itens.semId, undefined);
  assert.ok(planoLib.painelTexto({ arquivo: 'p.md' }, itens).indexOf('aviso:') === -1);
  // linha com texto e sem id segue avisada (a linha vazia antes dela nao conta)
  assert.deepStrictEqual(planoLib.parseItens('| Etapa | X |\n|---|---|\n| | |\n| Alfa | b |\n| P0 | a |').semId,
    [{ linha: 4, texto: 'Alfa' }]);
});

test('R1 da s45: tabela-resumo dos cabecalhos sem caixa nao conta cada item duas vezes (vale o cabecalho)', () => {
  const plano = '### Item 1 — x [FEITO]\n### Item 2 — y\n\n| Item | Onde |\n|---|---|\n| 1 | a |\n| 2 [FEITO] | b |\n| 3 | c |';
  const itens = planoLib.parseItens(plano);
  assert.deepStrictEqual(itens.map(function (t) { return t.id + (t.tabela ? ' (tabela)' : '') + '=' + t.estado; }),
    ['1=feita', '2=sem marca', '3 (tabela)=sem marca']);
  assert.ok(planoLib.painelTexto({ arquivo: 'p.md' }, itens).indexOf('tarefas: 1 de 3 concluidas') !== -1);
  // o cabecalho guarda o id em minusculas, a tabela como esta escrito: "### Etapa 2A" e "| 2a |" numa tabela
  // "| ETAPAS |" sao o mesmo (o cabecalho so aceita id de numero, RE_ITEM; "### Etapa P1" nao e cabecalho)
  assert.deepStrictEqual(planoLib.parseItens('### Etapa 2A: x\n| ETAPAS | X |\n|---|---|\n| 2a | a |\n| 3 | b |')
    .map(function (t) { return t.id; }), ['2a', '3']);
  // tipo diferente nao e resumo: "Etapa 1" e "Fase 1" seguem os dois
  assert.strictEqual(planoLib.parseItens('### Etapa 1: Mapear\n| Fase | X |\n|---|---|\n| 1 | a |').length, 2);
});
