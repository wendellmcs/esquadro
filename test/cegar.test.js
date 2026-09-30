'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cegar = require('../scripts/lib/cegar.js');

const ITENS = [
  { nome: 'antes', conteudo: 'versao um' },
  { nome: 'depois', conteudo: 'versao dois' }
];

test('cegar: mesma semente da sempre a mesma ordem (reproduzivel)', () => {
  const a = cegar.rotular(ITENS, 'sessao-123');
  const b = cegar.rotular(ITENS, 'sessao-123');
  assert.deepStrictEqual(a.mapa, b.mapa);
});

test('cegar: sementes diferentes trocam a ordem em algum momento', () => {
  const mapas = new Set();
  for (let i = 0; i < 40; i++) mapas.add(JSON.stringify(cegar.rotular(ITENS, 'sessao-' + i).mapa));
  assert.strictEqual(mapas.size, 2, 'as duas ordens tem de aparecer');
});

test('cegar: A e B recebem os dois itens, sem perder nenhum', () => {
  const r = cegar.rotular(ITENS, 'x');
  const conteudos = [r.A.conteudo, r.B.conteudo].sort();
  assert.deepStrictEqual(conteudos, ['versao dois', 'versao um']);
});

test('cegar: o rotulo entregue ao inspetor nao carrega o nome de origem', () => {
  const r = cegar.rotular(ITENS, 'x');
  assert.strictEqual('nome' in r.A, false, 'A nao pode dizer se e antes ou depois');
  assert.strictEqual('nome' in r.B, false);
  assert.ok(r.mapa.A === 'antes' || r.mapa.A === 'depois');
});

test('cegar: semente e estavel e cabe em inteiro', () => {
  assert.strictEqual(cegar.semente('abc'), cegar.semente('abc'));
  assert.notStrictEqual(cegar.semente('abc'), cegar.semente('abd'));
  assert.ok(Number.isInteger(cegar.semente('abc')));
});

