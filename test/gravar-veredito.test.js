'use strict';
// 0.3.4, item 1 (D264, D287): o veredito do inspetor e gravado por hook, nao a mao.
// O script nunca barra (sai com 0, nunca emite `decision`) e nunca cala (nao gravou = systemMessage
// com a causa). A fixture REAL_SUBAGENT_STOP e o payload de um SubagentStop real (claude 2.1.258,
// 2026-09-30, agente esquadro:inspetor), com os caminhos de usuario trocados por ficticios.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'gravar-veredito.js');

const REAL_SUBAGENT_STOP = {
  session_id: '2ea387fe-91f5-4f3a-9a12-156200305348',
  transcript_path: 'C:\\dev\\.claude\\projects\\proj\\2ea387fe-91f5-4f3a-9a12-156200305348.jsonl',
  cwd: 'C:\\dev\\proj',
  prompt_id: 'e7fb3c83-5849-4197-bccb-fd491ed465fa',
  permission_mode: 'acceptEdits',
  agent_id: 'a4ef814f10f9daff9',
  agent_type: 'esquadro:inspetor',
  effort: { level: 'medium' },
  hook_event_name: 'SubagentStop',
  stop_hook_active: false,
  agent_transcript_path: 'C:\\dev\\.claude\\projects\\proj\\2ea387fe\\subagents\\agent-a4ef814f10f9daff9.jsonl',
  last_assistant_message: '```json\n{\n  "lente": "correcao",\n  "melhor": "empate",\n' +
    '  "porQue": "nao sei - A.txt:1 retorna 1 e B.txt:1 retorna 2",\n  "achados": []\n}\n```',
  background_tasks: [{ id: 'a4ef814f10f9daff9', type: 'subagent', status: 'running',
    description: 'esquadro:inspetor review', agent_type: 'esquadro:inspetor' }],
  session_crons: []
};

function tmp(nome) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro gravar-' + nome + '-'));
}

/** Um projeto com uma ronda de verdade: revisao/<id>/<n>/ com A.txt, B.txt e vereditos/. */
function projeto() {
  const dir = tmp('proj');
  const ronda = path.join(dir, '.claude', 'esquadro', 'revisao', 'src__a.js', '1');
  fs.mkdirSync(path.join(ronda, 'vereditos'), { recursive: true });
  fs.writeFileSync(path.join(ronda, 'A.txt'), 'a\n', 'utf8');
  fs.writeFileSync(path.join(ronda, 'B.txt'), 'b\n', 'utf8');
  return { dir: dir, ronda: ronda, vereditos: path.join(ronda, 'vereditos'), estado: path.join(dir, '_estado') };
}

function veredito(p, extra) {
  return Object.assign({
    lente: 'correcao', melhor: 'A', porQue: 'A.txt:3 trata o null',
    achados: [{ severidade: 'P1', arquivo: 'B.txt', linha: 3, descricao: 'nao trata o null', comoFalha: 'null -> erro' }],
    vereditos: p.vereditos
  }, extra || {});
}

function stop(p, mensagem, extra) {
  return Object.assign({}, REAL_SUBAGENT_STOP, { cwd: p.dir, last_assistant_message: mensagem }, extra || {});
}

function handback(p, mensagem, extra) {
  return Object.assign({
    session_id: REAL_SUBAGENT_STOP.session_id, cwd: p.dir, agent_id: REAL_SUBAGENT_STOP.agent_id,
    agent_type: 'esquadro:inspetor', hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback',
    tool_input: { message: mensagem }, tool_response: {}
  }, extra || {});
}

function opcoes(p, entrada) {
  return { cwd: p.dir, encoding: 'utf8', input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
    env: Object.assign({}, process.env, { ESQUADRO_TMP: p.estado }) };
}

function rodar(p, entrada) {
  const r = spawnSync(process.execPath, [SCRIPT], opcoes(p, entrada));
  let json = null;
  if (r.stdout && r.stdout.trim()) { try { json = JSON.parse(r.stdout); } catch (e) { json = null; } }
  return { status: r.status, json: json, stdout: r.stdout, stderr: r.stderr };
}

/** O contrato que vale em TODA resposta: sai com 0 e nunca emite decision. */
function semBarrar(r) {
  assert.strictEqual(r.status, 0, 'o hook tem de sair com 0. stderr: ' + r.stderr);
  if (r.json) {
    assert.strictEqual(r.json.decision, undefined, 'decision no SubagentStop faria o inspetor continuar');
    assert.strictEqual(r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision, undefined);
  }
}

