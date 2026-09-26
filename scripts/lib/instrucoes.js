'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ambiente = require('./ambiente.js');

// Metodo FIXO: numero sem metodo declarado nao e medida, e opiniao com casas decimais.
const RE_ITEM = /^\s*(?:[-*+]\s+|\d+\.\s+)\S/;
const METODO = 'conta linhas que comecam com marcador de lista ou numero, nas fontes canonicas, em regras.md e nas skills do projeto';

function contarArquivo(arquivo) {
  try {
    return fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(function (l) { return RE_ITEM.test(l); }).length;
  } catch (e) {
    return 0;
  }
}

// Ronda 1 do 8c.5: o `||` engolia o zero, o defeito que a D98 corrigiu na varredura.js.
// Teto e inteiro nao negativo, zero inclusive; so o ausente ou invalido cai no padrao.
function limite(v, padrao) {
  return Number.isInteger(v) && v >= 0 ? v : padrao;
}

function contar(cwd, projeto) {
  const alvos = [];
  for (const f of ((projeto && projeto.fontesCanonicas) || [])) alvos.push(f);
  alvos.push(path.join('.claude', 'esquadro', 'regras.md'));
  for (const s of ambiente.detectar(cwd).skills) alvos.push(path.join('.claude', 'skills', s, 'SKILL.md'));

  const porArquivo = [];
  let total = 0;
  for (const rel of alvos) {
    const n = contarArquivo(path.join(cwd, rel));
    if (n > 0) { porArquivo.push({ arquivo: rel.replace(/\\/g, '/'), n: n }); total += n; }
  }
  porArquivo.sort(function (a, b) { return b.n - a.n; });

  const teto = limite(ambiente.LIMITES.tetoDeInstrucoes, 200);
  return {
    total: total,
    porArquivo: porArquivo,
    teto: teto,
    avisarA: limite(ambiente.LIMITES.avisarA, 150),
    estourou: total > teto,
    metodo: METODO
  };
}

module.exports = { RE_ITEM, METODO, contar };
