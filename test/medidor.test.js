'use strict';
const test = require('node:test');
const assert = require('node:assert');
const saude = require('../scripts/lib/saude.js');
const medidor = require('../scripts/lib/medidor.js');

// Bloco M / M1 (D435): o medidor da sessao. A regra dos gatilhos mora em saude.js (fonte unica);
// o medidor so formata. Desenho: .context/plans/2026-10-11-esquadro-bloco-m-desenho.md.

const ASCII = /^[\x20-\x7E\n]*$/;

function uso(extra) {
  return Object.assign({
    startedAt: 0,
    context: { tokens: 46900, window: 1000000, percent: 5 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 49, resetsAt: '2026-10-11T23:20:00.000Z' },
      { kind: 'seven_day', percentUsed: 92, resetsAt: '2026-10-15T07:00:00.000Z' }
    ],
    cost: { usd: 4.1 }
  }, extra || {});
}

function hhmm(iso) {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// --- saude.medir: os 7 gatilhos contaveis, cruzados ou nao ---

test('medir: devolve os 7 gatilhos na ordem do avaliar, com valor e limiar', () => {
  const m = saude.medir({}, null);
  assert.deepStrictEqual(m.map(function (g) { return g.chave; }),
    ['turnosComTrabalho', 'revisoesFechadas', 'bloqueios', 'arquivosTocados', 'decisoesDoDono', 'commits', 'tokensDeContexto']);
  for (const g of m) {
    assert.strictEqual(g.valor, 0, g.chave);
    assert.strictEqual(g.limiar, saude.LIMIARES_PADRAO[g.chave], g.chave);
    assert.strictEqual(g.cruzou, false, g.chave);
    assert.ok(typeof g.nome === 'string' && g.nome.length > 0 && ASCII.test(g.nome), g.chave);
  }
});

test('medir: soma os baldes de bloqueio e respeita o limiar do projeto', () => {
  const m = saude.medir({ contadores: { fora_do_escopo: 2, cd_solto: 1 } }, { bloqueios: 3 });
  const b = m.find(function (g) { return g.chave === 'bloqueios'; });
  assert.strictEqual(b.valor, 3);
  assert.strictEqual(b.limiar, 3);
  assert.strictEqual(b.cruzou, true);
});

test('medir: NAO se cala com avisouSaude (o aviso ja dado nao zera o painel)', () => {
  const m = saude.medir({ avisouSaude: true, contadores: { revisao_fechada: 17 } }, null);
  const r = m.find(function (g) { return g.chave === 'revisoesFechadas'; });
  assert.strictEqual(r.valor, 17);
  assert.strictEqual(r.cruzou, true);
});

test('medir: estado corrompido nunca cruza (texto/objeto onde se espera numero ou lista)', () => {
  const m = saude.medir({ decisoesDoDono: '9', commitsFeitos: {}, arquivosTocados: 'a,b' }, null);
  for (const g of m) assert.strictEqual(g.cruzou, false, g.chave);
});

test('medir: o texto de todo gatilho, cruzado ou nao, usa o valor normalizado (revisao cega do M, saude A:62)', () => {
  for (const e of [{}, null, { turnosComTrabalho: null }]) {
    for (const g of saude.medir(e, null)) {
      assert.ok(g.texto.indexOf('undefined') === -1 && g.texto.indexOf('null') === -1, g.texto);
      assert.ok(g.texto.indexOf(String(g.valor) + ' ') === 0, g.texto);
    }
  }
});

test('medir x avaliar: os gatilhos do avaliar sao exatamente os textos que o medir cruzou', () => {
  const casos = [
    {},
    { contadores: { revisao_fechada: 2 } },
    { turnosComTrabalho: 15, arquivosTocados: new Array(25).fill('x'), decisoesDoDono: 3, commitsFeitos: 3 },
    { contadores: { fora_do_escopo: 6 } },
    { turnosComTrabalho: 14, contadores: { revisao_fechada: 1 }, decisoesDoDono: 2 }
  ];
  for (const e of casos) {
    const cruzados = saude.medir(e, null).filter(function (g) { return g.cruzou; }).map(function (g) { return g.texto; });
    assert.deepStrictEqual(saude.avaliar(e, null).gatilhos, cruzados, JSON.stringify(e));
  }
});

// --- saude.acumular: turno + sessao, a mesma conta do portao-fecho ---

test('acumular: soma o balde do turno no da sessao sem mexer nos objetos de entrada', () => {
  const s = { contadores: { revisao_fechada: 1, cd_solto: 1 }, contadoresSessao: { revisao_fechada: 2 } };
  const a = saude.acumular(s);
  assert.deepStrictEqual(a, { revisao_fechada: 3, cd_solto: 1 });
  assert.deepStrictEqual(s.contadoresSessao, { revisao_fechada: 2 });
});

test('acumular: estado vazio da objeto vazio', () => {
  assert.deepStrictEqual(saude.acumular({}), {});
  assert.deepStrictEqual(saude.acumular(null), {});
});

// --- medidor.linhaDaSessao ---

test('linha curta: contexto, janelas com hora de renovar, custo e troca de chat, em ASCII', () => {
  const r = medidor.linhaDaSessao({ uso: uso(), amostras: [], medidas: saude.medir({}, null), avisouSaude: false });
  assert.ok(ASCII.test(r.curta), JSON.stringify(r.curta));
  assert.ok(r.curta.indexOf('\n') === -1, 'curta e UMA linha');
  assert.ok(r.curta.indexOf('contexto 5%') !== -1, r.curta);
  assert.ok(r.curta.indexOf('5h 49% (renova ' + hhmm('2026-10-11T23:20:00.000Z') + ')') !== -1, r.curta);
  assert.ok(r.curta.indexOf('semana 92%') !== -1, r.curta);
  assert.ok(r.curta.indexOf('US$ 4.10') !== -1, r.curta);
  assert.ok(/troca: 0 de 7/.test(r.curta), r.curta);
  assert.strictEqual(r.cruzou, false);
});

test('linha curta: campo que o motor nao deu e omitido, nunca vira 0', () => {
  const r = medidor.linhaDaSessao({
    uso: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] },
    amostras: [], medidas: saude.medir({}, null), avisouSaude: false
  });
  assert.ok(r.curta.indexOf('contexto') === -1, r.curta);
  assert.ok(r.curta.indexOf('5h') === -1 && r.curta.indexOf('semana') === -1, r.curta);
  assert.ok(r.curta.indexOf('US$') === -1, r.curta);
  assert.ok(/troca: 0 de 7/.test(r.curta), r.curta);
});

