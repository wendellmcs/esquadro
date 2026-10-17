'use strict';
// Plano 084 (pedido 73, D549, mock D550): aviso antes de gastar ao voltar a chat grande parado. Parado mais de 1 h
// (o cache de 1 h venceu) e contexto de 200 mil ou mais: o gancho de entrada segura a mensagem uma vez por pausa e
// diz quanto custa continuar contra um chat novo. Falha de leitura nunca segura.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const saude = require('../scripts/lib/saude.js');
const volta = require('../scripts/lib/volta.js');
const projeto = require('../scripts/lib/projeto.js');
const estado = require('../scripts/lib/estado.js');

const RAIZ = path.join(__dirname, '..');
const MIN = 60 * 1000;
const AGORA = Date.parse('2026-10-17T12:00:00.000Z');

function transcript(linhas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-volta-'));
  const f = path.join(dir, 's.jsonl');
  fs.writeFileSync(f, linhas.map(function (l) { return typeof l === 'string' ? l : JSON.stringify(l); }).join('\n') + '\n');
  return { dir: dir, f: f, fim: function () { fs.rmSync(dir, { recursive: true, force: true }); } };
}
function chamada(quando, modelo, contexto, extra) {
  return Object.assign({ type: 'assistant', timestamp: new Date(quando).toISOString(),
    message: { model: modelo, usage: { input_tokens: 10, cache_read_input_tokens: contexto - 10,
      cache_creation_input_tokens: 0, output_tokens: 9 } } }, extra || {});
}

// O texto do mock aprovado (prints-084/mock-084.html, D550), letra por letra.
const MOCK = [
  'esquadro - este chat ficou 3 h 08 min parado e o cache venceu: continuar aqui regrava 318 mil tokens.',
  '',
  'Continuar neste chat: cerca de US$ 2,54 (Opus 5.5).',
  'Abrir um chat novo: cerca de US$ 0,55.',
  '',
  'Faca uma destas:',
  '  1. abra um chat novo e cole o prompt do ultimo handoff, se ele estiver em dia;',
  '  2. para seguir neste chat, mande a mensagem de novo: este aviso nao volta nesta pausa.',
  '',
  'Desligar neste projeto: "avisoDeVolta": false em .claude/esquadro/projeto.json.'
].join('\n');

test('084: ultimaChamadaDoTranscript da contexto, horario e modelo da ultima chamada da linha principal', () => {
  const t = transcript([chamada(AGORA - 300 * MIN, 'claude-opus-5-5', 1000),
    chamada(AGORA - 200 * MIN, 'claude-fable-5-1', 250000),
    { type: 'user', timestamp: new Date(AGORA - 5 * MIN).toISOString(), message: { content: 'segue' } },
    chamada(AGORA - 100 * MIN, 'claude-haiku-5-5', 5000, { isSidechain: true }), 'linha torta {', '']);
  try {
    assert.deepStrictEqual(saude.ultimaChamadaDoTranscript(t.f),
      { contexto: 250000, horario: AGORA - 200 * MIN, modelo: 'claude-fable-5-1' });
    // o contexto de antes segue igual (D445)
    assert.strictEqual(saude.contextoDoTranscript(t.f), 250000);
  } finally { t.fim(); }
  assert.strictEqual(saude.ultimaChamadaDoTranscript(null), null);
  assert.strictEqual(saude.ultimaChamadaDoTranscript(path.join(os.tmpdir(), 'nao-existe-esquadro-volta.jsonl')), null);
  // sem horario legivel ou sem modelo: o campo vem null, o contexto vem
  const s = transcript([{ type: 'assistant', timestamp: 'ontem', message: { usage: { input_tokens: 7 } } }]);
  try {
    assert.deepStrictEqual(saude.ultimaChamadaDoTranscript(s.f), { contexto: 7, horario: null, modelo: null });
  } finally { s.fim(); }
});

test('084: o aviso do mock aprovado (3 h 08 min, 318 mil, Opus 5.5), letra por letra', () => {
  const r = volta.avaliar({ contexto: 318000, horario: AGORA - 188 * MIN, modelo: 'claude-opus-5-5' }, AGORA);
  assert.ok(r, 'tinha de avisar');
  assert.strictEqual(volta.motivo(r), MOCK);
  assert.strictEqual(r.marca, AGORA - 188 * MIN, 'a marca da pausa e o horario da ultima chamada');
});

test('084: a conta - continuar = contexto x escrita de 1 h; chat novo = 68.723 x escrita de 1 h', () => {
  const r = volta.avaliar({ contexto: 400000, horario: AGORA - 61 * MIN, modelo: 'claude-fable-5-1' }, AGORA);
  assert.ok(Math.abs(r.continuar - 400000 * 20 / 1e6) < 1e-9, 'Fable 5.1: escrita de 1 h US$ 20/M');
  assert.ok(Math.abs(r.novo - 68723 * 20 / 1e6) < 1e-9);
  assert.strictEqual(volta.RECOMECO, 68723, 'mediana da 1a chamada de chat novo (D547)');
  assert.match(volta.motivo(r), /^esquadro - este chat ficou 1 h 01 min parado .* 400 mil tokens\.$/m);
  assert.match(volta.motivo(r), /cerca de US\$ 8,00 \(Fable 5\.1\)\./);
});

