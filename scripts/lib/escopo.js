'use strict';
const fs = require('node:fs');
const path = require('node:path');
const glob = require('./glob.js');

const ARQUIVO = '.claude/esquadro/escopo.md';

/**
 * D244/defeito 2: o item de lista e o CAMINHO, e o resto da linha e anotacao. Antes a linha
 * inteira virava padrao, e `src/a.js (motivo)` nunca casava arquivo nenhum. Caminho pode ter
 * espaco (`Minha Pasta/**`), entao o corte e pela anotacao, nao pelo primeiro espaco:
 * entre crases vale o que esta entre elas; sem crase, corta em espaco seguido de `(`,
 * travessao, `--`, ` - ` ou `#`.
 */
function caminhoDoItem(t) {
  const s = t.replace(/^[-*+]\s+/, '').trim();
  const crase = s.match(/^`+([^`]+)`+/);
  if (crase) return crase[1].trim();
  const corte = s.search(/\s+(?:\(|\u2014|--\s|-\s|#)/);
  return (corte === -1 ? s : s.slice(0, corte)).replace(/`+/g, '').trim();
}

function parse(texto) {
  const esc = { objetivo: '', dentro: [], fora: [] };
  const linhas = String(texto == null ? '' : texto).split(/\r?\n/);
  let secao = null;
  for (const linha of linhas) {
    const t = linha.trim();
    if (t === '') continue;
    const obj = t.match(/^\*\*\s*objetivo\s*:?\s*\*\*\s*(.+)$/i);
    if (obj) { esc.objetivo = obj[1].trim(); continue; }
    if (/^#{1,6}\s*dentro\b/i.test(t)) { secao = 'dentro'; continue; }
    if (/^#{1,6}\s*fora\b/i.test(t)) { secao = 'fora'; continue; }
    if (/^#{1,6}\s/.test(t)) { secao = null; continue; }
    if (!secao) continue;
    const item = caminhoDoItem(t);
    if (item) esc[secao].push(item);
  }
  return esc;
}

function carregar(cwd) {
  try {
    return parse(fs.readFileSync(path.join(cwd, ARQUIVO), 'utf8'));
  } catch (e) {
    return null;
  }
}

function dentro(caminho, esc) {
  if (!esc) return false;
  return glob.casaAlgum(esc.dentro, caminho);
}

/** D244/defeito 7: o padrao de "Fora" que casa o caminho, ou null. */
function declaradoFora(caminho, esc) {
  if (!esc || !Array.isArray(esc.fora)) return null;
  for (const p of esc.fora) if (glob.casa(p, caminho)) return p;
  return null;
}

/** R5/D36: nada que venha de fora chega cru ao texto do hook. Acento vira letra sem acento. */
function ascii(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

/**
 * D34: o "depois" de uma escrita, calculado a partir do tool_input, sem tocar no disco.
 * Devolve null quando nao da para saber (e ai o portao conta a ampliacao por precaucao).
 */
function conteudoDepois(atual, toolInput) {
  const ti = toolInput || {};
  if (typeof ti.content === 'string') return ti.content;
  if (typeof ti.old_string !== 'string' || ti.old_string === '') return null;
  const base = String(atual == null ? '' : atual);
  const i = base.indexOf(ti.old_string);
  if (i === -1) return null;
  const novo = typeof ti.new_string === 'string' ? ti.new_string : '';
  if (ti.replace_all) return base.split(ti.old_string).join(novo);
  return base.slice(0, i) + novo + base.slice(i + ti.old_string.length);
}

/**
 * D34: ampliou = a lista "Dentro" ganhou pelo menos um padrao que nao existia antes.
 * Estreitar ou corrigir typo nao conta. `depois` null significa desconhecido -> conta.
 */
function ampliou(antes, depois) {
  if (!depois) return true;
  const velhos = (antes && Array.isArray(antes.dentro)) ? antes.dentro : [];
  const novos = Array.isArray(depois.dentro) ? depois.dentro : [];
  for (const d of novos) {
    if (velhos.indexOf(d) === -1) return true;
  }
  return false;
}

function motivoSemEscopo(alvo, marcha) {
  alvo = ascii(alvo);
  marcha = ascii(marcha);
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' esta em marcha ' + marcha + ', e nao ha escopo declarado.',
    '',
    'Antes de editar, escreva ' + ARQUIVO + ' nesta forma:',
    '',
    '  # Escopo',
    '  **Objetivo:** <uma linha sobre o que esta tarefa resolve>',
    '  ## Dentro',
    '  - ' + alvo,
    '  ## Fora de escopo',
    '  - <o que voce NAO vai mexer, mesmo tendo vontade>',
    '',
    'A secao "Dentro" libera: o que nao estiver listado la e negado.',
    'A secao "Fora de escopo" tambem bloqueia: o que voce declarou que NAO vai tocar e negado,',
    'mesmo que case um padrao de "Dentro". Pode anotar o motivo depois do caminho, entre parenteses.',
    'Qualidade maxima se aplica ao que foi pedido, jamais a ampliacao do pedido.'
  ].join('\n');
}

function motivoFora(alvo, marcha, esc) {
  alvo = ascii(alvo);
  marcha = ascii(marcha);
  const lista = (esc && esc.dentro.length) ? esc.dentro.map(function (d) { return '  - ' + ascii(d); }).join('\n') : '  (vazio)';
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' (marcha ' + marcha + ') NAO esta no escopo declarado.',
    '',
    'Escopo atual:',
    lista,
    '',
    'Escolha uma:',
    '  1. nao edite este arquivo - achado fora de escopo vira REGISTRO, nunca correcao;',
    '  2. se ele e mesmo parte do pedido, acrescente-o ao escopo e diga por que.',
    '',
    'Ampliar o escopo e contado e aparece no fecho do turno.'
  ].join('\n');
}

function motivoDeclaradoFora(alvo, padrao) {
  alvo = ascii(alvo);
  padrao = ascii(padrao);
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' casa "' + padrao + '", que o escopo declara FORA desta tarefa.',
    '',
    'Escolha uma:',
    '  1. nao edite este arquivo - achado fora de escopo vira REGISTRO, nunca correcao;',
    '  2. se a tarefa mudou, reescreva ' + ARQUIVO + ' e diga por que.'
  ].join('\n');
}

/** D244/defeito 7: o escopo em disco pode ser de outra sessao. Uma linha na abertura. */
function avisoHeranca(cwd) {
  let st;
  try { st = fs.statSync(path.join(cwd, ARQUIVO)); } catch (e) { return null; }
  const esc = carregar(cwd);
  const d = st.mtime;
  const p2 = function (n) { return String(n).padStart(2, '0'); };
  const quando = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
    p2(d.getHours()) + ':' + p2(d.getMinutes());
  return 'esquadro: escopo herdado de ' + quando + ' - objetivo: ' +
    ascii((esc && esc.objetivo) || '(sem objetivo)').slice(0, 200) +
    '. Se a tarefa mudou, reescreva ' + ARQUIVO + ' antes de editar.';
}

function motivoIntocavel(alvo) {
  alvo = ascii(alvo);
  return [
    'esquadro - intocavel.',
    '',
    'O arquivo ' + alvo + ' esta na lista de intocaveis de projeto.json.',
    'Nem o escopo declarado libera este caminho.',
    '',
    'Mexer nele e decisao do dono do projeto, nao julgamento seu.',
    'Leve a ele com 3 opcoes e a recomendada marcada.'
  ].join('\n');
}

function motivoOutraFrente(alvo) {
  alvo = ascii(alvo);
  return [
    'esquadro - outra frente de trabalho (trava 5).',
    '',
    'O arquivo ' + alvo + ' JA aparecia modificado no git status quando esta sessao abriu.',
    'Todo arquivo modificado e nao commitado pertence a outra frente ate prova em contrario.',
    'Nao e rascunho abandonado, e nao e convite.',
    '',
    'Se precisar mesmo tocar nele, isso e decisao do dono. Depois de ele autorizar,',
    'liste o caminho exato em ' + ARQUIVO + ', na secao "## Dentro", e a passagem e contada.'
  ].join('\n');
}

module.exports = {
  ARQUIVO, parse, carregar, dentro, declaradoFora, ascii, conteudoDepois, ampliou, avisoHeranca,
  motivoSemEscopo, motivoFora, motivoDeclaradoFora, motivoIntocavel, motivoOutraFrente
};