function calado(r) {
  semBarrar(r);
  assert.strictEqual((r.stdout || '').trim(), '', 'era para ficar calado: ' + r.stdout);
}

function avisou(r, causa) {
  semBarrar(r);
  assert.ok(r.json && typeof r.json.systemMessage === 'string', 'nao gravou e nao avisou: ' + r.stdout);
  assert.ok(/grave esta lente a mao, como antes/i.test(r.json.systemMessage), r.json.systemMessage);
  if (causa) assert.ok(causa.test(r.json.systemMessage), String(causa) + ' fora de: ' + r.json.systemMessage);
}

function lerVeredito(p, lente) {
  return JSON.parse(fs.readFileSync(path.join(p.vereditos, lente + '.json'), 'utf8'));
}

function arquivosEm(p) {
  return fs.readdirSync(p.vereditos).sort();
}

function limpar(p) { fs.rmSync(p.dir, { recursive: true, force: true }); }

// ------------------------------------------------------------------ o que grava

test('gravar-veredito: grava o JSON valido do SubagentStop em <lente>.json', () => {
  const p = projeto();
  try {
    const vd = veredito(p);
    const r = rodar(p, stop(p, JSON.stringify(vd)));
    calado(r);
    assert.deepStrictEqual(lerVeredito(p, 'correcao'), vd);
  } finally { limpar(p); }
});

test('gravar-veredito: grava o JSON cercado por bloco json, como o inspetor real devolve', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'seguranca', melhor: 'empate', achados: [] });
    const r = rodar(p, stop(p, '```json\n' + JSON.stringify(vd, null, 2) + '\n```'));
    calado(r);
    assert.deepStrictEqual(lerVeredito(p, 'seguranca'), vd);
  } finally { limpar(p); }
});

test('gravar-veredito: grava tambem com texto solto em volta do JSON', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'borda', achados: [] });
    const r = rodar(p, stop(p, 'Segue o veredito:\n' + JSON.stringify(vd) + '\nFim.'));
    calado(r);
    assert.deepStrictEqual(lerVeredito(p, 'borda'), vd);
  } finally { limpar(p); }
});

test('gravar-veredito: o JSON cercado vale mesmo com chaves soltas na prosa em volta', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'estados', achados: [] });
    calado(rodar(p, stop(p, 'Na {ronda} 1:\n```json\n' + JSON.stringify(vd) + '\n```\nVeja {isto}.')));
    assert.deepStrictEqual(lerVeredito(p, 'estados'), vd);
  } finally { limpar(p); }
});

test('gravar-veredito: lente de UI grava com a chave ui-', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'ui-a11y', achados: [] });
    calado(rodar(p, stop(p, JSON.stringify(vd))));
    assert.deepStrictEqual(arquivosEm(p), ['ui-a11y.json']);
  } finally { limpar(p); }
});

test('gravar-veredito: a lente pode vir pelo titulo quando o titulo e unico', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'Correcao e regressao', achados: [] });
    calado(rodar(p, stop(p, JSON.stringify(vd))));
    assert.deepStrictEqual(arquivosEm(p), ['correcao.json']);
  } finally { limpar(p); }
});

test('gravar-veredito: titulo que as duas familias usam nao grava (qual das duas?) e avisa', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'Estados obrigatorios', achados: [] });
    avisou(rodar(p, stop(p, JSON.stringify(vd))), /lente desconhecida/);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: a pasta vereditos pode vir relativa ao cwd da sessao', () => {
  const p = projeto();
  try {
    const rel = path.relative(p.dir, p.vereditos);
    const vd = veredito(p, { vereditos: rel, achados: [] });
    calado(rodar(p, stop(p, JSON.stringify(vd))));
    assert.deepStrictEqual(arquivosEm(p), ['correcao.json']);
  } finally { limpar(p); }
});

