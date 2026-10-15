'use strict';
// Pedido 32 (plano dos pedidos 30-32, Tarefa 4 subitem 3): um botao por comando na faixa do mod, na hora certa.
// scripts/lib/botoes.js decide quais valem agora, pelos sinais que ja existem (tabela do §2 do plano), e devolve a
// lista na ordem de prioridade; o sessao.js a repassa e o mod desenha o primeiro que a pessoa ainda nao usou.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const botoes = require('../scripts/lib/botoes.js');
const correcao = require('../scripts/lib/correcao.js');
const calibracao = require('../scripts/lib/calibracao.js');

const RAIZ = path.join(os.tmpdir(), 'esquadro-botoes-raiz');
const COM_REF = { marchas: { aaa: ['src/**'] }, referencias: { codigo: ['ref/topo.js'] } };
const SO_AAA = { marchas: { aaa: ['src/**'] } };

/** A entrada minima: projeto configurado, nada aceso. Cada teste liga um sinal so. */
function base(extra) {
  return Object.assign({ cruzou: false, s: {}, projeto: {}, raiz: RAIZ, temProjeto: true, resposta: '',
    padraoCarregado: false, contarConversas: function () { return 0; } }, extra || {});
}

function nomes(lista) { return lista.map(function (b) { return b.nome; }); }

test('botoes: nada aceso, nenhum botao', () => {
  assert.deepStrictEqual(botoes.daSessao(base()), []);
});

test('botoes: a ordem de prioridade e a do plano (handoff > revisar > aprender > init > auditar > calibrar > paralelo > padrao)', () => {
  assert.deepStrictEqual(botoes.ORDEM, ['handoff', 'revisar', 'aprender', 'init', 'auditar', 'calibrar', 'paralelo', 'padrao']);
});

test('botao handoff: o gatilho contavel cruzou', () => {
  const b = botoes.daSessao(base({ cruzou: true }));
  assert.deepStrictEqual(nomes(b), ['handoff']);
  assert.strictEqual(b[0].comando, '/esquadro:handoff');
  assert.strictEqual(b[0].rotulo, 'gerar handoff');
  assert.match(b[0].texto, /troca de chat/);
});

test('botao revisar: arquivo AAA com referencia mudado e nenhuma revisao contra ela fechada (a condicao do portao, D503)', () => {
  // manual carregado: o arquivo AAA nao acende tambem o do padrao, e o teste olha so o do revisar
  const s = { arquivosTocados: [path.join(RAIZ, 'src', 'a.js')] };
  const b = botoes.daSessao(base({ s: s, projeto: COM_REF, padraoCarregado: true }));
  assert.deepStrictEqual(nomes(b), ['revisar']);
  assert.strictEqual(b[0].comando, '/esquadro:revisar src/a.js', 'o comando ja leva o arquivo');
  // o sinal passa: a revisao contra a referencia fechou (o balde que o apurar-ronda.js grava)
  const fechada = Object.assign({}, s, { contadores: { revisao_referencia_fechada: 1 } });
  assert.deepStrictEqual(botoes.daSessao(base({ s: fechada, projeto: COM_REF, padraoCarregado: true })), []);
  // sem referencia declarada, nao e o do revisar
  assert.deepStrictEqual(nomes(botoes.daSessao(base({ s: s, projeto: SO_AAA, padraoCarregado: true }))), []);
});

test('botao aprender: o ultimo prompt do dono pareceu correcao e o abrir-turno sugeriu (espera cheia)', () => {
  const s = { esperaAprender: correcao.ESPERA_ENTRE_SUGESTOES };
  const b = botoes.daSessao(base({ s: s }));
  assert.deepStrictEqual(nomes(b), ['aprender']);
  assert.strictEqual(b[0].comando, '/esquadro:aprender');
  // o sinal passa no prompt seguinte (a espera desce)
  assert.deepStrictEqual(botoes.daSessao(base({ s: { esperaAprender: correcao.ESPERA_ENTRE_SUGESTOES - 1 } })), []);
});

test('botao init: projeto sem .claude/esquadro/projeto.json', () => {
  const b = botoes.daSessao(base({ temProjeto: false, projeto: null }));
  assert.deepStrictEqual(nomes(b), ['init']);
  assert.strictEqual(b[0].comando, '/esquadro:init');
});

test('botao auditar: a auditoria automatica da abertura avisou nesta sessao', () => {
  const b = botoes.daSessao(base({ s: { auditoriaAvisou: true } }));
  assert.deepStrictEqual(nomes(b), ['auditar']);
  assert.strictEqual(b[0].comando, '/esquadro:auditar');
});

