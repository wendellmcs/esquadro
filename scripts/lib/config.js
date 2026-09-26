'use strict';
const fs = require('node:fs');
const path = require('node:path');
const texto = require('./texto.js');

/**
 * Le <projeto>/.claude/esquadro/<nome>. Ausente ou corrompido -> null. JSON escrito no
 * Windows costuma vir com BOM, e sem semBom o JSON.parse estoura e o modulo se desliga EM
 * SILENCIO. D124. Uma funcao so para os dois arquivos (ronda 1 do 8c.5): duas copias da
 * mesma leitura ja divergiram uma vez.
 */
function lerJson(cwd, nome) {
  if (!cwd) return null;
  try {
    const bruto = fs.readFileSync(path.join(cwd, '.claude', 'esquadro', nome), 'utf8');
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

module.exports = { carregarProjeto, carregarDesign };
