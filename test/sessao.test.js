'use strict';
// Bloco M / M1 (D435): scripts/sessao.js e o que o mod chama por $.process.run. Le do stdin
// { uso, amostras, sessao }, junta o estado da sessao (a mesma conta do portao-fecho: saude.acumular)
// e os limiares do projeto, e devolve JSON { curta, longa, cruzou }. Nunca derruba: saida 0 sempre.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'sessao.js');

function cenario(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-sessao-'));
  const projeto = path.join(base, 'projeto');
  fs.mkdirSync(path.join(projeto, '.claude', 'esquadro'), { recursive: true });
  fs.mkdirSync(path.join(base, 'esquadro'), { recursive: true });
  try { fn({ base: base, projeto: projeto }); } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

function rodar(c, entrada) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: c.projeto,
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
    // Pedido 31: o gasto do mes le as transcricoes de CLAUDE_CONFIG_DIR/projects - a do teste, nunca a real.
    env: Object.assign({}, process.env, { ESQUADRO_TMP: c.base, CLAUDE_CONFIG_DIR: path.join(c.base, 'config') }),
    encoding: 'utf8'
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const USO = { startedAt: 0, context: { tokens: 46900, window: 1000000, percent: 5 }, rateLimits: [], cost: { usd: 1 } };

test('sessao.js: soma turno + sessao e usa o limiar do projeto (a conta do portao-fecho)', () => {
  cenario(function (c) {
    fs.writeFileSync(path.join(c.projeto, '.claude', 'esquadro', 'projeto.json'), JSON.stringify({ limiares: { revisoesFechadas: 5 } }));
    fs.writeFileSync(path.join(c.base, 'esquadro', 'sess-1.json'),
      JSON.stringify({ contadoresSessao: { revisao_fechada: 3 }, contadores: { revisao_fechada: 2 } }));
    const r = rodar(c, { uso: USO, amostras: [], sessao: 'sess-1' });
    assert.strictEqual(r.cruzou, true, JSON.stringify(r));
    assert.ok(r.longa.indexOf('revisoes independentes fechadas: 5 de 5') !== -1, r.longa);
    assert.ok(r.curta.indexOf('contexto 5%') !== -1, r.curta);
  });
});

test('sessao.js: sem estado e sem projeto -> limiares padrao, nada cruzou', () => {
  cenario(function (c) {
    const r = rodar(c, { uso: USO, amostras: [], sessao: 'nao-existe' });
    assert.strictEqual(r.cruzou, false);
    assert.ok(/troca: 0 de 7 gatilhos/.test(r.curta), r.curta);
  });
});

test('sessao.js: aviso ja dado na sessao aparece no medidor', () => {
  cenario(function (c) {
    fs.writeFileSync(path.join(c.base, 'esquadro', 'sess-2.json'), JSON.stringify({ avisouSaude: true }));
    const r = rodar(c, { uso: USO, amostras: [], sessao: 'sess-2' });
    assert.ok(/troca: aviso ja dado/.test(r.curta), r.curta);
  });
});

test('sessao.js: entrada que nao e JSON -> saida 0, curta mesmo assim e o erro dito', () => {
  cenario(function (c) {
    const r = rodar(c, 'isto nao e json');
    assert.ok(typeof r.curta === 'string' && r.curta.indexOf('esquadro') === 0, JSON.stringify(r));
    assert.ok(typeof r.erro === 'string' && r.erro.length > 0, JSON.stringify(r));
  });
});

// D445 (0.6.2): o medidor usa o contexto ao vivo (uso.context.tokens) no 7o gatilho.
test('sessao.js: o gatilho de contexto usa uso.context.tokens ao vivo', () => {
  cenario(function (c) {
    const alto = Object.assign({}, USO, { context: { tokens: 260000, window: 1000000, percent: 26 } });
    const r = rodar(c, { uso: alto, amostras: [], sessao: 'nao-existe' });
    assert.strictEqual(r.cruzou, true, JSON.stringify(r));
    assert.ok(r.longa.indexOf('tokens de contexto: 260000 de 175000') !== -1, r.longa);
  });
});

// Pedido 30 (plano dos pedidos 30-32, Tarefa 2): o medidor devolve a linha do plano, que o mod poe na faixa.
test('sessao.js: devolve a linha do plano (vazia sem plano)', () => {
  cenario(function (c) {
    assert.strictEqual(rodar(c, { uso: USO, amostras: [], sessao: 'nao-existe' }).plano, '');
    fs.mkdirSync(path.join(c.projeto, 'p'));
    fs.writeFileSync(path.join(c.projeto, 'p', '2026-01-01-x-plano.md'), '### Tarefa 1: a\n- [x] p\n### Tarefa 2: b\n- [ ] p\n');
    fs.writeFileSync(path.join(c.projeto, '.claude', 'esquadro', 'plano-ativo.json'),
      JSON.stringify({ arquivo: 'p/2026-01-01-x-plano.md', sessionId: 's' }));
    const comPlano = rodar(c, { uso: USO, amostras: [], sessao: 'nao-existe' });
    assert.strictEqual(comPlano.plano, 'plano x | 1 de 2 | proxima: Tarefa 2 b');
    // pedido 32: a barra leva o plano curto (nome e conta) logo depois de "esquadro"
    assert.ok(comPlano.curta.indexOf('esquadro | plano x 1 de 2 | contexto') === 0, comPlano.curta);
  });
});

// Pedido 31 (D520): o medidor soma o real do $.store (com a sessao atual) e a estimativa das transcricoes das outras,
// e devolve em `guardar` o que o mod grava de volta.
test('sessao.js: gasto do mes (real + transcricoes) na curta, e `guardar` com o real e o historico da sessao', () => {
  cenario(function (c) {
    const proj = path.join(c.base, 'config', 'projects', 'c--proj');
    fs.mkdirSync(proj, { recursive: true });
    const linha = (id, sessao) => JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(),
      message: { id: id, model: 'claude-opus-5-5', usage: { input_tokens: 1000000, output_tokens: 0 } } });
    fs.writeFileSync(path.join(proj, 'outra.jsonl'), linha('m1'));
    fs.writeFileSync(path.join(proj, 'sess-g.jsonl'), linha('m2'));
    const uso = Object.assign({}, USO, { cost: { usd: 1 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 30, resetsAt: '2026-10-20T07:00:00.000Z' }] });
    const antes = (t) => ({ t: t, medidas: 4, janelas: { seven_day: { resetIni: 'R', ini: 0, resetFim: 'R', fim: 10 } } });
    const r = rodar(c, { uso: uso, amostras: [], sessao: 'sess-g', historico: { a: antes(1), b: antes(2) }, gastoReal: {} });
    // semana 30% usada, 10% por sessao nas 2 anteriores -> 7 handoffs
    assert.ok(r.curta.indexOf('semana 30% (~7 handoffs)') !== -1, r.curta);
    // real: a sessao atual (US$ 1); estimado: so a "outra" (US$ 4) - a atual tem real e sai da estimativa.
    assert.ok(r.curta.indexOf('mes US$ 5 |') !== -1, r.curta);
    assert.ok(r.curta.indexOf('sessao US$ 1.00') !== -1, r.curta);
    assert.ok(r.guardar && r.guardar.historico['sess-g'].janelas.seven_day.ini === 30, JSON.stringify(r.guardar));
    const chave = Object.keys(r.guardar.gastoReal)[0];
    assert.deepStrictEqual(r.guardar.gastoReal[chave], { 'sess-g': 1 });
    assert.ok(fs.existsSync(path.join(c.base, 'esquadro', 'cache', 'gasto-mes.json')), 'cache na pasta do estado');
  });
});