test('botao calibrar: amostra minima de conversas e o limiar de contexto nunca calibrado', () => {
  const minimo = calibracao.AMOSTRA_MINIMA.sessoes;
  const b = botoes.daSessao(base({ contarConversas: function () { return minimo; } }));
  assert.deepStrictEqual(nomes(b), ['calibrar']);
  assert.strictEqual(b[0].comando, '/esquadro:calibrar');
  assert.ok(b[0].texto.indexOf(String(minimo)) !== -1, 'o texto diz quantas conversas: ' + b[0].texto);
  assert.deepStrictEqual(botoes.daSessao(base({ contarConversas: function () { return minimo - 1; } })), [], 'abaixo do minimo');
  // ja calibrado: nem conta as conversas
  let contou = false;
  const calibrado = base({ projeto: { limiares: { tokensDeContexto: 150000 } },
    contarConversas: function () { contou = true; return minimo; } });
  assert.deepStrictEqual(botoes.daSessao(calibrado), []);
  assert.strictEqual(contou, false, 'com o limiar gravado, nao conta conversa nenhuma');
  // sem projeto.json o calibrar nao grava: vale o init
  assert.deepStrictEqual(nomes(botoes.daSessao(base({ temProjeto: false, projeto: null,
    contarConversas: function () { return minimo; } }))), ['init']);
});

test('botao paralelo: a ultima resposta do agente ofereceu /esquadro:paralelo', () => {
  const b = botoes.daSessao(base({ resposta: 'Sao 3 tarefas independentes: ofereco o /esquadro:paralelo com 3 agentes Haiku.' }));
  assert.deepStrictEqual(nomes(b), ['paralelo']);
  assert.strictEqual(b[0].comando, '/esquadro:paralelo');
  assert.deepStrictEqual(botoes.daSessao(base({ resposta: 'Pronto, sem paralelo.' })), []);
});

test('botao padrao: arquivo AAA mudado e o manual de execucao nao carregado na sessao', () => {
  const s = { arquivosTocados: [path.join(RAIZ, 'src', 'a.js')] };
  const b = botoes.daSessao(base({ s: s, projeto: SO_AAA }));
  assert.deepStrictEqual(nomes(b), ['padrao']);
  assert.strictEqual(b[0].comando, '/esquadro:padrao');
  assert.deepStrictEqual(botoes.daSessao(base({ s: s, projeto: SO_AAA, padraoCarregado: true })), [], 'carregado: passa');
  assert.deepStrictEqual(botoes.daSessao(base({ s: { arquivosTocados: [path.join(RAIZ, 'docs', 'b.md')] }, projeto: SO_AAA })), [],
    'arquivo fora da AAA nao pede o manual');
});

test('botoes: tudo aceso sai na ordem de prioridade', () => {
  const s = { arquivosTocados: [path.join(RAIZ, 'src', 'a.js')], esperaAprender: correcao.ESPERA_ENTRE_SUGESTOES,
    auditoriaAvisou: true };
  const b = botoes.daSessao(base({ cruzou: true, s: s, projeto: COM_REF, resposta: '/esquadro:paralelo',
    contarConversas: function () { return 999; } }));
  assert.deepStrictEqual(nomes(b), ['handoff', 'revisar', 'aprender', 'auditar', 'calibrar', 'paralelo', 'padrao']);
  b.forEach(function (x) {
    assert.match(x.comando, /^\/esquadro:[a-z]+( \S.*)?$/, 'comando do esquadro: ' + x.comando);
    assert.ok(/^[\x20-\x7e]+$/.test(x.texto + x.rotulo), 'ASCII (R5): ' + x.texto + ' / ' + x.rotulo);
  });
});

test('botoes: estado torto nao lanca (arquivosTocados que nao e lista, contador que nao e numero)', () => {
  assert.deepStrictEqual(botoes.daSessao(base({ s: { arquivosTocados: 'x', contadores: 'y' }, projeto: COM_REF })), []);
  assert.deepStrictEqual(botoes.daSessao({}), []);
});

test('conversasDoProjeto: conta os .jsonl da pasta uma vez por dia (marca no cache)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-botoes-'));
  try {
    const pasta = path.join(dir, 'transcricoes');
    fs.mkdirSync(pasta);
    ['a.jsonl', 'b.jsonl', 'c.jsonl', 'nota.txt'].forEach(function (n) { fs.writeFileSync(path.join(pasta, n), '{}\n'); });
    const cache = path.join(dir, 'cache', 'calibrar.json');
    const dia1 = Date.UTC(2026, 9, 15, 12);
    assert.strictEqual(botoes.conversasDoProjeto(pasta, cache, dia1), 3);
    fs.writeFileSync(path.join(pasta, 'd.jsonl'), '{}\n');
    assert.strictEqual(botoes.conversasDoProjeto(pasta, cache, dia1 + 3600000), 3, 'no mesmo dia vale a marca');
    assert.strictEqual(botoes.conversasDoProjeto(pasta, cache, dia1 + 86400000), 4, 'no dia seguinte conta de novo');
    // a pasta do estado e uma so para todos os projetos: outro projeto no mesmo dia nao herda a contagem
    const outra = path.join(dir, 'outro-projeto');
    fs.mkdirSync(outra);
    fs.writeFileSync(path.join(outra, 'x.jsonl'), '{}\n');
    assert.strictEqual(botoes.conversasDoProjeto(outra, cache, dia1 + 86400000), 1, 'outra pasta, outra contagem');
    assert.strictEqual(botoes.conversasDoProjeto(null, cache, dia1), 0, 'sem pasta de transcricoes');
    assert.strictEqual(botoes.conversasDoProjeto(path.join(dir, 'nao-existe'), path.join(dir, 'c2.json'), dia1), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
