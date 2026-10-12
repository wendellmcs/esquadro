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
    env: Object.assign({}, process.env, { ESQUADRO_TMP: c.base }),
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
    const alto = Object.assign({}, USO, { context: { tokens: 160000, window: 1000000, percent: 16 } });
    const r = rodar(c, { uso: alto, amostras: [], sessao: 'nao-existe' });
    assert.strictEqual(r.cruzou, true, JSON.stringify(r));
    assert.ok(r.longa.indexOf('tokens de contexto: 160000 de 150000') !== -1, r.longa);
  });
});