test('gravar-veredito: o payload REAL do SubagentStop e lido (sem a pasta, que o inspetor da 0.3.3 nao devolve): avisa', () => {
  const p = projeto();
  try {
    const r = rodar(p, Object.assign({}, REAL_SUBAGENT_STOP, { cwd: p.dir }));
    avisou(r, /vereditos/);
    assert.ok(/correcao/.test(r.json.systemMessage), 'a lente do payload real nao entrou na mensagem: ' + r.json.systemMessage);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

// ----------------------------------------------------------- o que nao grava e avisa

test('gravar-veredito: texto que nao e JSON nao grava e avisa', () => {
  const p = projeto();
  try {
    avisou(rodar(p, stop(p, 'Terminei a revisao, sem achados.')), /JSON/);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: mensagem vazia ou ausente nao grava e avisa', () => {
  const p = projeto();
  try {
    avisou(rodar(p, stop(p, '')), /vazia/);
    const sem = stop(p, 'x'); delete sem.last_assistant_message;
    avisou(rodar(p, sem), /vazia/);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: JSON invalido pela regua do apurar (sem melhor, achados que nao e lista) nao grava e avisa', () => {
  const p = projeto();
  try {
    const semMelhor = veredito(p); delete semMelhor.melhor;
    avisou(rodar(p, stop(p, JSON.stringify(semMelhor))), /melhor/);
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { achados: 'nada' })))), /achados/);
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { lente: '' })))), /lente/);
    avisou(rodar(p, stop(p, '[1, 2]')), /JSON/);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: lente desconhecida nao grava e avisa, sem inventar nome de arquivo', () => {
  const p = projeto();
  try {
    for (const lente of ['elogio', '../correcao', 'correcao/../x', 42]) {
      avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { lente: lente })))), /lente desconhecida/);
    }
    assert.deepStrictEqual(arquivosEm(p), []);
    assert.ok(!fs.existsSync(path.join(p.ronda, 'x.json')));
  } finally { limpar(p); }
});

test('gravar-veredito: sem o campo vereditos nao grava e avisa', () => {
  const p = projeto();
  try {
    const vd = veredito(p); delete vd.vereditos;
    avisou(rodar(p, stop(p, JSON.stringify(vd))), /vereditos/);
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { vereditos: 7 })))), /vereditos/);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: pasta que nao e de ronda nao grava e avisa', () => {
  const p = projeto();
  try {
    // fora de .claude/esquadro/revisao/, mesmo com A.txt e B.txt ao lado
    const solta = path.join(p.dir, 'outra', 'vereditos');
    fs.mkdirSync(solta, { recursive: true });
    fs.writeFileSync(path.join(p.dir, 'outra', 'A.txt'), 'a', 'utf8');
    fs.writeFileSync(path.join(p.dir, 'outra', 'B.txt'), 'b', 'utf8');
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { vereditos: solta })))), /nao e a pasta vereditos de uma ronda/);
    assert.deepStrictEqual(fs.readdirSync(solta), []);

    // pasta irma cujo nome so COMECA por vereditos, numa ronda que tem A.txt e B.txt
    const velha = path.join(p.ronda, 'vereditos-velha');
    fs.mkdirSync(velha);
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { vereditos: velha })))), /nao e a pasta vereditos de uma ronda/);
    assert.deepStrictEqual(fs.readdirSync(velha), []);

    // a propria pasta da ronda, e nao a vereditos dela
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { vereditos: p.ronda })))), /nao e a pasta vereditos de uma ronda/);
    assert.ok(!fs.existsSync(path.join(p.ronda, 'correcao.json')));

    // sobe com .. para fora da revisao e volta a um nome que parece certo
    const escapa = path.join(p.ronda, '..', '..', '..', '..', '..', 'outra', 'vereditos');
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { vereditos: escapa })))), /nao e a pasta vereditos de uma ronda/);
    assert.deepStrictEqual(fs.readdirSync(solta), []);
  } finally { limpar(p); }
});

