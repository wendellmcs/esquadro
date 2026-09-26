'use strict';
const glob = require('./glob.js');

const NIVEL = { rapida: 1, padrao: 2, aaa: 3 };
// AAA primeiro: caminho que casa em duas listas fica na mais rigorosa.
const ORDEM = ['aaa', 'padrao', 'rapida'];

/** D8: o rigor sai do caminho do arquivo, nunca da classificacao que o agente fez. */
function resolverMarcha(caminho, projeto) {
  const marchas = (projeto && projeto.marchas) || {};
  for (const m of ORDEM) {
    if (glob.casaAlgum(marchas[m], caminho)) return m;
  }
  const padrao = projeto && projeto.marchaPadrao;
  // X1: NIVEL e objeto literal, entao NIVEL["constructor"] herda de
  // Object.prototype e e truthy - e marchaPadrao:"constructor" desligava os
  // passos 4-5 do portao de escopo. hasOwnProperty.call pergunta se a chave e
  // PROPRIA de NIVEL, e nao estoura com valor vindo de JSON.parse: "__proto__"
  // devolve false (acessor herdado, nao proprio) e cai em 'padrao', o lado
  // rigoroso. Nao ha Symbol em JSON.
  return Object.prototype.hasOwnProperty.call(NIVEL, padrao) ? padrao : 'padrao';
}

function exigeEscopo(marcha) {
  return (NIVEL[marcha] || NIVEL.padrao) >= NIVEL.padrao;
}

/** D8: o agente pode subir de marcha, nunca descer. */
function podeSubir(de, para) {
  return (NIVEL[para] || 0) >= (NIVEL[de] || 0);
}

module.exports = { NIVEL, resolverMarcha, exigeEscopo, podeSubir };
