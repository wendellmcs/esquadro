'use strict';
const marchaLib = require('./marcha.js');
const degraus = require('./degraus.js');

// Vazia por padrao: sem escada configurada, o portao nao opina.
// A entrevista pergunta a escada deste projeto e grava em projeto.json:agentes.escada.
const ESCADA_PADRAO = [];

function escada(projeto) {
  const e = projeto && projeto.agentes && projeto.agentes.escada;
  return Array.isArray(e) ? e : ESCADA_PADRAO;
}

/** 0 = fora da escada, e portanto fora do julgamento deste portao. */
function nivelDoAgente(tipo, projeto) {
  const lista = escada(projeto);
  const i = lista.indexOf(String(tipo || ''));
  return i === -1 ? 0 : i + 1;
}

/** A marcha mais alta entre os caminhos do escopo declarado. Sem escopo, nao ha teto. */
function marchaMaximaDoEscopo(esc, projeto) {
  if (!esc || !Array.isArray(esc.dentro) || esc.dentro.length === 0) return 'aaa';
  let maxima = 'rapida';
  for (const caminho of esc.dentro) {
    const m = marchaLib.resolverMarcha(caminho, projeto);
    if (marchaLib.NIVEL[m] > marchaLib.NIVEL[maxima]) maxima = m;
  }
  return maxima;
}

/**
 * F18: agente do topo da escada em trabalho que so toca caminho de marcha rapida
 * e desproporcao mensuravel. Nas outras marchas o portao nao opina:
 * rigor e eixo independente do custo, e modelo barato pode passar por portao rigoroso.
 */
function permitido(tipo, marchaMax, projeto) {
  const lista = escada(projeto);
  // Ronda 1 do 8c.5: o mesmo limite que o relatorio de cobertura acusa, e nao um 2 cru.
  if (lista.length < degraus.MINIMO) return { ok: true, motivo: null };
  if (marchaMax !== 'rapida') return { ok: true, motivo: null };

  const nivel = nivelDoAgente(tipo, projeto);
  if (nivel === 0) return { ok: true, motivo: null };
  const metade = Math.ceil(lista.length / 2);
  if (nivel <= metade) return { ok: true, motivo: null };

  return {
    ok: false,
    motivo: [
      'esquadro - roteamento por custo.',
      '',
      'Voce despachou "' + tipo + '", que esta no topo da escada deste projeto,',
      'para um trabalho cujo escopo declarado so toca caminho de marcha rapida.',
      '',
      'Na duvida entre dois modelos, o mais barato. Os agentes escalam sozinhos',
      'quando a tarefa excede o escopo deles.',
      '',
      'Escada deste projeto, do mais barato ao mais caro:',
      lista.map(function (a, i) { return '  ' + (i + 1) + '. ' + a; }).join('\n'),
      '',
      'Se o trabalho realmente exige este agente, acrescente ao escopo o caminho',
      'de marcha padrao ou AAA que justifica a escolha - e a escolha fica visivel.'
    ].join('\n')
  };
}

module.exports = { ESCADA_PADRAO, nivelDoAgente, marchaMaximaDoEscopo, permitido };