test('gravar-veredito: ronda sem A.txt e B.txt ao lado nao grava e avisa', () => {
  const p = projeto();
  try {
    fs.rmSync(path.join(p.ronda, 'B.txt'));
    const r = rodar(p, stop(p, JSON.stringify(veredito(p))));
    avisou(r, /A\.txt e B\.txt/);
    // T4: o aviso diz QUAL pasta conferir
    assert.ok(r.json.systemMessage.includes('"' + p.vereditos + '"'), r.json.systemMessage);
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: pasta vereditos que nao existe nao e criada: avisa', () => {
  const p = projeto();
  try {
    fs.rmdirSync(p.vereditos);
    const r = rodar(p, stop(p, JSON.stringify(veredito(p))));
    avisou(r, /nao existe/);
    // T4: o aviso diz QUAL pasta nao existe
    assert.ok(r.json.systemMessage.includes('"' + p.vereditos + '"'), r.json.systemMessage);
    assert.ok(!fs.existsSync(p.vereditos));
  } finally { limpar(p); }
});

// -------------------------------------------------------------- nao sobrescreve

test('gravar-veredito: arquivo igual ja existe -> nada, e nada muda', () => {
  const p = projeto();
  try {
    const vd = veredito(p);
    calado(rodar(p, stop(p, JSON.stringify(vd))));
    const antes = fs.readFileSync(path.join(p.vereditos, 'correcao.json'));
    const antesMtime = fs.statSync(path.join(p.vereditos, 'correcao.json')).mtimeMs;
    const r = rodar(p, stop(p, JSON.stringify(vd)));
    calado(r);
    assert.ok(antes.equals(fs.readFileSync(path.join(p.vereditos, 'correcao.json'))));
    assert.strictEqual(fs.statSync(path.join(p.vereditos, 'correcao.json')).mtimeMs, antesMtime);
  } finally { limpar(p); }
});

test('gravar-veredito: arquivo escrito a mao, igual fora do campo vereditos, conta como igual', () => {
  const p = projeto();
  try {
    const vd = veredito(p);
    const aMao = Object.assign({}, vd); delete aMao.vereditos;
    fs.writeFileSync(path.join(p.vereditos, 'correcao.json'), JSON.stringify(aMao), 'utf8');
    calado(rodar(p, stop(p, JSON.stringify(vd))));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(p.vereditos, 'correcao.json'), 'utf8')), aMao);
  } finally { limpar(p); }
});

test('gravar-veredito: arquivo diferente ja existe -> nao sobrescreve e avisa', () => {
  const p = projeto();
  try {
    const antigo = veredito(p, { melhor: 'B', porQue: 'outra ronda', achados: [] });
    fs.writeFileSync(path.join(p.vereditos, 'correcao.json'), JSON.stringify(antigo), 'utf8');
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p)))), /ja existe correcao\.json com outro conteudo/);
    assert.deepStrictEqual(lerVeredito(p, 'correcao'), antigo);
  } finally { limpar(p); }
});

test('gravar-veredito: o que ja existe e nao se le (JSON quebrado, ou pasta no lugar) nao e sobrescrito: avisa', () => {
  const p = projeto();
  try {
    fs.writeFileSync(path.join(p.vereditos, 'correcao.json'), '{ quebrado', 'utf8');
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p)))), /nao consegui le-lo/);
    assert.strictEqual(fs.readFileSync(path.join(p.vereditos, 'correcao.json'), 'utf8'), '{ quebrado');
    fs.mkdirSync(path.join(p.vereditos, 'borda.json'));
    avisou(rodar(p, stop(p, JSON.stringify(veredito(p, { lente: 'borda' })))), /nao consegui le-lo/);
    assert.ok(fs.statSync(path.join(p.vereditos, 'borda.json')).isDirectory());
  } finally { limpar(p); }
});

// ------------------------------------------------------ de quem e o veredito