test('gatilho cruzado: cruzou true e a curta manda ao handoff', () => {
  const r = medidor.linhaDaSessao({ uso: uso(), amostras: [], medidas: saude.medir({ contadores: { revisao_fechada: 17 } }, null), avisouSaude: false });
  assert.strictEqual(r.cruzou, true);
  assert.ok(/troca: 1 de 7 cruzou -> \/esquadro:handoff/.test(r.curta), r.curta);
  assert.ok(r.longa.indexOf('17 de 2') !== -1, r.longa);
  assert.ok(/handoff/.test(r.longa), r.longa);
});

test('aviso ja dado: a curta diz isso em vez de contar (o fecho zera os contadores depois do aviso)', () => {
  const r = medidor.linhaDaSessao({ uso: uso(), amostras: [], medidas: saude.medir({}, null), avisouSaude: true });
  assert.ok(/troca: aviso ja dado/.test(r.curta), r.curta);
  assert.strictEqual(r.cruzou, true, 'o aviso ja dado segue pedindo a troca');
});

test('previsao: sem 2 turnos com subida, nada de numero inventado', () => {
  const um = medidor.linhaDaSessao({ uso: uso(), amostras: [{ tokens: 40000, cincoH: 45 }, { tokens: 46900, cincoH: 49 }], medidas: saude.medir({}, null), avisouSaude: false });
  assert.ok(um.curta.indexOf('turnos') === -1, um.curta);
  assert.ok(/previsao: sem dado/.test(um.longa), um.longa);
  const parado = medidor.linhaDaSessao({ uso: uso(), amostras: [{ tokens: 46900, cincoH: 49 }, { tokens: 46900, cincoH: 49 }, { tokens: 46900, cincoH: 49 }], medidas: saude.medir({}, null), avisouSaude: false });
  assert.ok(/previsao: sem dado/.test(parado.longa), parado.longa);
});

test('previsao: media da subida por turno -> turnos ate o fim do contexto e da janela de 5h', () => {
  // contexto sobe 10000 por turno: (1000000 - 46900) / 10000 = 95.31 -> ~95; 5h sobe 2 por turno: (100 - 49) / 2 = 25.5 -> ~25
  const amostras = [{ tokens: 26900, cincoH: 45 }, { tokens: 36900, cincoH: 47 }, { tokens: 46900, cincoH: 49 }];
  const r = medidor.linhaDaSessao({ uso: uso(), amostras: amostras, medidas: saude.medir({}, null), avisouSaude: false });
  assert.ok(r.longa.indexOf('contexto chega ao fim em ~95 turnos') !== -1, r.longa);
  assert.ok(r.longa.indexOf('janela 5h acaba em ~25 turnos') !== -1, r.longa);
  assert.ok(r.curta.indexOf('5h acaba em ~25 turnos') !== -1, r.curta);
  assert.ok(ASCII.test(r.longa), JSON.stringify(r.longa));
});