test('cegar: proximaRonda comeca em 1 e incrementa', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-ronda-'));
  try {
    assert.strictEqual(cegar.proximaRonda(dir), 1);
    fs.mkdirSync(path.join(dir, '1'));
    assert.strictEqual(cegar.proximaRonda(dir), 2);
    fs.mkdirSync(path.join(dir, '2'));
    assert.strictEqual(cegar.proximaRonda(dir), 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// R-T12-01 (D118). `git show HEAD:<caminho>` resolve pela RAIZ do repositorio, e o
// --arquivo chega relativo ao cwd. Sem descontar o prefixo (D41), rodar de uma
// subpasta NEGA arquivo que esta em HEAD: falso negativo, com mensagem que mente
// o motivo. R3: spawnSync com shell:false, tambem no teste.
const RAIZ = path.join(__dirname, '..');
const CLI = path.join(RAIZ, 'scripts', 'preparar-revisao.js');

function repoDeEnsaio() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-prep-'));
  const g = function (args) {
    return spawnSync('git', args, { cwd: dir, encoding: 'utf8', shell: false });
  };
  g(['init', '-q', '.']);
  g(['config', 'user.email', 'ensaio@ensaio']);
  g(['config', 'user.name', 'ensaio']);
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'raiz.txt'), 'raiz em HEAD\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'sub', 'aninhado.txt'), 'aninhado em HEAD\n', 'utf8');
  g(['add', '-A']);
  g(['commit', '-qm', 'base']);
  fs.writeFileSync(path.join(dir, 'raiz.txt'), 'raiz no trabalho\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'sub', 'aninhado.txt'), 'aninhado no trabalho\n', 'utf8');
  return dir;
}

function rodarCli(cwd, rel) {
  return spawnSync(process.execPath, [CLI, '--arquivo', rel, '--semente', 'fixa'], {
    cwd: cwd, encoding: 'utf8', shell: false
  });
}

test('preparar-revisao: de SUBPASTA, arquivo que esta em HEAD nao pode ser negado (R-T12-01)', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarCli(path.join(dir, 'sub'), 'aninhado.txt');
    assert.strictEqual(r.status, 0,
      'de subpasta o script recusou arquivo que esta em HEAD. Saida: ' + r.stdout);
    const saida = JSON.parse(r.stdout);
    const lados = [fs.readFileSync(saida.a, 'utf8'), fs.readFileSync(saida.b, 'utf8')].sort();
    assert.deepStrictEqual(lados, ['aninhado em HEAD\n', 'aninhado no trabalho\n'],
      'os dois lados tem de ser as duas versoes do arquivo da subpasta');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preparar-revisao: CONTROLE - da raiz continua funcionando (o conserto nao regride)', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, 'da raiz tem de continuar passando. Saida: ' + r.stdout);
    const saida = JSON.parse(r.stdout);
    const lados = [fs.readFileSync(saida.a, 'utf8'), fs.readFileSync(saida.b, 'utf8')].sort();
    assert.deepStrictEqual(lados, ['raiz em HEAD\n', 'raiz no trabalho\n']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// D244/defeito 10 (D242 secao 3.10): este teste era um CONTROLE que prendia a recusa do arquivo
// novo - e foi por ela que o CSS novo da onda 7 ficou sem inspecao. Agora o lado antigo e vazio,
// o pacote diz que e novo, e a cegueira que nao existe e declarada.
test('D244/defeito 10: arquivo ausente de HEAD vira pacote com o lado antigo vazio e marcado novo', () => {
  const dir = repoDeEnsaio();
  try {
    fs.writeFileSync(path.join(dir, 'sub', 'novo.txt'), 'so no disco\n', 'utf8');
    const r = rodarCli(path.join(dir, 'sub'), 'novo.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const saida = JSON.parse(r.stdout);
    const lados = [fs.readFileSync(saida.a, 'utf8'), fs.readFileSync(saida.b, 'utf8')].sort();
    assert.deepStrictEqual(lados, ['', 'so no disco\n']);
    const mapa = JSON.parse(fs.readFileSync(path.join(path.dirname(saida.a), 'mapa.json'), 'utf8'));
    assert.strictEqual(mapa.novo, true);
    assert.match(saida.aviso, /arquivo novo/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// D244/defeito 9 (D242 secao 3.9): a regua do regras.md nao chegava ao inspetor.
function comRegras(dir, texto) {
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'), '{"versaoConfig":1}', 'utf8');
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), texto, 'utf8');
}

test('D244/defeito 9: a secao da regua do regras.md vai para o pacote, inteira e so ela', () => {
  const dir = repoDeEnsaio();
  try {
    comRegras(dir, '# Regras deste projeto\n- regra 1\n\n## Régua do projeto - fatias\n\n### cores\n' +
      '| token | hex |\n| --primary | #0055ff |\n\n## Outra secao\n- nao vai\n');
    const r = rodarCli(path.join(dir, 'sub'), 'aninhado.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const saida = JSON.parse(r.stdout);
    assert.ok(saida.regua, 'a saida tem de dar o caminho da regua: ' + r.stdout);
    const regua = fs.readFileSync(saida.regua, 'utf8');
    assert.match(regua, /#0055ff/);
    assert.doesNotMatch(regua, /nao vai/);
    assert.doesNotMatch(regua, /regra 1/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('D244/defeito 9: sem secao de regua, nada de regua.md, e a saida diz', () => {
  const dir = repoDeEnsaio();
  try {
    comRegras(dir, '# Regras deste projeto\n- regra 1\n');
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const saida = JSON.parse(r.stdout);
    assert.strictEqual(saida.regua, null);
    assert.match(saida.semRegua, /nenhuma/);
    assert.strictEqual(fs.existsSync(path.join(path.dirname(saida.a), 'regua.md')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('D244/defeito 9: a skill revisar e o inspetor mandam ler a regua', () => {
  const skill = fs.readFileSync(path.join(RAIZ, 'skills', 'revisar', 'SKILL.md'), 'utf8');
  const inspetor = fs.readFileSync(path.join(RAIZ, 'agents', 'inspetor.md'), 'utf8');
  assert.match(skill, /regua\.md/);
  assert.match(inspetor, /regua\.md/);
});

test('D244/defeito 10: a skill revisar manda declarar o que nao foi inspecionado', () => {
  const skill = fs.readFileSync(path.join(RAIZ, 'skills', 'revisar', 'SKILL.md'), 'utf8');
  assert.match(skill, /n[aã]o foi inspecionado/i);
});

// Ronda 1 do 8c.5: o --arquivo aceitava '..' e caminho absoluto. O de fora era lido e
// recebia o motivo errado ("nao existe em HEAD"); o absoluto estourava com stack trace.
// Medido antes: '..' de subpasta ja dava "nao existe em HEAD" - a guarda nao tira uso.
test('preparar-revisao: caminho que sai da pasta atual e recusado com o motivo certo', () => {
  const dir = repoDeEnsaio();
  try {
    for (const rel of ['../raiz.txt', path.join(dir, 'raiz.txt')]) {
      const r = rodarCli(path.join(dir, 'sub'), rel);
      assert.strictEqual(r.status, 1, rel + ': ' + r.stdout + r.stderr);
      assert.strictEqual(r.stderr, '', rel + ': sem stack trace: ' + r.stderr);
      assert.match(r.stdout, /fica fora da pasta atual/, rel + ': ' + r.stdout);
      assert.doesNotMatch(r.stdout, /nao existe em HEAD/, rel + ': o motivo e outro');
    }
    assert.strictEqual(fs.existsSync(path.join(dir, 'sub', '.claude')), false, 'recusado nao grava nada');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preparar-revisao: arquivo que nao existe no disco diz qual, sem stack trace', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarCli(dir, 'sumiu.txt');
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.strictEqual(r.stderr, '', 'sem stack trace: ' + r.stderr);
    assert.match(r.stdout, /sumiu\.txt nao existe no disco/, r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// T2 / item 11 da D257 (secao 11): uma base por arquivo. Antes, tres arquivos preparados na mesma
// pasta viravam "rondas 1, 2, 3" de uma revisao so.
function baseDeRevisao(dir) { return path.join(dir, '.claude', 'esquadro', 'revisao'); }

test('cegar: idDoArquivo troca a barra por duplo underscore e o resto fora de [a-zA-Z0-9._-] por underscore', () => {
  assert.strictEqual(cegar.idDoArquivo('scripts/lib/escopo.js'), 'scripts__lib__escopo.js');
  assert.strictEqual(cegar.idDoArquivo('raiz.txt'), 'raiz.txt');
  assert.strictEqual(cegar.idDoArquivo('a b/cç.js'), 'a_b__c_.js');
});

// Arquivo de nome so com digitos (`2026`, sem extensao) daria a base `revisao/2026`, igual a uma
// ronda solta do formato da 0.3.0: a proxima preparacao cairia na base unica.
test('cegar: idDoArquivo nunca e so digitos, para nao se passar por ronda solta', () => {
  assert.strictEqual(/^\d+$/.test(cegar.idDoArquivo('2026')), false, cegar.idDoArquivo('2026'));
  assert.strictEqual(cegar.idDoArquivo('2026'), '_2026');
  assert.strictEqual(cegar.idDoArquivo('dir/2026'), 'dir__2026');
});

test('cegar: baseDoArquivo e revisao/<id>', () => {
  const rev = path.join('x', 'revisao');
  assert.strictEqual(cegar.baseDoArquivo(rev, 'sub/a.txt'), path.join(rev, 'sub__a.txt'));
});

test('cegar: temPastaNumeradaSolta so olha pasta numerada direto em revisao/', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-solta-'));
  try {
    assert.strictEqual(cegar.temPastaNumeradaSolta(path.join(dir, 'nao-existe')), false);
    assert.strictEqual(cegar.temPastaNumeradaSolta(dir), false);
    fs.mkdirSync(path.join(dir, 'sub__a.txt', '1'), { recursive: true });
    fs.writeFileSync(path.join(dir, '7'), 'arquivo, nao pasta', 'utf8');
    assert.strictEqual(cegar.temPastaNumeradaSolta(dir), false, 'a numerada esta DENTRO da base, e 7 e arquivo');
    fs.mkdirSync(path.join(dir, '1'));
    assert.strictEqual(cegar.temPastaNumeradaSolta(dir), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T2/item 11: dois arquivos preparados na mesma pasta vao para bases separadas, cada um na ronda 1', () => {
  const dir = repoDeEnsaio();
  try {
    const r1 = rodarCli(dir, 'raiz.txt');
    const r2 = rodarCli(dir, 'sub/aninhado.txt');
    assert.strictEqual(r1.status, 0, r1.stdout + r1.stderr);
    assert.strictEqual(r2.status, 0, r2.stdout + r2.stderr);
    const s1 = JSON.parse(r1.stdout);
    const s2 = JSON.parse(r2.stdout);
    assert.strictEqual(s1.ronda, 1);
    assert.strictEqual(s2.ronda, 1, 'o segundo arquivo tem a propria contagem de rondas');
    assert.strictEqual(path.basename(s1.base), 'raiz.txt');
    assert.strictEqual(path.basename(s2.base), 'sub__aninhado.txt');
    assert.strictEqual(path.basename(path.dirname(s1.base)), 'revisao');
    assert.strictEqual(path.dirname(s1.a), path.join(s1.base, '1'));
    assert.strictEqual(path.dirname(s2.b), path.join(s2.base, '1'));
    assert.strictEqual(s2.vereditos, path.join(s2.base, '1', 'vereditos'));
    assert.deepStrictEqual(fs.readdirSync(baseDeRevisao(dir)).sort(), ['raiz.txt', 'sub__aninhado.txt'],
      'nenhuma pasta numerada solta em revisao/');
    assert.doesNotMatch(s1.aviso, /formato antigo/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T2/item 11: o mesmo arquivo preparado de novo e a ronda 2 da base dele', () => {
  const dir = repoDeEnsaio();
  try {
    const s1 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    const s2 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    assert.strictEqual(s1.ronda, 1);
    assert.strictEqual(s2.ronda, 2);
    assert.strictEqual(s2.base, s1.base);
    assert.strictEqual(path.basename(path.dirname(s2.a)), '2');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T2/item 11: com pasta numerada solta (formato da 0.3.0) segue gravando la, e avisa', () => {
  const dir = repoDeEnsaio();
  try {
    fs.mkdirSync(path.join(baseDeRevisao(dir), '1'), { recursive: true });
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout);
    assert.strictEqual(s.ronda, 2, 'continua a contagem da pasta plana');
    assert.strictEqual(s.base, baseDeRevisao(dir));
    assert.strictEqual(path.dirname(s.a), path.join(baseDeRevisao(dir), '2'));
    assert.match(s.aviso, /formato antigo/);
    assert.strictEqual(fs.existsSync(path.join(baseDeRevisao(dir), 'raiz.txt')), false, 'nao abre base nova no meio da revisao');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.2 (frente esquadro-p2-d258), T2, itens 8 a 11 do preparar-revisao.js.
// Para forcar o que o disco e o git de um teste nao dao (git que estoura o tempo, escrita que falha
// no meio do pacote), o teste roda o script com `node --require <gancho>`: o gancho troca UMA funcao
// antes do script carregar. O script em si nao ganha porta nenhuma para isso.
const GANCHO_GIT_SHOW_ESTOURA = [
  "const cp = require('node:child_process');",
  "const orig = cp.spawnSync;",
  "cp.spawnSync = function (cmd, args) {",
  "  if (cmd === 'git' && args && args[0] === 'show') {",
  "    return { error: Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null, stdout: null, stderr: '' };",
  "  }",
  "  return orig.apply(this, arguments);",
  "};"
].join('\n');

const GANCHO_GIT_SHOW_FORA_DO_HEAD = [
  "const cp = require('node:child_process');",
  "const orig = cp.spawnSync;",
  "cp.spawnSync = function (cmd, args) {",
  "  if (cmd === 'git' && args && args[0] === 'show') {",
  "    return { status: 128, stdout: '', stderr: 'fatal: path does not exist in HEAD' };",
  "  }",
  // 0.3.3, item 9: fora do HEAD agora se confirma pelo ls-tree (vazio = arquivo novo).
  "  if (cmd === 'git' && args && args[0] === 'ls-tree') {",
  "    return { status: 0, stdout: '', stderr: '' };",
  "  }",
  "  return orig.apply(this, arguments);",
  "};"
].join('\n');

const GANCHO_ESCRITA_DO_B_FALHA = [
  "const fs = require('node:fs');",
  "const orig = fs.writeFileSync;",
  "fs.writeFileSync = function (p) {",
  "  if (String(p).endsWith('B.txt')) {",
  "    throw Object.assign(new Error(\"EACCES: permission denied, open '\" + p + \"'\"), { code: 'EACCES' });",
  "  }",
  "  return orig.apply(this, arguments);",
  "};"
].join('\n');

function rodarComGancho(cwd, rel, ganchoSrc) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-gancho-'));
  try {
    const gancho = path.join(pasta, 'gancho.js');
    fs.writeFileSync(gancho, ganchoSrc, 'utf8');
    return spawnSync(process.execPath, ['--require', gancho, CLI, '--arquivo', rel, '--semente', 'fixa'], {
      cwd: cwd, encoding: 'utf8', shell: false
    });
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
}

test('0.3.2/item 8: git que falha em ler o HEAD (timeout, spawn) e ERRO e nao grava; fora do HEAD segue sendo arquivo novo', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarComGancho(dir, 'raiz.txt', GANCHO_GIT_SHOW_ESTOURA);
    assert.strictEqual(r.status, 1, 'o timeout do git virou arquivo novo em silencio. Saida: ' + r.stdout + r.stderr);
    assert.strictEqual(r.stderr, '', 'sem stack trace: ' + r.stderr);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /raiz\.txt/, 'a mensagem cita o arquivo: ' + r.stdout);
    assert.match(r.stdout, /ETIMEDOUT/, 'a mensagem traz a causa: ' + r.stdout);
    assert.match(r.stdout, /rode de novo/i, 'a mensagem diz o proximo passo: ' + r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'com erro nao se grava pacote nenhum');
    // Controle: status diferente de zero do git (nao esta em HEAD) continua sendo arquivo novo.
    const c = rodarComGancho(dir, 'raiz.txt', GANCHO_GIT_SHOW_FORA_DO_HEAD);
    assert.strictEqual(c.status, 0, c.stdout + c.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(path.dirname(JSON.parse(c.stdout).a), 'mapa.json'), 'utf8')).novo, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.2/item 9: --arquivo que e uma pasta (a leitura falha) vira ERRO com o caminho, sem stack trace', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarCli(dir, 'sub');
    assert.strictEqual(r.stderr, '', 'stack trace na saida de erro: ' + r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: .*sub/, r.stdout);
    assert.match(r.stdout, /EISDIR/, 'a causa vem na mensagem: ' + r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'nada gravado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.2/item 9: pasta das revisoes que e um arquivo (o mkdir falha) vira ERRO com o caminho e diz que nada foi gravado', () => {
  const dir = repoDeEnsaio();
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(baseDeRevisao(dir), 'sou um arquivo, nao a pasta', 'utf8');
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.stderr, '', 'stack trace na saida de erro: ' + r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.ok(r.stdout.indexOf('.claude/esquadro/revisao') !== -1, 'cita o caminho: ' + r.stdout);
    assert.match(r.stdout, /Nada foi gravado/, r.stdout);
    assert.doesNotMatch(r.stdout, /pela metade/, 'nada ficou pela metade: ' + r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.2/item 9: gravacao que falha depois de criar a pasta da ronda diz qual pasta ficou pela metade e manda apagar', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarComGancho(dir, 'raiz.txt', GANCHO_ESCRITA_DO_B_FALHA);
    assert.strictEqual(r.stderr, '', 'stack trace na saida de erro: ' + r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /EACCES/, 'a causa vem na mensagem: ' + r.stdout);
    assert.match(r.stdout, /pela metade/, r.stdout);
    assert.match(r.stdout, /apague/i, r.stdout);
    const pasta = path.join(baseDeRevisao(dir), 'raiz.txt', '1');
    assert.ok(fs.existsSync(pasta), 'a pasta da ronda ficou no disco (o que a mensagem tem de apontar)');
    assert.ok(r.stdout.indexOf('.claude/esquadro/revisao/raiz.txt/1') !== -1, 'a mensagem aponta a pasta certa: ' + r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.2/item 10: flag sem valor, ou seguida de outra flag, e ERRO de uso que nomeia a flag', () => {
  const dir = repoDeEnsaio();
  try {
    const casos = [
      { args: ['--arquivo', '--semente', 'x'], flag: '--arquivo' },
      { args: ['--arquivo'], flag: '--arquivo' },
      { args: ['--arquivo', 'raiz.txt', '--semente'], flag: '--semente' },
      { args: ['--semente', '--arquivo', 'raiz.txt'], flag: '--semente' }
    ];
    for (const c of casos) {
      const r = spawnSync(process.execPath, [CLI].concat(c.args), { cwd: dir, encoding: 'utf8', shell: false });
      const quem = c.args.join(' ');
      assert.strictEqual(r.status, 1, quem + ' => ' + r.stdout + r.stderr);
      assert.strictEqual(r.stderr, '', quem + ': sem stack trace: ' + r.stderr);
      assert.match(r.stdout, /^ERRO: /, quem + ' => ' + r.stdout);
      assert.ok(r.stdout.indexOf(c.flag + ' pede um valor') !== -1, quem + ' => nomeia a flag: ' + r.stdout);
      assert.match(r.stdout, /uso: preparar-revisao\.js --arquivo/, quem + ' => traz a linha de uso: ' + r.stdout);
      assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, quem + ' => nada gravado');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.2/item 11: o aviso do formato antigo diz para onde mover, com o id do arquivo daquela revisao', () => {
  const dir = repoDeEnsaio();
  try {
    // A revisao antiga era de OUTRO arquivo (nome com espaco, para o id passar por idDoArquivo).
    const antiga = path.join(baseDeRevisao(dir), '1');
    fs.mkdirSync(antiga, { recursive: true });
    fs.writeFileSync(path.join(antiga, 'mapa.json'),
      JSON.stringify({ arquivo: 'a b/c.js', mapa: { A: 'HEAD', B: 'trabalho' } }), 'utf8');
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout);
    assert.ok(s.aviso.indexOf('.claude/esquadro/revisao/a_b__c.js/') !== -1,
      'o aviso tem de dizer o destino com o id da revisao antiga: ' + s.aviso);
    assert.strictEqual(s.aviso.indexOf('revisao/raiz.txt/'), -1, 'o id e o da revisao antiga, nao o do arquivo de agora: ' + s.aviso);
    assert.doesNotMatch(s.aviso, /base unica|base por arquivo/, s.aviso);
    // Sem mapa legivel na ultima pasta solta: o aviso diz a regra do id.
    const dir2 = repoDeEnsaio();
    try {
      fs.mkdirSync(path.join(baseDeRevisao(dir2), '1'), { recursive: true });
      fs.writeFileSync(path.join(baseDeRevisao(dir2), '1', 'mapa.json'), '{ quebrado', 'utf8');
      const r2 = rodarCli(dir2, 'raiz.txt');
      assert.strictEqual(r2.status, 0, r2.stdout + r2.stderr);
      const s2 = JSON.parse(r2.stdout);
      assert.ok(s2.aviso.indexOf('.claude/esquadro/revisao/<id>/') !== -1, 'destino com <id>: ' + s2.aviso);
      assert.ok(s2.aviso.indexOf('__') !== -1, 'diz a regra do id (barra vira __): ' + s2.aviso);
      assert.doesNotMatch(s2.aviso, /base unica|base por arquivo/, s2.aviso);
    } finally { fs.rmSync(dir2, { recursive: true, force: true }); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3 (frente esquadro-033), T2, itens 2 e 9 a 18 do preparar-revisao.js.
// O gancho generico troca a resposta do git por subcomando ('show', 'ls-tree', 'rev-parse-verify'; o
// `rev-parse --show-prefix` do git.js segue real). Com `logPath`, cada chamada do git ao subcomando trocado
// ou nao e anotada, para provar quantos processos o caminho feliz gasta.
function ganchoGit(resp, logPath) {
  return [
    "const cp = require('node:child_process');",
    "const fs = require('node:fs');",
    "const orig = cp.spawnSync;",
    "const R = " + JSON.stringify(resp) + ";",
    "const LOG = " + JSON.stringify(logPath || null) + ";",
    "cp.spawnSync = function (cmd, args) {",
    "  if (cmd === 'git' && args) {",
    "    const chave = args[0] === 'rev-parse' && args.indexOf('--verify') !== -1 ? 'rev-parse-verify' : args[0];",
    "    if (LOG) fs.appendFileSync(LOG, chave + '\\n');",
    "    const x = R[chave];",
    "    if (x) {",
    "      const r = { status: x.status === undefined ? null : x.status, signal: x.signal || null, stdout: x.stdout || '', stderr: x.stderr || '' };",
    "      if (x.errorCode) r.error = Object.assign(new Error('spawnSync git ' + x.errorCode), { code: x.errorCode });",
    "      return r;",
    "    }",
    "  }",
    "  return orig.apply(this, arguments);",
    "};"
  ].join('\n');
}

const GANCHO_HORA_FIXA = [
  "const Real = Date;",
  "const FIXA = new Real(2026, 8, 29, 17, 30, 45).getTime();",
  "global.Date = class extends Real {",
  "  constructor(...a) { if (a.length) super(...a); else super(FIXA); }",
  "  static now() { return FIXA; }",
  "};"
].join('\n');

const GANCHO_RENAME_FALHA = [
  "const fs = require('node:fs');",
  "fs.renameSync = function () {",
  "  throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });",
  "};"
].join('\n');

const GANCHO_ESCRITA_DA_REGUA_FALHA = [
  "const fs = require('node:fs');",
  "const orig = fs.writeFileSync;",
  "fs.writeFileSync = function (p) {",
  "  if (String(p).endsWith('regua.md')) {",
  "    throw Object.assign(new Error(\"EACCES: permission denied, open '\" + p + \"'\"), { code: 'EACCES' });",
  "  }",
  "  return orig.apply(this, arguments);",
  "};"
].join('\n');

function repoSemCommit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-prep-'));
  spawnSync('git', ['init', '-q', '.'], { cwd: dir, encoding: 'utf8', shell: false });
  fs.writeFileSync(path.join(dir, 'raiz.txt'), 'raiz sem commit\n', 'utf8');
  return dir;
}

// Foto de uma pasta: caminho relativo (barra normal) -> conteudo. Compara o que foi movido com o de antes.
function fotoDaPasta(raiz) {
  const foto = {};
  (function andar(p) {
    fs.readdirSync(p, { withFileTypes: true }).forEach(function (e) {
      const c = path.join(p, e.name);
      if (e.isDirectory()) { foto[path.relative(raiz, c).replace(/\\/g, '/') + '/'] = null; andar(c); }
      else foto[path.relative(raiz, c).replace(/\\/g, '/')] = fs.readFileSync(c, 'utf8');
    });
  })(raiz);
  return foto;
}

// Fecha a base de um arquivo como o apurar-ronda.js faz: fechada.json na base, e mais um pouco de
// material (refutados, veredito) para provar que a base inteira se move.
function fecharBase(saida) {
  fs.writeFileSync(path.join(saida.base, 'fechada.json'), '{"ronda":' + saida.ronda + ',"sessao":"s1"}', 'utf8');
  fs.writeFileSync(path.join(saida.base, 'refutados.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(path.dirname(saida.a), 'vereditos', 'design.json'), '{"lente":"design"}', 'utf8');
}

test('0.3.3/item 2: base ja fechada e arquivada INTEIRA pelo preparar, e a revisao nova comeca na ronda 1', () => {
  const dir = repoDeEnsaio();
  try {
    const s1 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    fecharBase(s1);
    const antes = fotoDaPasta(s1.base);
    const r = rodarComGancho(dir, 'raiz.txt', GANCHO_HORA_FIXA);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(r.stderr, '', r.stderr);
    const s2 = JSON.parse(r.stdout);
    assert.strictEqual(s2.ronda, 1, 'a revisao nova nao herda a contagem nem o teto da fechada');
    const destino = path.join(dir, '.claude', 'esquadro', 'revisao-fechada', 'raiz.txt', '2026-09-29-173045');
    assert.strictEqual(s2.arquivada, destino, 'a saida diz para onde foi (data e hora locais no carimbo): ' + r.stdout);
    assert.deepStrictEqual(fotoDaPasta(destino), antes, 'nada se apaga: a base inteira, igual a de antes');
    assert.deepStrictEqual(fs.readdirSync(s2.base), ['1'], 'a base nova so tem a ronda 1');
    assert.match(s2.aviso, /revisao-fechada\/raiz\.txt\/2026-09-29-173045/, s2.aviso);
    assert.ok(fs.existsSync(s2.a) && fs.existsSync(s2.b), 'a ronda 1 nova foi gravada');
    // A pasta de arquivo mora FORA de revisao/: senao o escolherBase do apurar-ronda a veria como outra revisao.
    assert.deepStrictEqual(fs.readdirSync(baseDeRevisao(dir)), ['raiz.txt']);
    assert.strictEqual(path.basename(path.dirname(path.dirname(destino))), 'revisao-fechada');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 2: duas revisoes fechadas no mesmo segundo nao colidem (sufixo no carimbo)', () => {
  const dir = repoDeEnsaio();
  try {
    const s1 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    fecharBase(s1);
    const s2 = JSON.parse(rodarComGancho(dir, 'raiz.txt', GANCHO_HORA_FIXA).stdout);
    fecharBase(s2);
    const r3 = rodarComGancho(dir, 'raiz.txt', GANCHO_HORA_FIXA);
    assert.strictEqual(r3.status, 0, r3.stdout + r3.stderr);
    const s3 = JSON.parse(r3.stdout);
    const pai = path.join(dir, '.claude', 'esquadro', 'revisao-fechada', 'raiz.txt');
    assert.strictEqual(s2.arquivada, path.join(pai, '2026-09-29-173045'));
    assert.strictEqual(s3.arquivada, path.join(pai, '2026-09-29-173045-2'), 'o segundo do mesmo segundo ganha sufixo');
    assert.deepStrictEqual(fs.readdirSync(pai).sort(), ['2026-09-29-173045', '2026-09-29-173045-2'],
      'a primeira arquivada segue la, intacta');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 2: falha ao mover a base fechada e ERRO, e a base fica como estava (nada gravado)', () => {
  const dir = repoDeEnsaio();
  try {
    const s1 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    fecharBase(s1);
    const antes = fotoDaPasta(s1.base);
    const r = rodarComGancho(dir, 'raiz.txt', GANCHO_RENAME_FALHA);
    assert.strictEqual(r.stderr, '', 'stack trace na saida de erro: ' + r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /EPERM/, 'a causa vem na mensagem: ' + r.stdout);
    assert.ok(r.stdout.indexOf('.claude/esquadro/revisao/raiz.txt') !== -1, 'cita a base: ' + r.stdout);
    assert.match(r.stdout, /Nada foi gravado/, r.stdout);
    assert.deepStrictEqual(fotoDaPasta(s1.base), antes, 'a base fechada segue intacta, sem ronda nova');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 2: base sem fechada.json (revisao em andamento) segue como antes, ronda n+1, sem arquivar', () => {
  const dir = repoDeEnsaio();
  try {
    const s1 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    const s2 = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    assert.strictEqual(s1.ronda, 1);
    assert.strictEqual(s2.ronda, 2);
    assert.strictEqual('arquivada' in s2, false, 'sem fechada.json nao ha o que arquivar');
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude', 'esquadro', 'revisao-fechada')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 2: a skill revisar diz o que acontece com a revisao ja fechada', () => {
  const skill = fs.readFileSync(path.join(RAIZ, 'skills', 'revisar', 'SKILL.md'), 'utf8');
  assert.match(skill, /revisao-fechada/, 'a skill tem de citar a pasta de arquivo');
  assert.doesNotMatch(skill, /Ronda nova depois do fecho/, 'a frase antiga descrevia o defeito');
});

// 0.3.3, item 9: o status do `git show` sozinho nao separa "arquivo novo" de "objeto que nao se le"
// (medido: fora do HEAD = 128, e em repositorio sem commit tambem 128).
test('0.3.3/item 9: git show morto por sinal (status null, sem error) e ERRO, nao arquivo novo', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarComGancho(dir, 'raiz.txt', ganchoGit({ show: { signal: 'SIGKILL' } }));
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, 'o processo morto por sinal virou arquivo novo em silencio. Saida: ' + r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /SIGKILL/, 'a causa vem na mensagem: ' + r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'com erro nao se grava pacote nenhum');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 9: show falha mas o ls-tree LISTA o arquivo no HEAD (objeto que nao se le) e ERRO', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarComGancho(dir, 'raiz.txt',
      ganchoGit({ show: { status: 128, stderr: 'fatal: bad object' } }));
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, 'objeto corrompido virou arquivo novo em silencio. Saida: ' + r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /raiz\.txt/, r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'nada gravado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 9: o ls-tree resolve pela RAIZ do repositorio (--full-tree): de subpasta, o objeto ilegivel segue sendo erro', () => {
  const dir = repoDeEnsaio();
  try {
    // So o `show` e trocado (128); o ls-tree e o real. Sem --full-tree ele resolveria "sub/aninhado.txt" a
    // partir da subpasta (sub/sub/aninhado.txt), nao acharia nada e daria "novo" falso.
    const r = rodarComGancho(path.join(dir, 'sub'), 'aninhado.txt', ganchoGit({ show: { status: 128 } }));
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, 'de subpasta o arquivo em HEAD virou novo. Saida: ' + r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, 'sub', '.claude')), false, 'nada gravado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 9: show, ls-tree e rev-parse todos falham (nao se sabe se o HEAD existe) e ERRO', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarComGancho(dir, 'raiz.txt', ganchoGit({
      show: { status: 128 }, 'ls-tree': { status: 128 }, 'rev-parse-verify': { status: 128 }
    }));
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, 'sem saber se ha HEAD virou arquivo novo. Saida: ' + r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'nada gravado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 9: repositorio SEM commit segue sendo tudo arquivo novo (rev-parse --verify = 1)', () => {
  const dir = repoSemCommit();
  try {
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(path.dirname(s.a), 'mapa.json'), 'utf8')).novo, true);
    assert.deepStrictEqual([fs.readFileSync(s.a, 'utf8'), fs.readFileSync(s.b, 'utf8')].sort(), ['', 'raiz sem commit\n']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 9: o caminho feliz gasta um processo so (show); o ls-tree e o rev-parse so entram na falha', () => {
  const dir = repoDeEnsaio();
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-log-'));
  try {
    const log = path.join(pasta, 'git.log');
    const r = rodarComGancho(dir, 'raiz.txt', ganchoGit({}, log));
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const chamadas = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert.strictEqual(chamadas.filter(function (c) { return c === 'show'; }).length, 1, chamadas.join(','));
    assert.strictEqual(chamadas.indexOf('ls-tree'), -1, 'o ls-tree nao roda quando o show leu: ' + chamadas.join(','));
    assert.strictEqual(chamadas.indexOf('rev-parse-verify'), -1, chamadas.join(','));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

// 0.3.3, item 10: SO TESTE. O caso `revisao` que e arquivo ja tem teste (0.3.2/item 9); este e o da BASE
// (revisao/<id>) que e arquivo. A inferencia de que sairia stack trace e falsa (medido).
test('0.3.3/item 10: base da revisao (revisao/<id>) que e um arquivo vira ERRO sem stack trace e sem gravar', () => {
  const dir = repoDeEnsaio();
  try {
    fs.mkdirSync(baseDeRevisao(dir), { recursive: true });
    fs.writeFileSync(path.join(baseDeRevisao(dir), 'raiz.txt'), 'sou um arquivo, nao a base', 'utf8');
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.stderr, '', 'stack trace na saida de erro: ' + r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.ok(r.stdout.indexOf('.claude/esquadro/revisao/raiz.txt') !== -1, 'cita o caminho: ' + r.stdout);
    assert.match(r.stdout, /Nada foi gravado/, r.stdout);
    assert.doesNotMatch(r.stdout, /pela metade/, r.stdout);
    assert.deepStrictEqual(fs.readdirSync(baseDeRevisao(dir)), ['raiz.txt'], 'nada novo em revisao/');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3, item 11: a regua e parte do pacote.
test('0.3.3/item 11: regras.md que nao se le (e uma pasta) e ERRO e nao grava nada', () => {
  const dir = repoDeEnsaio();
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'), '{"versaoConfig":1}', 'utf8');
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, 'regras.md ilegivel virou "sem regua" em silencio. Saida: ' + r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /regras\.md/, r.stdout);
    assert.match(r.stdout, /EISDIR/, 'a causa vem na mensagem: ' + r.stdout);
    assert.match(r.stdout, /Nada foi gravado/, r.stdout);
    assert.strictEqual(fs.existsSync(baseDeRevisao(dir)), false, 'nenhuma pasta de revisao criada');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 11: falha ao gravar o regua.md e "ficou pela metade", nao "nenhuma regua declarada"', () => {
  const dir = repoDeEnsaio();
  try {
    comRegras(dir, '# Regras\n\n## Regua do projeto\n- #0055ff\n');
    const r = rodarComGancho(dir, 'raiz.txt', GANCHO_ESCRITA_DA_REGUA_FALHA);
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, 'a falha na gravacao da regua virou "sem regua". Saida: ' + r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /EACCES/, r.stdout);
    assert.match(r.stdout, /pela metade/, r.stdout);
    assert.ok(r.stdout.indexOf('.claude/esquadro/revisao/raiz.txt/1') !== -1, 'aponta a pasta certa: ' + r.stdout);
    assert.doesNotMatch(r.stdout, /nenhuma regua declarada/, r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 11: sem regras.md (ENOENT) segue como antes: pacote gravado e semRegua na saida', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout);
    assert.strictEqual(s.regua, null);
    assert.match(s.semRegua, /nenhuma regua/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3, item 12: `git show` de arquivo grande estourava o maxBuffer padrao (1 MiB) e a mensagem mandava
// rodar de novo, o que nunca resolve.
test('0.3.3/item 12: arquivo de 2 MiB no HEAD, modificado, e preparado (maxBuffer explicito)', () => {
  const dir = repoDeEnsaio();
  try {
    const g = function (args) { return spawnSync('git', args, { cwd: dir, encoding: 'utf8', shell: false }); };
    fs.writeFileSync(path.join(dir, 'grande.txt'), 'linha grande em HEAD\n'.repeat(100000), 'utf8');
    g(['add', 'grande.txt']);
    g(['commit', '-qm', 'grande']);
    fs.appendFileSync(path.join(dir, 'grande.txt'), 'e mais uma no trabalho\n', 'utf8');
    assert.ok(fs.statSync(path.join(dir, 'grande.txt')).size > 2 * 1024 * 1024, 'a fixture tem mais de 2 MiB');
    const r = rodarCli(dir, 'grande.txt');
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 0, 'o git show estourou o buffer. Saida: ' + r.stdout);
    const s = JSON.parse(r.stdout);
    assert.ok(fs.readFileSync(s.a, 'utf8').length > 2000000 && fs.readFileSync(s.b, 'utf8').length > 2000000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 12: ENOBUFS tem mensagem propria (passou do limite) e nao manda rodar de novo', () => {
  const dir = repoDeEnsaio();
  try {
    const r = rodarComGancho(dir, 'raiz.txt', ganchoGit({ show: { errorCode: 'ENOBUFS' } }));
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: /, r.stdout);
    assert.match(r.stdout, /raiz\.txt/, r.stdout);
    assert.match(r.stdout, /limite/, 'diz que passou do limite: ' + r.stdout);
    assert.doesNotMatch(r.stdout, /rode de novo/i, 'rodar de novo nao resolve: ' + r.stdout);
    assert.match(r.stdout, /Nada foi gravado/, r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'nada gravado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3, itens 13 e 14: o valor da flag.
test('0.3.3/item 13: --arquivo aceita nome de arquivo que comeca com "--" (so outra flag do uso e recusada)', () => {
  const dir = repoDeEnsaio();
  try {
    fs.writeFileSync(path.join(dir, '--x.js'), 'arquivo com nome de flag\n', 'utf8');
    const r = rodarCli(dir, '--x.js');
    assert.strictEqual(r.status, 0, 'o valor "--x.js" foi recusado. Saida: ' + r.stdout + r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).arquivo, '--x.js');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 14: valor vazio (--semente "" ou --arquivo "") e valor que falta: ERRO que nomeia a flag', () => {
  const dir = repoDeEnsaio();
  try {
    const casos = [
      { args: ['--arquivo', 'raiz.txt', '--semente', ''], flag: '--semente' },
      { args: ['--arquivo', ''], flag: '--arquivo' }
    ];
    for (const c of casos) {
      const r = spawnSync(process.execPath, [CLI].concat(c.args), { cwd: dir, encoding: 'utf8', shell: false });
      const quem = JSON.stringify(c.args);
      assert.strictEqual(r.status, 1, quem + ' => ' + r.stdout + r.stderr);
      assert.strictEqual(r.stderr, '', quem + ': sem stack trace: ' + r.stderr);
      assert.match(r.stdout, /^ERRO: /, quem + ' => ' + r.stdout);
      assert.ok(r.stdout.indexOf(c.flag + ' pede um valor') !== -1, quem + ' => nomeia a flag: ' + r.stdout);
      assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, quem + ' => nada gravado');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3, item 15: o id da revisao antiga nao depende so da pasta n-1.
test('0.3.3/item 15: o id da revisao antiga vem da ultima pasta numerada com mapa legivel, nao so da n-1', () => {
  const dir = repoDeEnsaio();
  try {
    const rev = baseDeRevisao(dir);
    fs.mkdirSync(path.join(rev, '1'), { recursive: true });
    fs.writeFileSync(path.join(rev, '1', 'mapa.json'),
      JSON.stringify({ arquivo: 'a b/c.js', mapa: { A: 'HEAD', B: 'trabalho' } }), 'utf8');
    fs.mkdirSync(path.join(rev, '2'), { recursive: true });
    fs.writeFileSync(path.join(rev, '2', 'mapa.json'), '{ quebrado', 'utf8');
    fs.mkdirSync(path.join(rev, '3'), { recursive: true }); // sem mapa.json nenhum
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout);
    assert.strictEqual(s.ronda, 4);
    assert.ok(s.aviso.indexOf('.claude/esquadro/revisao/a_b__c.js/') !== -1,
      'o aviso tem de achar o id na pasta 1: ' + s.aviso);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3, itens 16 e 17: as duas mensagens ganham o proximo passo.
test('0.3.3/item 16: fora de um repositorio git a mensagem diz o que fazer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-sem-git-'));
  try {
    fs.writeFileSync(path.join(dir, 'raiz.txt'), 'sem repositorio\n', 'utf8');
    const r = spawnSync(process.execPath, [CLI, '--arquivo', 'raiz.txt', '--semente', 'fixa'], {
      cwd: dir, encoding: 'utf8', shell: false, env: Object.assign({}, process.env, { GIT_CEILING_DIRECTORIES: os.tmpdir() })
    });
    assert.strictEqual(r.stderr, '', r.stderr);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /^ERRO: nao consegui falar com o git/, r.stdout);
    assert.match(r.stdout, /rode de dentro de um repositorio git/i, 'diz o proximo passo: ' + r.stdout);
    assert.match(r.stdout, /HEAD/, 'diz por que (a revisao compara com o HEAD): ' + r.stdout);
    assert.strictEqual(fs.existsSync(path.join(dir, '.claude')), false, 'nada gravado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('0.3.3/item 17: sem mapa.json legivel para dizer o id, o aviso diz o que fazer com a regra do id', () => {
  const dir = repoDeEnsaio();
  try {
    fs.mkdirSync(path.join(baseDeRevisao(dir), '1'), { recursive: true });
    fs.writeFileSync(path.join(baseDeRevisao(dir), '1', 'mapa.json'), '{ quebrado', 'utf8');
    const r = rodarCli(dir, 'raiz.txt');
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout);
    assert.match(s.aviso, /para dizer o id/, s.aviso);
    assert.match(s.aviso, /aplique a regra do id/i, 'o aviso diz o proximo passo: ' + s.aviso);
    assert.match(s.aviso, /caminho do arquivo que essa revisao inspecionou/, s.aviso);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 0.3.3, item 18: a regra do id em texto mora no cegar.js, ao lado do idDoArquivo, e o preparar a usa.
test('0.3.3/item 18: o texto da regra do id concorda com o idDoArquivo (o que ele diz manter, mantem; o resto, troca)', () => {
  assert.strictEqual(typeof cegar.REGRA_DO_ID, 'string', 'cegar.js tem de exportar REGRA_DO_ID');
  // A barra vira duplo underscore: o texto diz "/" e "__", e a funcao faz.
  assert.ok(cegar.REGRA_DO_ID.indexOf('/') !== -1 && cegar.REGRA_DO_ID.indexOf('__') !== -1, cegar.REGRA_DO_ID);
  assert.strictEqual(cegar.idDoArquivo('a/b'), 'a__b');
  // Os caracteres que o texto lista entre aspas sao os que a funcao mantem.
  const listados = (cegar.REGRA_DO_ID.match(/"(.)"/g) || []).map(function (s) { return s[1]; });
  assert.deepStrictEqual(listados, ['.', '_', '-'], cegar.REGRA_DO_ID);
  assert.match(cegar.REGRA_DO_ID, /letras, numeros/);
  listados.concat(['a', 'Z', '7']).forEach(function (c) {
    assert.strictEqual(cegar.idDoArquivo('x' + c + 'y'), 'x' + c + 'y', 'o texto diz que "' + c + '" fica');
  });
  // O resto vira "_" (o texto diz "trocado por _").
  [' ', 'ç', '@', '$'].forEach(function (c) {
    assert.strictEqual(cegar.idDoArquivo('x' + c + 'y'), 'x_y', 'o texto diz que "' + c + '" vira _');
  });
});

test('0.3.3/item 18: o aviso do formato antigo usa o texto do cegar.js e o exemplo sai do idDoArquivo', () => {
  const dir = repoDeEnsaio();
  try {
    fs.mkdirSync(path.join(baseDeRevisao(dir), '1'), { recursive: true });
    const s = JSON.parse(rodarCli(dir, 'raiz.txt').stdout);
    assert.ok(s.aviso.indexOf(cegar.REGRA_DO_ID) !== -1, 'o aviso cita a regra do cegar.js: ' + s.aviso);
    assert.ok(s.aviso.indexOf('(a/b.js vira ' + cegar.idDoArquivo('a/b.js') + ')') !== -1,
      'o exemplo sai do idDoArquivo: ' + s.aviso);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