// Pedido 32 (plano dos pedidos 30-32, Tarefa 4 subitem 3): o sessao.js devolve `botoes` (lib/botoes.js) com o que ja
// le - estado, projeto, cruzou - e o que o mod manda: a ultima resposta do agente e se o manual foi carregado.
test('sessao.js: devolve `botoes` na ordem de prioridade, com a resposta e o padrao que o mod manda', () => {
  cenario(function (c) {
    const nomes = (r) => (r.botoes || []).map((b) => b.nome);
    // sem projeto.json: o do init
    assert.deepStrictEqual(nomes(rodar(c, { uso: USO, amostras: [], sessao: 'nao-existe' })), ['init']);
    fs.writeFileSync(path.join(c.projeto, '.claude', 'esquadro', 'projeto.json'), JSON.stringify({ marchas: { aaa: ['src/**'] } }));
    fs.writeFileSync(path.join(c.base, 'esquadro', 'sess-b.json'), JSON.stringify({
      arquivosTocados: [path.join(c.projeto, 'src', 'a.js')], esperaAprender: 4, auditoriaAvisou: true }));
    const r = rodar(c, { uso: USO, amostras: [], sessao: 'sess-b', resposta: 'ofereco o /esquadro:paralelo', padrao: false });
    assert.deepStrictEqual(nomes(r), ['aprender', 'auditar', 'paralelo', 'padrao'], JSON.stringify(r.botoes));
    assert.deepStrictEqual(nomes(rodar(c, { uso: USO, amostras: [], sessao: 'sess-b', padrao: true })), ['aprender', 'auditar']);
    // calibrar: 30 conversas na pasta de transcricoes do projeto e limiar nunca calibrado
    const calibracao = require('../scripts/lib/calibracao.js');
    const pasta = path.join(c.base, 'config', 'projects', calibracao.nomeDaPasta(c.projeto));
    fs.mkdirSync(pasta, { recursive: true });
    for (let i = 0; i < calibracao.AMOSTRA_MINIMA.sessoes; i++) fs.writeFileSync(path.join(pasta, 's' + i + '.jsonl'), '');
    assert.ok(nomes(rodar(c, { uso: USO, amostras: [], sessao: 'nao-existe' })).indexOf('calibrar') !== -1);
    assert.ok(fs.existsSync(path.join(c.base, 'esquadro', 'cache', 'calibrar.json')), 'marca do dia na pasta do estado');
  });
});

test('sessao.js: cruzou acende o botao do handoff, em primeiro', () => {
  cenario(function (c) {
    fs.writeFileSync(path.join(c.projeto, '.claude', 'esquadro', 'projeto.json'), JSON.stringify({ limiares: { revisoesFechadas: 1 } }));
    fs.writeFileSync(path.join(c.base, 'esquadro', 'sess-h.json'), JSON.stringify({ contadores: { revisao_fechada: 1 } }));
    const r = rodar(c, { uso: USO, amostras: [], sessao: 'sess-h' });
    assert.strictEqual(r.cruzou, true);
    assert.strictEqual(r.botoes[0].nome, 'handoff', JSON.stringify(r.botoes));
  });
});
