'use strict';
const fs = require('node:fs');
const path = require('node:path');
const glob = require('./glob.js');

const ARQUIVO = '.claude/esquadro/escopo.md';

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
    const item = t.replace(/^[-*+]\s+/, '').replace(/^`+/, '').replace(/`+$/, '').trim();
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
    'A secao "Fora de escopo" nao bloqueia nada: e a sua declaracao do que voce NAO vai tocar.',
    'Quem bloqueia e a secao "Dentro" - o que nao estiver listado la e negado.',
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
  ARQUIVO, parse, carregar, dentro, ascii, conteudoDepois, ampliou,
  motivoSemEscopo, motivoFora, motivoIntocavel, motivoOutraFrente
};
