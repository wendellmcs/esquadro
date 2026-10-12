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
  assert.strictEqual(plano.alegaEtapaConcluida('A etapa está concluída.'), true);
  assert.strictEqual(plano.alegaEtapaConcluida('Segui para o proximo passo.'), false);
});

// Bloco N1/N2 (fase P2, D426). N1: `alegaEtapaConcluida` roda no gancho Stop; com ~50 mil espacos o regex
// antigo levava segundos (backtracking de `\s+\d*\s*` e `\s+(a|o)?\s*`). Limite folgado de proposito.
test('N1: alegaEtapaConcluida e linear - 50 mil espacos/caracteres em todas as formas patologicas', () => {
  const sp = ' '.repeat(50000);
  const formas = {
    'tarefa+sp+x': 'tarefa' + sp + 'x',
    'tarefa+sp+1+sp+x': 'tarefa' + sp + '1' + sp + 'x',
    'tarefa 1+sp+x': 'tarefa 1' + sp + 'x',
    'conclui+sp+x': 'conclui' + sp + 'x',
    'conclui+sp+a+sp+x': 'conclui' + sp + 'a' + sp + 'x',
    'conclui a+sp+x': 'conclui a' + sp + 'x',
    'tarefas+sp+lista': 'tarefas' + sp + '3' + sp + 'e' + sp + '4' + sp + 'x',
    'tabs/quebras/nbsp': 'tarefa' + '\t\n  '.repeat(12500) + 'x',
    'palavra longa': 'fech' + 'a'.repeat(50000) + ' x',
    'digitos': 'tarefa ' + '1'.repeat(50000) + 'x',
    'lista longa': 'tarefa 1' + ' e 1'.repeat(12500) + 'x',
    'nomes repetidos': 'tarefa '.repeat(7000) + 'x',
    'verbo e artigo repetidos': 'conclui a '.repeat(5000) + 'x'
  };
  Object.keys(formas).forEach((nome) => {
    const ini = performance.now();
    plano.alegaEtapaConcluida(formas[nome]);
    const ms = performance.now() - ini;
    assert.ok(ms < 200, 'backtracking em "' + nome + '": ' + ms.toFixed(0) + ' ms');
  });
});

// N2: plural e lista alegam. Nao-alegacao continua nao alegando.
test('N2: plural e lista de etapas ("Tarefas 1 e 2 concluidas") alegam conclusao', () => {
  [
    'Tarefas 1 e 2 concluidas', 'etapas 3, 4 e 5 fechadas', 'concluí as tarefas 1 e 2', 'fases concluídas',
    'As tarefas 1 e 2 estão concluídas', 'As tarefas 1 e 2 foram concluídas', 'Concluí as etapas 1, 2 e 3.',
    'Fechei as ondas.', 'Finalizamos as fases 1 e 2.', 'As etapas estao prontas', 'Tarefas  1\ne 2   completas'
  ].forEach((t) => assert.strictEqual(plano.alegaEtapaConcluida(t), true, t));
});

test('N2: o que nao alega conclusao continua sem alegar (singular e plural)', () => {
  [
    'a tarefa 2 ainda nao foi concluida', 'As tarefas 1 e 2 ainda não foram concluídas', 'A tarefa 2 não está concluída',
    'Tarefas 1 e 2 pendentes', 'Tarefa 2 em andamento', 'Fechei os chamados 1 e 2', 'Segui para o proximo passo.',
    'A tarefa 3 esta pendente.', 'Abri a tarefa 3.', 'O chamado 3 foi fechado.', 'Abri as tarefas 1 e 2.'
  ].forEach((t) => assert.strictEqual(plano.alegaEtapaConcluida(t), false, t));
});

test('plano: motivo cita quantos subitens ficaram abertos', () => {
  const t = plano.parseTarefas(PLANO)[1];
  const m = plano.motivoSubitemAberto(t);
  assert.ok(m.includes('2'));
  assert.ok(m.includes('Tarefa 2'));
  assert.ok(/^[\x20-\x7E\n]+$/.test(m), 'motivo tem de ser ASCII (R5)');
});

