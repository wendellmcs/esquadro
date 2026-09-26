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
