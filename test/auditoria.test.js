'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const aud = require('../scripts/lib/auditoria.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'auditar.js');

// ---------------------------------------------------------------- memoria (item 3 da 0.3.4, D288)
// Fixture em pasta temporaria criada pelo teste. Nunca o MEMORY.md real.

function pasta(nome) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-auditoria-' + nome + '-'));
}

/** Grava um MEMORY.md de brinquedo e devolve o caminho (Buffer ou texto, sem tocar em mais nada). */
function memoria(dir, conteudo) {
  const alvo = path.join(dir, 'MEMORY.md');
  fs.writeFileSync(alvo, conteudo);
  return alvo;
}

/** n linhas, cada uma com `largura` caracteres ASCII, todas terminadas em \n. */
function linhas(n, largura) {
  const out = [];
  for (let i = 0; i < n; i++) out.push('x'.repeat(largura));
  return out.join('\n') + '\n';
}

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

test('memoria: arquivo abaixo dos dois limites cabe inteiro e nada fica de fora', () => {
  const dir = pasta('abaixo');
  try {
    // 71 linhas terminadas em \n = 71 linhas, nao 72 (a linha vazia depois do ultimo \n nao e linha).
    const texto = linhas(71, 9);
    const m = aud.medirMemoria(memoria(dir, texto));
    assert.strictEqual(m.medida, true);
    assert.strictEqual(m.linhas, 71);
    assert.strictEqual(m.bytes, 71 * 10);
    assert.strictEqual(m.cabe, true);
    assert.strictEqual(m.primeiro, null);
    assert.deepStrictEqual(m.foraDaCarga, { linhas: 0, bytes: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: fronteira exata (200 linhas, 25.000 bytes) ainda cabe; uma a mais nao', () => {
  const dir = pasta('fronteira');
  try {
    // 200 linhas de 124 chars + \n = 25.000 bytes exatos.
    const no = aud.medirMemoria(memoria(dir, linhas(200, 124)));
    assert.strictEqual(no.bytes, 25000);
    assert.strictEqual(no.linhas, 200);
    assert.strictEqual(no.cabe, true);
    assert.deepStrictEqual(no.foraDaCarga, { linhas: 0, bytes: 0 });
    const alem = aud.medirMemoria(memoria(dir, linhas(201, 1)));
    assert.strictEqual(alem.cabe, false);
    assert.strictEqual(alem.foraDaCarga.linhas, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: acima de 200 linhas diz quantas ficam de fora, e que foram as linhas que vieram primeiro', () => {
  const dir = pasta('linhas');
  try {
    const m = aud.medirMemoria(memoria(dir, linhas(250, 1)));
    assert.strictEqual(m.linhas, 250);
    assert.strictEqual(m.bytes, 500);
    assert.strictEqual(m.cabe, false);
    assert.strictEqual(m.primeiro, 'linhas');
    assert.deepStrictEqual(m.foraDaCarga, { linhas: 50, bytes: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: acima de 25.000 bytes com menos de 200 linhas diz quantos bytes ficam de fora', () => {
  const dir = pasta('bytes');
  try {
    const m = aud.medirMemoria(memoria(dir, linhas(50, 600)));
    assert.strictEqual(m.linhas, 50);
    assert.strictEqual(m.bytes, 50 * 601);
    assert.strictEqual(m.cabe, false);
    assert.strictEqual(m.primeiro, 'bytes');
    assert.deepStrictEqual(m.foraDaCarga, { linhas: 0, bytes: 50 * 601 - 25000 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: estourando os dois, "primeiro" e o limite que corta antes', () => {
  const dir = pasta('ambos');
  try {
    // 300 linhas de 100 bytes: a linha 201 comeca no byte 20.200 (antes de 25.000) -> linhas primeiro.
    const a = aud.medirMemoria(memoria(dir, linhas(300, 100)));
    assert.strictEqual(a.primeiro, 'linhas');
    assert.deepStrictEqual(a.foraDaCarga, { linhas: 100, bytes: 300 * 101 - 25000 });
    // 300 linhas de 200 bytes: a linha 201 comeca no byte 40.200 (depois de 25.000) -> bytes primeiro.
    const b = aud.medirMemoria(memoria(dir, linhas(300, 200)));
    assert.strictEqual(b.primeiro, 'bytes');
    assert.deepStrictEqual(b.foraDaCarga, { linhas: 100, bytes: 300 * 201 - 25000 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: maior linha traz o numero (base 1) e os bytes UTF-8, nao os caracteres', () => {
  const dir = pasta('maior');
  try {
    // linha 3 = a, c-cedilha, a-til, o (4 caracteres, 6 bytes em UTF-8); as outras tem 3, 2 e 1 byte.
    const m = aud.medirMemoria(memoria(dir, Buffer.from('abc\nde\na\u00e7\u00e3o\nf\n', 'utf8')));
    assert.strictEqual(m.linhas, 4);
    assert.deepStrictEqual(m.maiorLinha, { numero: 3, bytes: 6 });
    assert.strictEqual(m.bytes, 4 + 3 + 7 + 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: CRLF, sem \\n final e arquivo vazio contam certo', () => {
  const dir = pasta('bordas');
  try {
    const crlf = aud.medirMemoria(memoria(dir, 'a\r\nbb\r\nccc\r\n'));
    assert.strictEqual(crlf.linhas, 3);
    assert.strictEqual(crlf.bytes, 12, 'o \\r conta nos bytes do arquivo');
    assert.deepStrictEqual(crlf.maiorLinha, { numero: 3, bytes: 3 }, 'o \\r nao conta na linha');
    const semFinal = aud.medirMemoria(memoria(dir, 'a\nb'));
    assert.strictEqual(semFinal.linhas, 2);
    const vazio = aud.medirMemoria(memoria(dir, ''));
    assert.strictEqual(vazio.medida, true);
    assert.strictEqual(vazio.linhas, 0);
    assert.strictEqual(vazio.cabe, true);
    assert.deepStrictEqual(vazio.maiorLinha, { numero: 0, bytes: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: os limites e a leitura de "25 KB" vao declarados na propria saida', () => {
  const dir = pasta('declara');
  try {
    const m = aud.medirMemoria(memoria(dir, linhas(3, 3)));
    assert.strictEqual(m.limite.linhas, 200);
    assert.strictEqual(m.limite.bytes, 25000);
    assert.ok(/25\.000/.test(m.limite.nota) && /25\.600/.test(m.limite.nota),
      'a nota tem de dizer que 25 KB foi lido como 25.000 e que podia ser 25.600: ' + m.limite.nota);
    assert.ok(/memory\.md/.test(m.limite.fonte), 'a fonte (doc oficial) vai ao lado do numero');
    assert.ok(m.metodo.length > 0, 'numero sem metodo e opiniao');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: sem caminho diz "nao medida" e a causa, nunca some calada', () => {
  for (const vazio of [undefined, null, '']) {
    const m = aud.medirMemoria(vazio);
    assert.strictEqual(m.medida, false);
    assert.strictEqual(m.causa, 'sem-caminho');
    assert.ok(/nao medida/.test(m.motivo) && /--memoria/.test(m.motivo), m.motivo);
    assert.strictEqual(m.linhas, undefined, 'nao medida nao inventa numero');
  }
});

test('memoria: caminho que nao se le diz "nao medida" com o codigo do erro', () => {
  const dir = pasta('ilegivel');
  try {
    const falta = path.join(dir, 'nao-existe', 'MEMORY.md');
    const m = aud.medirMemoria(falta);
    assert.strictEqual(m.medida, false);
    assert.strictEqual(m.causa, 'ENOENT');
    assert.strictEqual(m.caminho, falta);
    assert.ok(/nao medida/.test(m.motivo) && /ENOENT/.test(m.motivo), m.motivo);
    // T4: o aviso diz o proximo passo, na mesma frase
    assert.ok(/confira o caminho passado em --memoria/.test(m.motivo), m.motivo);
    // pasta no lugar do arquivo: outro codigo, mesma regra.
    const pastaNoLugar = aud.medirMemoria(dir);
    assert.strictEqual(pastaNoLugar.medida, false);
    assert.ok(/^E[A-Z]+$/.test(pastaNoLugar.causa), pastaNoLugar.causa);
    assert.notStrictEqual(pastaNoLugar.causa, 'ENOENT');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: o teto de 200 e o mesmo com e sem memoria (ela nao soma)', () => {
  const dir = pasta('teto');
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'skills', 'zelador'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'skills', 'zelador', 'SKILL.md'),
      '---\nname: zelador\ndescription: varre a casa\n---\n\n- um item\n- outro item\n');
    // memoria cheia de itens de lista: se somasse no teto, o total mudaria.
    const arq = memoria(dir, '- item\n'.repeat(300));
    const sem = aud.auditar(dir, {});
    const com = aud.auditar(dir, {}, { memoria: arq });
    assert.deepStrictEqual(com.peso, sem.peso);
    assert.strictEqual(com.peso.total, 2);
    assert.strictEqual(com.peso.estourou, false);
    assert.strictEqual(com.memoria.medida, true);
    assert.strictEqual(com.memoria.linhas, 300);
    assert.strictEqual(sem.memoria.medida, false, 'sem o argumento a chave existe e diz nao medida');
    assert.ok(!com.peso.porArquivo.some(function (p) { return /MEMORY/.test(p.arquivo); }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('memoria: auditar.js --memoria mede; sem o argumento, ou com ele vazio, diz nao medida', () => {
  const dir = pasta('cli');
  try {
    const arq = memoria(dir, linhas(10, 4));
    const rodar = function (args) {
      const r = spawnSync(process.execPath, [SCRIPT].concat(args), { cwd: dir, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };
    const com = rodar(['--memoria', arq]);
    assert.strictEqual(com.memoria.medida, true);
    assert.strictEqual(com.memoria.linhas, 10);
    // caminho relativo e resolvido contra a pasta do processo
    assert.strictEqual(rodar(['--memoria', 'MEMORY.md']).memoria.linhas, 10);
    const sem = rodar([]);
    assert.strictEqual(sem.memoria.medida, false);
    assert.strictEqual(sem.memoria.causa, 'sem-caminho');
    const semValor = rodar(['--memoria']);
    assert.strictEqual(semValor.memoria.medida, false);
    assert.strictEqual(semValor.memoria.causa, 'sem-caminho');
    const falta = rodar(['--memoria', path.join(dir, 'nada.md')]);
    assert.strictEqual(falta.memoria.causa, 'ENOENT');
    assert.deepStrictEqual(com.peso, sem.peso, 'o peso nao muda com a memoria');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
