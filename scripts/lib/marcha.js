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

/**
 * D503 (plano d503, Tarefa 5): os arquivos mudados (caminho do tool_input) que resolvem para `aaa` e cujo tipo
 * (`cegar.tipoDaReferencia`, o mesmo do pacote da revisao) tem referencia de topo declarada no projeto.json.
 * Relativos a raiz. Referencia torta ou lista vazia vale como sem referencia (como no preparar-revisao.js, E4): o
 * validar e quem reprova. So leitura do que ja esta em memoria: o portao de fecho a chama sem custo de disco.
 */
function aaaComReferencia(arquivos, projeto, raiz) {
  const refs = projeto && projeto.referencias;
  // referencias torta (texto, numero, lista) nao tem a chave do tipo: cai em comLista falso, sem guarda propria.
  if (!refs || !Array.isArray(arquivos)) return [];
  const caminhoLib = require('./caminho.js');
  const design = require('./design.js');
  const cegar = require('./cegar.js');
  const comLista = function (tipo) {
    const lista = refs[tipo];
    return Array.isArray(lista) && lista.length > 0 &&
      lista.every(function (e) { return typeof e === 'string' && e.trim() !== ''; });
  };
  const achados = [];
  for (const arquivo of arquivos) {
    const rel = caminhoLib.relativoAoProjeto(arquivo, raiz);
    if (!rel || achados.indexOf(rel) !== -1 || resolverMarcha(rel, projeto) !== 'aaa') continue;
    if (comLista(cegar.tipoDaReferencia(rel, design.ehArquivoDeEstilo(rel, projeto)))) achados.push(rel);
  }
  return achados;
}

module.exports = { NIVEL, resolverMarcha, exigeEscopo, podeSubir, aaaComReferencia };
