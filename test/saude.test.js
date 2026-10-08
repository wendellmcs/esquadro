'use strict';
const test = require('node:test');
const assert = require('node:assert');
const saude = require('../scripts/lib/saude.js');

test('saude: sessao nova nao dispara nada', () => {
  const r = saude.avaliar({});
  assert.strictEqual(r.disparou, false);
  assert.deepStrictEqual(r.gatilhos, []);
  assert.strictEqual(r.aviso, null);
});

test('saude: basta UM gatilho, nao a soma', () => {
  const r = saude.avaliar({ contadores: { revisao_fechada: 2 } });
  assert.strictEqual(r.disparou, true);
  assert.strictEqual(r.gatilhos.length, 1);
});

test('saude: 2 revisoes independentes fechadas disparam', () => {
  assert.strictEqual(saude.avaliar({ contadores: { revisao_fechada: 2 } }).disparou, true);
  assert.strictEqual(saude.avaliar({ contadores: { revisao_fechada: 1 } }).disparou, false);
});

test('saude: turnos com trabalho real disparam no limiar', () => {
  const limiares = { turnosComTrabalho: 12 };
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 11 }, limiares).disparou, false);
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 12 }, limiares).disparou, true);
});

test('saude: soma de bloqueios de portao dispara', () => {
  const e = { contadores: { fora_do_escopo: 3, comando_destrutivo: 2, fecho_sem_evidencia: 1 } };
  const r = saude.avaliar(e, { bloqueios: 5 });
  assert.strictEqual(r.disparou, true);
  assert.ok(r.gatilhos.some((g) => g.includes('bloqueio')));
});

test('saude: nome do gatilho aparece no aviso, para nao virar sensacao', () => {
  const r = saude.avaliar({ contadores: { revisao_fechada: 2 } });
  assert.ok(r.aviso.includes('revis'));
  assert.ok(r.aviso.includes('/esquadro:handoff'));
  assert.ok(/^[\x20-\x7E\n]+$/.test(r.aviso), 'aviso tem de ser ASCII (R5)');
});

test('saude: dois gatilhos ao mesmo tempo saem os dois no aviso', () => {
  const r = saude.avaliar({ turnosComTrabalho: 99, contadores: { revisao_fechada: 9 } });
  assert.strictEqual(r.gatilhos.length, 2);
});

test('saude: limiares do projeto sobrescrevem os padroes', () => {
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 3 }, { turnosComTrabalho: 3 }).disparou, true);
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 3 }).disparou, false);
});

test('saude: avisa uma vez so por sessao', () => {
  const e = { contadores: { revisao_fechada: 2 }, avisouSaude: true };
  assert.strictEqual(saude.avaliar(e).disparou, false);
});

// ------------------------------- T10-2/T10-3 (D357): decisao do dono e commit contam

test('T10-2: tres decisoes do dono respondidas disparam, e duas nao', () => {
  const dois = saude.avaliar({ decisoesDoDono: 2 });
  assert.strictEqual(dois.disparou, false);
  const tres = saude.avaliar({ decisoesDoDono: 3 });
  assert.strictEqual(tres.disparou, true);
  assert.deepStrictEqual(tres.gatilhos, ['3 decisoes do dono respondidas (limiar 3)']);
  assert.strictEqual(saude.LIMIARES_PADRAO.decisoesDoDono, 3);
});

test('T10-3: tres commits na sessao disparam, e dois nao', () => {
  const dois = saude.avaliar({ commitsFeitos: 2 });
  assert.strictEqual(dois.disparou, false);
  const tres = saude.avaliar({ commitsFeitos: 3 });
  assert.strictEqual(tres.disparou, true);
  assert.deepStrictEqual(tres.gatilhos, ['3 commits nesta sessao (limiar 3)']);
  assert.strictEqual(saude.LIMIARES_PADRAO.commits, 3);
});

test('T10-2/3: o projeto sobrescreve os dois limiares, e o aviso segue ASCII', () => {
  assert.strictEqual(saude.avaliar({ decisoesDoDono: 1 }, { decisoesDoDono: 1 }).disparou, true);
  assert.strictEqual(saude.avaliar({ commitsFeitos: 1 }, { commits: 1 }).disparou, true);
  const r = saude.avaliar({ decisoesDoDono: 5, commitsFeitos: 5 });
  assert.strictEqual(r.gatilhos.length, 2);
  assert.ok(/^[\x20-\x7E\n]+$/.test(r.aviso), 'aviso tem de ser ASCII (R5)');
});

test('T10-2/3: valor que nao e numero no estado nunca dispara (estado corrompido nao vira aviso)', () => {
  assert.strictEqual(saude.avaliar({ decisoesDoDono: { campo: 'x' }, commitsFeitos: 'muitos' }).disparou, false);
});
