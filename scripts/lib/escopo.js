'use strict';
const fs = require('node:fs');
const path = require('node:path');
const glob = require('./glob.js');

const ARQUIVO = '.claude/esquadro/escopo.md';

// Escopo por frente: um projeto pode ter varias frentes de trabalho ao mesmo
// tempo, cada uma com o seu arquivo nesta pasta. Editar o arquivo da frente
// vincula a sessao a ela; sem vinculo, vale o escopo.md de sempre.
const PASTA_FRENTES = '.claude/esquadro/escopos/';
const NOME_DE_FRENTE = /^[a-zA-Z0-9_-]+$/;

// O nome de frente que de fato vale no disco: o que vem do estado (arquivo em disco)
// e saneado na mesma classe do session_id (lib/estado.js:caminhoSessao).
function nomeSeguro(frente) {
  return String(frente).replace(/[^a-zA-Z0-9_-]/g, '-');
}

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

/**
 * Reconhece um alvo (caminho relativo ao projeto, com barra normal) como o
 * arquivo de UMA frente: prefixo da pasta e extensao comparados sem diferenciar
 * caixa (mesma razao da comparacao do escopo.md em portao-escopo.js), o nome no
 * meio nao pode ser vazio nem ter barra. Devolve `{ nome, valido }` com o nome
 * na caixa original, ou `null` fora da pasta de frentes.
 */
function frenteDoAlvo(alvoRelativo) {
  const alvo = String(alvoRelativo == null ? '' : alvoRelativo);
  const baixo = alvo.toLowerCase();
  if (baixo.indexOf(PASTA_FRENTES) !== 0 || baixo.slice(-3) !== '.md') return null;
  const nome = alvo.slice(PASTA_FRENTES.length, alvo.length - 3);
  if (!nome || nome.indexOf('/') !== -1) return null;
  return { nome: nome, valido: NOME_DE_FRENTE.test(nome) };
}

/**
 * O arquivo de escopo que vale para esta leitura: o da frente, se ela existir
 * no disco; senao o escopo.md de sempre. `frente` vem do estado (arquivo em
 * disco), por isso e saneada de novo aqui, na mesma classe do session_id
 * (lib/estado.js:caminhoSessao).
 */
function arquivoEmVigor(cwd, frente) {
  if (!frente) return ARQUIVO;
  const seguro = nomeSeguro(frente);
  try {
    if (fs.existsSync(path.join(cwd, PASTA_FRENTES + seguro + '.md'))) return PASTA_FRENTES + seguro + '.md';
  } catch (e) { /* cai no escopo.md */ }
  return ARQUIVO;
}