test('previsao: contexto ou janela ja no fim nunca dao turnos negativos (revisao cega do M, medidor A:57/A:62)', () => {
  const amostras = [{ tokens: 990000, cincoH: 99 }, { tokens: 1000000, cincoH: 101 }, { tokens: 1010000, cincoH: 103 }];
  const passado = uso({
    context: { tokens: 1010000, window: 1000000, percent: 101 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 103, resetsAt: '2026-10-11T23:20:00.000Z' }]
  });
  const r = medidor.linhaDaSessao({ uso: passado, amostras: amostras, medidas: saude.medir({}, null), avisouSaude: false });
  assert.ok(r.longa.indexOf('~-') === -1 && r.curta.indexOf('~-') === -1, r.longa + '\n' + r.curta);
  assert.ok(r.longa.indexOf('contexto chega ao fim em ~0 turnos') !== -1, r.longa);
  assert.ok(r.curta.indexOf('5h acaba em ~0 turnos') !== -1, r.curta);
});

test('longa: cada gatilho com nome, valor e limiar, e o que fazer', () => {
  const r = medidor.linhaDaSessao({ uso: uso(), amostras: [], medidas: saude.medir({ turnosComTrabalho: 3 }, null), avisouSaude: false });
  assert.ok(r.longa.indexOf('3 de 15') !== -1, r.longa);
  assert.ok(/o que fazer:/.test(r.longa), r.longa);
  assert.ok(ASCII.test(r.longa), JSON.stringify(r.longa));
});

// D442/2 (print do dono, s70): o painel do VS Code renderiza a longa como Markdown; sem linha em branco, o
// "o que fazer" virava continuacao do ultimo item da lista de gatilhos ("... 0 de 3 o que fazer: ...").
test('D442/2: longa separa o "o que fazer" da lista com uma linha em branco, com e sem aviso dado', () => {
  for (const avisou of [false, true]) {
    const r = medidor.linhaDaSessao({ uso: uso(), amostras: [], medidas: saude.medir({}, null), avisouSaude: avisou });
    assert.ok(/\n\no que fazer: /.test(r.longa), JSON.stringify(r.longa));
  }
});

// D442/11 (M-15 a M-22): o motor manda numero com casas e, se vier incompleto, o texto mostrava "undefined",
// "Infinity" ou contava gatilho que nao listava. Campo que o motor nao deu e omitido, nunca inventado.
test('D442/11: percentual arredondado; janela sem kind e gatilho incompleto omitidos; nada de undefined/Infinity', () => {
  const torto = uso({
    context: { tokens: 46900, window: 1000000, percent: 4.6899999 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 37.29999, resetsAt: '2026-10-11T23:20:00.000Z' },
      { percentUsed: 40 },
      { kind: 'seven_day', percentUsed: 92.5, resetsAt: '2026-10-15T07:00:00.000Z' }
    ]
  });
  const certas = saude.medir({}, null);
  const medidas = [null, { cruzou: true }, { nome: 'x', cruzou: false }].concat(certas);
  // subida media de 1e-320 por turno: (1000000 - 46900) / 1e-320 = Infinity
  const tokensSobemQuaseNada = [{ tokens: 0 }, { tokens: 1e-320 }, { tokens: 2e-320 }];
  assert.strictEqual((1000000 - 46900) / 1e-320, Infinity, 'o caso nao exercita o Infinity');
  const r = medidor.linhaDaSessao({ uso: torto, amostras: tokensSobemQuaseNada, medidas: medidas, avisouSaude: false });
  const tudo = r.curta + '\n' + r.longa;
  assert.ok(!/undefined|Infinity|NaN|null/.test(tudo), tudo);
  assert.ok(r.curta.indexOf('contexto 5%') !== -1 && r.curta.indexOf('5h 37%') !== -1 && r.curta.indexOf('semana 93%') !== -1, r.curta);
  assert.ok(r.longa.indexOf('janela 5h: 37% usada') !== -1, r.longa);
  assert.strictEqual(r.cruzou, false, 'gatilho sem nome/valor/limiar nao cruza a troca');
  assert.ok(new RegExp('troca: 0 de ' + certas.length + ' gatilhos').test(r.curta), r.curta);
  assert.strictEqual((r.longa.match(/^  - /gm) || []).length, certas.length, r.longa);
});

test('entrada torta nao lanca: devolve curta com so a troca de chat', () => {
  const r = medidor.linhaDaSessao({ uso: null, amostras: 'x', medidas: null, avisouSaude: false });
  assert.ok(typeof r.curta === 'string' && r.curta.indexOf('esquadro') === 0, r.curta);
});