test('gravar-veredito: agent_type de outro agente (ou sem agent_type) -> nada', () => {
  const p = projeto();
  try {
    const msg = JSON.stringify(veredito(p));
    calado(rodar(p, stop(p, msg, { agent_type: 'desenvolvedor' })));
    calado(rodar(p, stop(p, msg, { agent_type: 'inspetor' })));
    calado(rodar(p, stop(p, msg, { agent_type: 'outro:esquadro:inspetor' })));
    const sem = stop(p, msg); delete sem.agent_type;
    calado(rodar(p, sem));
    calado(rodar(p, handback(p, msg, { agent_type: 'Explore' })));
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: outro evento, ou outra ferramenta no PostToolUse -> nada', () => {
  const p = projeto();
  try {
    const msg = JSON.stringify(veredito(p));
    calado(rodar(p, stop(p, msg, { hook_event_name: 'Stop' })));
    calado(rodar(p, stop(p, msg, { hook_event_name: 'SubagentStart' })));
    calado(rodar(p, handback(p, msg, { tool_name: 'Read' })));
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

// ------------------------------------------------ os dois caminhos de entrega

test('gravar-veredito: o handback (PostToolUse) grava a partir de tool_input.message', () => {
  const p = projeto();
  try {
    const vd = veredito(p, { lente: 'manutencao', achados: [] });
    const r = rodar(p, handback(p, '```json\n' + JSON.stringify(vd) + '\n```'));
    calado(r);
    assert.deepStrictEqual(lerVeredito(p, 'manutencao'), vd);
  } finally { limpar(p); }
});

test('gravar-veredito: o SubagentStop depois do handback que gravou fica calado (texto de encerramento)', () => {
  const p = projeto();
  try {
    const vd = veredito(p);
    calado(rodar(p, handback(p, JSON.stringify(vd))));
    const r = rodar(p, stop(p, 'Veredito entregue.'));
    calado(r);
    assert.deepStrictEqual(arquivosEm(p), ['correcao.json']);
  } finally { limpar(p); }
});

test('gravar-veredito: o SubagentStop depois do handback que JA AVISOU tambem fica calado (aviso uma vez so)', () => {
  const p = projeto();
  try {
    avisou(rodar(p, handback(p, JSON.stringify(veredito(p, { lente: 'elogio' })))), /lente desconhecida/);
    calado(rodar(p, stop(p, 'Veredito entregue.')));
  } finally { limpar(p); }
});

test('gravar-veredito: o silencio do SubagentStop e por inspetor: outro agent_id, sem handback, segue avisando', () => {
  const p = projeto();
  try {
    calado(rodar(p, handback(p, JSON.stringify(veredito(p)))));
    avisou(rodar(p, stop(p, 'Veredito entregue.', { agent_id: 'outro-inspetor' })), /JSON/);
  } finally { limpar(p); }
});

test('gravar-veredito: SubagentStop sem handback e sem JSON (encerramento solto) avisa', () => {
  const p = projeto();
  try {
    avisou(rodar(p, stop(p, 'Veredito entregue.')), /JSON/);
  } finally { limpar(p); }
});

test('gravar-veredito: os dois pontos disparando com o mesmo veredito gravam um arquivo so, sem aviso', () => {
  const p = projeto();
  try {
    const msg = JSON.stringify(veredito(p));
    calado(rodar(p, handback(p, msg)));
    calado(rodar(p, stop(p, msg)));   // caminho sem handback previo do mesmo agente: igual -> nada
    assert.deepStrictEqual(arquivosEm(p), ['correcao.json']);
  } finally { limpar(p); }
});

test('gravar-veredito: dois inspetores na mesma pasta gravam cada um o seu arquivo', () => {
  const p = projeto();
  try {
    calado(rodar(p, stop(p, JSON.stringify(veredito(p, { lente: 'correcao', achados: [] })), { agent_id: 'a1' })));
    calado(rodar(p, stop(p, JSON.stringify(veredito(p, { lente: 'escopo', melhor: 'B', achados: [] })), { agent_id: 'a2' })));
    assert.deepStrictEqual(arquivosEm(p), ['correcao.json', 'escopo.json']);
    assert.strictEqual(lerVeredito(p, 'escopo').melhor, 'B');
  } finally { limpar(p); }
});

test('gravar-veredito: vinte inspetores terminando juntos gravam vinte arquivos, sem aviso e sem perda', async () => {
  const p = projeto();
  try {
    const lentes = require('../scripts/lib/veredito.js').LENTES.concat(require('../scripts/lib/veredito.js').LENTES_UI);
    const rodadas = lentes.map((l, i) => new Promise((resolve) => {
      const f = spawn(process.execPath, [SCRIPT], { cwd: p.dir,
        env: Object.assign({}, process.env, { ESQUADRO_TMP: p.estado }) });
      let out = '';
      f.stdout.on('data', (d) => { out += d; });
      f.on('close', (status) => resolve({ status: status, stdout: out }));
      f.stdin.end(JSON.stringify(stop(p, JSON.stringify(veredito(p, { lente: l.chave, achados: [] })),
        { agent_id: 'par' + i })));
    }));
    const todas = await Promise.all(rodadas);
    for (const r of todas) { assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout.trim(), '', r.stdout); }
    assert.deepStrictEqual(arquivosEm(p), lentes.map((l) => l.chave + '.json').sort());
  } finally { limpar(p); }
});

// --------------------------------------------------------- nunca barra, nunca cai

test('gravar-veredito: entrada vazia, lixo e tipos absurdos saem com 0 e sem decision', () => {
  const p = projeto();
  try {
    for (const entrada of ['', 'isto nao e json', '[]', 'null', '{}']) semBarrar(rodar(p, entrada));
    for (const e of [{ hook_event_name: 'SubagentStop', agent_type: 'esquadro:inspetor', last_assistant_message: 7 },
      { hook_event_name: 'PostToolUse', agent_type: 'esquadro:inspetor', tool_name: 'SubagentHandback', tool_input: 'x' },
      { hook_event_name: 'PostToolUse', agent_type: 'esquadro:inspetor', tool_name: 'SubagentHandback' },
      { hook_event_name: 'SubagentStop', agent_type: 'esquadro:inspetor', cwd: 5, last_assistant_message: '{}' }]) {
      semBarrar(rodar(p, e));
    }
    assert.deepStrictEqual(arquivosEm(p), []);
  } finally { limpar(p); }
});

test('gravar-veredito: em nenhum caminho de aviso ha decision block, e o exit e 0', () => {
  const p = projeto();
  try {
    const ruins = [
      stop(p, ''), stop(p, 'sem json'), stop(p, JSON.stringify(veredito(p, { lente: 'elogio' }))),
      stop(p, JSON.stringify(veredito(p, { vereditos: '/nao/existe/vereditos' }))),
      stop(p, JSON.stringify(veredito(p, { melhor: 'C' }))), handback(p, 'sem json')
    ];
    for (const e of ruins) {
      const r = rodar(p, e);
      avisou(r);
      assert.ok(!/"decision"/.test(r.stdout), r.stdout);
      assert.ok(!/block/.test(r.stdout), r.stdout);
    }
  } finally { limpar(p); }
});

// ------------------------------------------------------------------ a fiacao

test('fiacao: o hooks.json liga o gravar-veredito no SubagentStop (inspetor) e no PostToolUse (SubagentHandback)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(RAIZ, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const chama = (g) => JSON.stringify(g.hooks || []).indexOf('gravar-veredito.js') !== -1;

  const gs = (hooks.SubagentStop || []).filter(chama);
  assert.strictEqual(gs.length, 1, 'SubagentStop sem o gravar-veredito, ou com ele duas vezes');
  assert.strictEqual(gs[0].matcher, '^esquadro:inspetor$');
  assert.ok(new RegExp(gs[0].matcher).test('esquadro:inspetor'));
  assert.ok(!new RegExp(gs[0].matcher).test('meu-esquadro:inspetor'));

  const gp = (hooks.PostToolUse || []).filter(chama);
  assert.strictEqual(gp.length, 1, 'PostToolUse sem o gravar-veredito, ou com ele duas vezes');
  assert.strictEqual(gp[0].matcher, 'SubagentHandback');
  // entrada propria: o grupo do marcar-trabalho nao pode herdar o matcher dele, nem o contrario
  assert.strictEqual(gp[0].hooks.length, 1);
  const marcador = (hooks.PostToolUse || []).filter((g) => JSON.stringify(g.hooks || []).indexOf('marcar-trabalho.js') !== -1);
  assert.strictEqual(marcador.length, 1);
  assert.ok(marcador[0] !== gp[0]);
  assert.ok(marcador[0].matcher.split('|').indexOf('SubagentHandback') === -1);

  for (const g of gs.concat(gp)) {
    for (const h of g.hooks) {
      assert.strictEqual(h.command, 'node');
      assert.ok(h.args[0].indexOf('${CLAUDE_PLUGIN_ROOT}/scripts/gravar-veredito.js') === 0, h.args[0]);
      assert.ok(fs.existsSync(path.join(RAIZ, 'scripts', 'gravar-veredito.js')));
      assert.ok(h.timeout > 0);
    }
  }
});

test('fiacao: o inspetor devolve a pasta vereditos e o briefing da skill a passa (D287)', () => {
  const inspetor = fs.readFileSync(path.join(RAIZ, 'agents', 'inspetor.md'), 'utf8');
  assert.ok(/"vereditos":/.test(inspetor), 'o formato do JSON do inspetor nao tem o campo vereditos');
  const skill = fs.readFileSync(path.join(RAIZ, 'skills', 'revisar', 'SKILL.md'), 'utf8');
  const briefing = skill.slice(skill.indexOf('Briefing de cada um'), skill.indexOf('A linha da r'));
  assert.ok(/vereditos/.test(briefing), 'o briefing nao passa o caminho da pasta vereditos');
  const passo2 = skill.slice(skill.indexOf('## Passo 2'), skill.indexOf('## Passo 3'));
  assert.ok(/hook/.test(passo2) && /gravar-veredito/.test(passo2), 'o Passo 2 nao diz que o hook grava');
  assert.ok(!/Grave cada resposta no caminho/.test(skill), 'a instrucao de gravar cada resposta a mao continua');
  assert.ok(/um\s+arquivo por lente/.test(passo2), 'o Passo 2 nao manda conferir um arquivo por lente');
});