test('084: quando NAO avisa - ate 1 h parado, menos de 200 mil, leitura que falta', () => {
  const ok = { contexto: 200000, horario: AGORA - 61 * MIN, modelo: 'claude-opus-5-5' };
  assert.ok(volta.avaliar(ok, AGORA), 'controle: 200 mil e 61 min avisa');
  assert.strictEqual(volta.avaliar(Object.assign({}, ok, { horario: AGORA - 60 * MIN }), AGORA), null, '60 min exatos: o cache dura');
  assert.strictEqual(volta.avaliar(Object.assign({}, ok, { contexto: 199999 }), AGORA), null, 'abaixo de 200 mil');
  assert.strictEqual(volta.avaliar(Object.assign({}, ok, { horario: null }), AGORA), null, 'sem horario');
  assert.strictEqual(volta.avaliar(Object.assign({}, ok, { horario: AGORA + 90 * MIN }), AGORA), null, 'relogio no futuro');
  assert.strictEqual(volta.avaliar(null, AGORA), null, 'sem leitura');
});

test('084: uma vez por pausa - a mesma marca nao avisa de novo; pausa nova avisa', () => {
  const c = { contexto: 300000, horario: AGORA - 90 * MIN, modelo: 'claude-opus-5-5' };
  const r = volta.avaliar(c, AGORA);
  assert.strictEqual(volta.avaliar(c, AGORA, r.marca), null, 'mesma pausa: passa');
  assert.ok(volta.avaliar(c, AGORA, r.marca - MIN), 'outra pausa: avisa');
});

test('084: modelo sem preco avisa sem o valor em dolar', () => {
  // 'constructor' e 'toString' sao nomes herdados do objeto da tabela: nao sao preco (ronda 1, borda)
  for (const modelo of ['claude-novo-9', null, 'constructor', 'toString']) {
    const r = volta.avaliar({ contexto: 250000, horario: AGORA - 120 * MIN, modelo: modelo }, AGORA);
    assert.ok(r, String(modelo) + ': tinha de avisar');
    const t = volta.motivo(r);
    assert.ok(!/US\$ \d/.test(t), 'sem valor em dolar: ' + t);
    assert.match(t, /^esquadro - este chat ficou 2 h 00 min parado .* 250 mil tokens\.$/m);
    assert.match(t, /sem o valor em US\$|sem preco/i);
  }
});

test('084: chave avisoDeVolta - liga/desliga do projeto.json, ligada por padrao, so false desliga', () => {
  assert.ok(projeto.CHAVES_LIGA_DESLIGA.indexOf('avisoDeVolta') !== -1);
  assert.strictEqual(volta.ligada(null), true);
  assert.strictEqual(volta.ligada({}), true);
  assert.strictEqual(volta.ligada({ avisoDeVolta: 'false' }), true, 'texto nao desliga (D388)');
  assert.strictEqual(volta.ligada({ avisoDeVolta: false }), false);
  assert.ok(estado.CAMPOS_DA_SESSAO.indexOf('avisouVolta') !== -1, 'a marca da pausa sobrevive ao fecho');
});

// Tarefa 3: o gancho de entrada (abrir-turno.js) de ponta a ponta.
function abrir(dir, sessoes, id, transcriptPath, prompt) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'abrir-turno.js')], {
    cwd: dir, encoding: 'utf8',
    input: JSON.stringify({ session_id: id, cwd: dir, hook_event_name: 'UserPromptSubmit', prompt: prompt || 'segue',
      transcript_path: transcriptPath }),
    env: Object.assign({}, process.env, { ESQUADRO_TMP: sessoes })
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test('084 Tarefa 3: abrir-turno segura a 1a mensagem da pausa e deixa passar a 2a', () => {
  const agora = Date.now();
  const t = transcript([chamada(agora - 188 * MIN, 'claude-opus-5-5', 318000)]);
  const sessoes = path.join(t.dir, 'sessoes');
  try {
    const um = abrir(t.dir, sessoes, 'v1', t.f);
    assert.ok(um && um.decision === 'block', 'a 1a mensagem tinha de ser segurada: ' + JSON.stringify(um));
    assert.match(um.reason, /^esquadro - este chat ficou 3 h 0[78] min parado/);
    assert.match(um.reason, /Desligar neste projeto: "avisoDeVolta": false/);
    const dois = abrir(t.dir, sessoes, 'v1', t.f);
    assert.ok(!dois || dois.decision !== 'block', 'a 2a mensagem tinha de passar: ' + JSON.stringify(dois));
  } finally { t.fim(); }
});

test('084 Tarefa 3: abrir-turno nao segura - chave desligada, chat pequeno, transcript ausente', () => {
  const agora = Date.now();
  const t = transcript([chamada(agora - 188 * MIN, 'claude-opus-5-5', 318000)]);
  const p = transcript([chamada(agora - 188 * MIN, 'claude-opus-5-5', 50000)]);
  const sessoes = path.join(t.dir, 'sessoes');
  try {
    // controle positivo na mesma pasta antes de desligar
    assert.strictEqual(abrir(t.dir, sessoes, 'c0', t.f).decision, 'block');
    fs.mkdirSync(path.join(t.dir, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(t.dir, '.claude', 'esquadro', 'projeto.json'), JSON.stringify({ avisoDeVolta: false }));
    const off = abrir(t.dir, sessoes, 'c1', t.f);
    assert.ok(!off || off.decision !== 'block', 'desligado: ' + JSON.stringify(off));
    const peq = abrir(p.dir, sessoes, 'c2', p.f);
    assert.ok(!peq || peq.decision !== 'block', 'chat pequeno: ' + JSON.stringify(peq));
    const sem = abrir(p.dir, sessoes, 'c3', path.join(p.dir, 'nao-existe.jsonl'));
    assert.ok(!sem || sem.decision !== 'block', 'sem transcript: ' + JSON.stringify(sem));
  } finally { t.fim(); p.fim(); }
});
