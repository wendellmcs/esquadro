'use strict';
const fs = require('node:fs');
const path = require('node:path');
const texto = require('./texto.js');

/** 0.3.3, item 27: o caminho de um arquivo de <projeto>/.claude/esquadro/. Uma montagem so, para quem le e para quem diagnostica. */
function caminhoEmEsquadro(cwd, nome) {
  return path.join(cwd, '.claude', 'esquadro', nome);
}

/**
 * Le <projeto>/.claude/esquadro/<nome>. Ausente ou corrompido -> null. JSON escrito no
 * Windows costuma vir com BOM, e sem semBom o JSON.parse estoura e o modulo se desliga EM
 * SILENCIO. D124. Uma funcao so para os dois arquivos (ronda 1 do 8c.5): duas copias da
 * mesma leitura ja divergiram uma vez.
 */
function lerJson(cwd, nome) {
  if (!cwd) return null;
  try {
    const bruto = fs.readFileSync(caminhoEmEsquadro(cwd, nome), 'utf8');
    const obj = JSON.parse(texto.semBom(bruto));
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    return null;
  }
}

/** Le <projeto>/.claude/esquadro/projeto.json. */
function carregarProjeto(cwd) {
  return lerJson(cwd, 'projeto.json');
}

/** Le <projeto>/.claude/esquadro/design.json. */
function carregarDesign(cwd) {
  return lerJson(cwd, 'design.json');
}

/**
 * D244/defeito 1: a pasta do projeto, que nao e sempre o cwd da sessao. Sobe de `cwd` ate a
 * primeira pasta com `.claude/esquadro/projeto.json` - o ARQUIVO, nao a pasta: uma
 * `.claude/esquadro/` sem projeto.json no meio do caminho (contadores, revisao) e atravessada.
 * Sem projeto em lugar nenhum acima, devolve o proprio cwd: e o "sem projeto" de antes.
 * Os hooks usam isto no lugar do cwd cru; os CLIs rodam na pasta que a pessoa escolhe.
 */
function raizDoProjeto(cwd) {
  // cwd que nao e texto (entrada absurda do harness) volta como veio: quem decide o que fazer
  // com ele e o chamador, como antes; estourar aqui derrubaria o portao (portao-apelido.test).
  if (!cwd || typeof cwd !== 'string') return cwd;
  let atual = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(atual, '.claude', 'esquadro', 'projeto.json'))) return atual;
    const pai = path.dirname(atual);
    if (pai === atual) return cwd;
    atual = pai;
  }
}

module.exports = { carregarProjeto, carregarDesign, raizDoProjeto, caminhoEmEsquadro };