function carregar(cwd, frente) {
  try {
    return parse(fs.readFileSync(path.join(cwd, arquivoEmVigor(cwd, frente)), 'utf8'));
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

function motivoSemEscopo(alvo, marcha, arquivo) {
  alvo = ascii(alvo);
  marcha = ascii(marcha);
  arquivo = arquivo || ARQUIVO;
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' esta em marcha ' + marcha + ', e nao ha escopo declarado.',
    '',
    'Antes de editar, escreva ' + arquivo + ' nesta forma:',
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

function motivoFora(alvo, marcha, esc, arquivo) {
  alvo = ascii(alvo);
  marcha = ascii(marcha);
  arquivo = arquivo || ARQUIVO;
  const lista = (esc && esc.dentro.length) ? esc.dentro.map(function (d) { return '  - ' + ascii(d); }).join('\n') : '  (vazio)';
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' (marcha ' + marcha + ') NAO esta no escopo declarado em ' + arquivo + '.',
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

function motivoDeclaradoFora(alvo, padrao, arquivo) {
  alvo = ascii(alvo);
  padrao = ascii(padrao);
  arquivo = arquivo || ARQUIVO;
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' casa "' + padrao + '", que o escopo declara FORA desta tarefa.',
    '',
    'Escolha uma:',
    '  1. nao edite este arquivo - achado fora de escopo vira REGISTRO, nunca correcao;',
    '  2. se a tarefa mudou, reescreva ' + arquivo + ' e diga por que.'
  ].join('\n');
}

/** Nome de frente fora da classe [a-zA-Z0-9_-]: negado sem gravar vinculo nenhum. */
function motivoNomeDeFrente(alvo) {
  alvo = ascii(alvo);
  return [
    'esquadro - portao de escopo (trava 4).',
    '',
    'O arquivo ' + alvo + ' tem nome de frente invalido.',
    '',
    'Nome de frente so pode ter letras sem acento, numeros, "_" e "-".',
    'Renomeie o arquivo e tente de novo.'
  ].join('\n');
}

/**
 * D244/defeito 7: o escopo em disco pode ser de outra sessao. Uma linha na abertura.
 * Escopo por frente: com vinculo a uma frente que ainda existe no disco, a linha
 * passa a citar a frente e o objetivo DELA. Sem vinculo (ou frente aposentada),
 * mantem a linha de sempre sobre o escopo.md. Havendo outras frentes na pasta, um
 * segundo bloco lista cada uma (menos a vinculada) e diz como se vincular - null so
 * quando nao ha nem escopo.md, nem vinculo, nem frente nenhuma na pasta.
 */
function avisoHeranca(cwd, frente) {
  const partes = [];
  const principal = linhaDoVinculo(cwd, frente) || linhaDaHeranca(cwd);
  if (principal) partes.push(principal);
  const lista = blocoDeFrentes(cwd, frente);
  if (lista) partes.push(lista);
  if (!partes.length) return null;
  return partes.join('\n\n');
}

/** A linha da frente vinculada, ou null quando nao ha vinculo, ou a frente sumiu do disco. */
function linhaDoVinculo(cwd, frente) {
  if (!frente) return null;
  const arquivo = arquivoEmVigor(cwd, frente);
  if (arquivo === ARQUIVO) return null;
  const esc = carregar(cwd, frente);
  return 'esquadro: esta sessao esta vinculada a frente ' + nomeSeguro(frente) + ' (' + arquivo +
    ') - objetivo: ' + ascii((esc && esc.objetivo) || '(sem objetivo)').slice(0, 200) +
    '. Se a tarefa mudou, reescreva ' + arquivo + ' antes de editar.';
}

/** A linha do escopo.md herdado (com a data dele), ou null quando ele nao existe. */
function linhaDaHeranca(cwd) {
  let st;
  try { st = fs.statSync(path.join(cwd, ARQUIVO)); } catch (e) { st = null; }
  if (!st) return null;
  const esc = carregar(cwd, null);
  const d = st.mtime;
  const p2 = function (n) { return String(n).padStart(2, '0'); };
  const quando = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
    p2(d.getHours()) + ':' + p2(d.getMinutes());
  return 'esquadro: escopo herdado de ' + quando + ' - objetivo: ' +
    ascii((esc && esc.objetivo) || '(sem objetivo)').slice(0, 200) +
    '. Se a tarefa mudou, reescreva ' + ARQUIVO + ' antes de editar.';
}

/**
 * As frentes da pasta, uma por linha, e como se vincular a elas - ou null sem nenhuma.
 * So arquivo entra (uma pasta chamada x.md nao e frente), e a frente ja vinculada fica
 * de fora: a linha do vinculo ja fala dela.
 */
function blocoDeFrentes(cwd, frente) {
  let nomes = [];
  try {
    nomes = fs.readdirSync(path.join(cwd, PASTA_FRENTES), { withFileTypes: true })
      .filter(function (e) { return e.isFile() && e.name.toLowerCase().slice(-3) === '.md'; })
      .map(function (e) { return e.name; });
  } catch (e) { nomes = []; }
  if (frente && arquivoEmVigor(cwd, frente) !== ARQUIVO) {
    const vinculado = (nomeSeguro(frente) + '.md').toLowerCase();
    nomes = nomes.filter(function (n) { return n.toLowerCase() !== vinculado; });
  }
  if (!nomes.length) return null;
  const linhas = ['esquadro: frentes de trabalho existentes:'];
  for (const n of nomes) {
    const nome = n.slice(0, n.length - 3);
    let esc = null;
    try { esc = parse(fs.readFileSync(path.join(cwd, PASTA_FRENTES, n), 'utf8')); } catch (e) { esc = null; }
    linhas.push('  - ' + ascii(nome) + ': ' + ascii((esc && esc.objetivo) || '(sem objetivo)').slice(0, 200));
  }
  linhas.push('Editar o arquivo da frente vincula esta sessao a ela; sem vinculo vale ' + ARQUIVO + '.');
  return linhas.join('\n');
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

function motivoOutraFrente(alvo, arquivo) {
  alvo = ascii(alvo);
  arquivo = arquivo || ARQUIVO;
  return [
    'esquadro - outra frente de trabalho (trava 5).',
    '',
    'O arquivo ' + alvo + ' JA aparecia modificado no git status quando esta sessao abriu.',
    'Todo arquivo modificado e nao commitado pertence a outra frente ate prova em contrario.',
    'Nao e rascunho abandonado, e nao e convite.',
    '',
    'Se precisar mesmo tocar nele, isso e decisao do dono. Depois de ele autorizar,',
    'liste o caminho exato em ' + arquivo + ', na secao "## Dentro", e a passagem e contada.'
  ].join('\n');
}

module.exports = {
  ARQUIVO, PASTA_FRENTES, parse, carregar, dentro, declaradoFora, ascii, conteudoDepois, ampliou,
  avisoHeranca, frenteDoAlvo, arquivoEmVigor, nomeSeguro,
  motivoSemEscopo, motivoFora, motivoDeclaradoFora, motivoIntocavel, motivoOutraFrente, motivoNomeDeFrente
};
