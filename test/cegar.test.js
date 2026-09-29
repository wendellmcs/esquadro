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
    assert.match(s.aviso, /uma base por arquivo/);
    assert.strictEqual(fs.existsSync(path.join(baseDeRevisao(dir), 'raiz.txt')), false, 'nao abre base nova no meio da revisao');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
