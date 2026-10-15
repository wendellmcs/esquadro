'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Pedido 32 (plano dos pedidos 30-32, Tarefa 4 subitem 3): um botao por comando na faixa do mod, na hora certa.
// Cada gatilho usa um sinal que ja existe (tabela do §2 do plano); nenhum processo novo por turno. O sessao.js
// devolve a lista na ordem de prioridade e o mod desenha o primeiro que a pessoa ainda nao usou.
// R5: texto e rotulo em ASCII - chegam a tela do motor.

const ORDEM = ['handoff', 'revisar', 'aprender', 'init', 'auditar', 'calibrar', 'paralelo', 'padrao'];

const RE_PARALELO = /\/esquadro:paralelo\b/;

function botao(nome, texto, rotulo, comando) {
  return { nome: nome, texto: texto, rotulo: rotulo, comando: comando || '/esquadro:' + nome };
}

/** Algum arquivo da sessao, relativo a raiz, resolve para `aaa`? Lista torta = nenhum. */
function temArquivoAaa(arquivos, projeto, raiz) {
  if (!Array.isArray(arquivos)) return false;
  const caminho = require('./caminho.js');
  const marcha = require('./marcha.js');
  return arquivos.some(function (a) {
    const rel = caminho.relativoAoProjeto(a, raiz);
    return Boolean(rel) && marcha.resolverMarcha(rel, projeto) === 'aaa';
  });
}

/**
 * Os botoes que valem agora, na ordem de ORDEM. Entrada (o que o sessao.js ja tem):
 * - `cruzou`: o gatilho contavel da troca de chat (medidor);
 * - `s`: o estado da sessao (arquivosTocados, contadores, esperaAprender, auditoriaAvisou);
 * - `projeto`, `raiz`, `temProjeto` (existe .claude/esquadro/projeto.json);
 * - `resposta`: a ultima resposta do agente principal (o mod manda); `padraoCarregado`: o mod viu a skill carregada;
 * - `contarConversas()`: as conversas do projeto, chamada so quando o resto do calibrar ja vale (custa um readdir).
 */
function daSessao(entrada) {
  const e = entrada || {};
  const s = e.s && typeof e.s === 'object' ? e.s : {};
  const projeto = e.projeto && typeof e.projeto === 'object' ? e.projeto : null;
  const lista = [];

  if (e.cruzou === true) lista.push(botao('handoff', 'troca de chat - gatilho contavel cruzou.', 'gerar handoff'));

  // A condicao do portao da referencia (D503, Tarefa 5): arquivo AAA com referencia de topo e nenhuma revisao contra
  // ela fechada na sessao. O comando ja leva o primeiro arquivo.
  const fechadas = require('./saude.js').acumular(s).revisao_referencia_fechada;
  if (projeto && !(fechadas > 0)) {
    const comRef = require('./marcha.js').aaaComReferencia(s.arquivosTocados, projeto, e.raiz);
    if (comRef.length) {
      lista.push(botao('revisar', 'arquivo AAA com referencia mudou e nenhuma revisao contra ela fechou.', 'revisar',
        '/esquadro:revisar ' + comRef[0]));
    }
  }

  // O abrir-turno.js poe a espera cheia no prompt em que sugere o aprender; o prompt seguinte ja a desce.
  if (s.esperaAprender === require('./correcao.js').ESPERA_ENTRE_SUGESTOES) {
    lista.push(botao('aprender', 'parece uma correcao - virar regra?', 'aprender'));
  }

  if (e.temProjeto === false) lista.push(botao('init', 'projeto sem configuracao do esquadro.', 'configurar'));

  if (s.auditoriaAvisou === true) lista.push(botao('auditar', 'a auditoria automatica achou o que cortar.', 'auditar'));

  // O calibrar grava no projeto.json: so com ele carregado. "Nunca calibrado" = sem limiares.tokensDeContexto (o init
  // nao grava).
  const limiares = projeto && projeto.limiares;
  const calibrado = limiares && typeof limiares === 'object' && limiares.tokensDeContexto !== undefined;
  if (projeto && !calibrado && typeof e.contarConversas === 'function') {
    const n = e.contarConversas();
    if (n >= require('./calibracao.js').AMOSTRA_MINIMA.sessoes) {
      lista.push(botao('calibrar', 'ja ha ' + n + ' conversas para medir o limiar de troca de chat.', 'calibrar'));
    }
  }

  if (RE_PARALELO.test(String(e.resposta || ''))) {
    lista.push(botao('paralelo', 'o agente ofereceu rodar em paralelo.', 'rodar em paralelo'));
  }

  if (e.padraoCarregado !== true && temArquivoAaa(s.arquivosTocados, projeto, e.raiz)) {
    lista.push(botao('padrao', 'arquivo AAA mudou sem o manual de execucao carregado.', 'carregar o padrao'));
  }

  return lista;
}

/** Dia local AAAA-MM-DD de `agoraMs`. */
function dia(agoraMs) {
  const d = new Date(agoraMs);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * As conversas (.jsonl) da pasta de transcricoes do projeto, contadas uma vez por dia: a marca no `arquivoDoCache`
 * guarda { dia, pasta, n }. Sem pasta, ou pasta que nao se le: 0, e sem marca (a pasta pode nascer no mesmo dia).
 */
function conversasDoProjeto(pasta, arquivoDoCache, agoraMs) {
  const hoje = dia(agoraMs);
  try {
    const marca = JSON.parse(fs.readFileSync(arquivoDoCache, 'utf8'));
    if (marca && marca.dia === hoje && marca.pasta === pasta && typeof marca.n === 'number') return marca.n;
  } catch (err) { /* sem marca ou ilegivel: conta */ }
  let n;
  try {
    n = fs.readdirSync(pasta).filter(function (nome) { return /\.jsonl$/i.test(nome); }).length;
  } catch (err) {
    return 0;
  }
  try {
    fs.mkdirSync(path.dirname(arquivoDoCache), { recursive: true });
    fs.writeFileSync(arquivoDoCache, JSON.stringify({ dia: hoje, pasta: pasta, n: n }) + '\n', 'utf8');
  } catch (err) { /* sem marca: a proxima medida conta de novo */ }
  return n;
}

module.exports = { ORDEM, daSessao, conversasDoProjeto };