// ---- lote 2 (D422): DC-02 e DC-03 ------------------------------------------
const { spawnSync } = require('node:child_process');
const RAIZ_PLUGIN = path.join(__dirname, '..');

test('plano.js --abrir: sem --sessao grava o dono de CLAUDE_CODE_SESSION_ID (DC-03)', () => {
  const dir = tmp({ 'docs/p.md': PLANO });
  try {
    const env = Object.assign({}, process.env, { CLAUDE_CODE_SESSION_ID: 'sessao-real-x' });
    delete env.CLAUDE_SESSION_ID;
    const r = spawnSync(process.execPath, [path.join(RAIZ_PLUGIN, 'scripts', 'plano.js'), '--abrir', 'docs/p.md'],
      { cwd: dir, encoding: 'utf8', env: env });
    assert.strictEqual(r.status, 0, r.stderr);
    const gravado = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'esquadro', 'plano-ativo.json'), 'utf8'));
    assert.strictEqual(gravado.sessionId, 'sessao-real-x', 'gravou o dono errado: ' + JSON.stringify(gravado));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('abertura.js: o aviso de plano alheio cita um caminho REAL, nunca a variavel nao expandida (DC-02)', () => {
  const dir = tmp({ 'docs/p.md': PLANO });
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'plano-ativo.json'),
      JSON.stringify({ arquivo: 'docs/p.md', sessionId: 'dono-outro', tarefa: null }), 'utf8');
    const r = spawnSync(process.execPath, [path.join(RAIZ_PLUGIN, 'scripts', 'abertura.js')], {
      cwd: dir, encoding: 'utf8',
      input: JSON.stringify({ session_id: 'eu-mesmo', cwd: dir, source: 'startup' }),
      env: Object.assign({}, process.env, { ESQUADRO_TMP: path.join(dir, '_sessoes') })
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('proxima-decisao'), 'faltou o comando no aviso: ' + r.stdout);
    assert.ok(!r.stdout.includes('${CLAUDE_PLUGIN_ROOT}'), 'variavel nao expandida na saida do gancho: ' + r.stdout);
    const m = /node "([^"]+plano\.js)"/.exec(r.stdout);
    assert.ok(m, 'sem caminho entre aspas: ' + r.stdout);
    assert.ok(path.isAbsolute(m[1]) && fs.existsSync(m[1]), 'o caminho citado nao existe: ' + m[1]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plano.js --proxima-decisao: arquivo ausente avisa no stderr; pasta sai 1 (D460)', () => {
  const dir = tmp({ 'docs/decisoes.md': '### D41 · a\n' });
  try {
    const cli = (alvo) => spawnSync(process.execPath, [path.join(RAIZ_PLUGIN, 'scripts', 'plano.js'), '--proxima-decisao', alvo],
      { cwd: dir, encoding: 'utf8' });
    const certo = cli('docs/decisoes.md');
    assert.strictEqual(certo.status, 0, certo.stderr);
    assert.strictEqual(certo.stdout, '42\n');
    assert.strictEqual(certo.stderr, '', 'arquivo certo nao avisa');
    const errado = cli('doc/decisoes.md');
    assert.strictEqual(errado.status, 0, errado.stderr);
    assert.strictEqual(errado.stdout, '1\n', 'projeto novo segue comecando em 1');
    assert.match(errado.stderr, /nao existe/);
    assert.ok(errado.stderr.includes(path.join(dir, 'doc', 'decisoes.md')), 'o aviso cita o caminho absoluto: ' + errado.stderr);
    const pasta = cli('docs');
    assert.strictEqual(pasta.status, 1, 'pasta no lugar do arquivo: ' + pasta.stdout);
    assert.strictEqual(pasta.stdout, '');
    assert.match(pasta.stderr, /nao e um arquivo/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
