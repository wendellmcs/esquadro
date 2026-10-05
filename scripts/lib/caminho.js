'use strict';
const fs = require('node:fs');
const path = require('node:path');
const glob = require('./glob.js');

/**
 * Caminho absoluto (ou relativo) do tool_input -> caminho relativo ao projeto, com barra normal.
 * Devolve null quando o arquivo esta fora do projeto ou quando nao ha caminho.
 */
function relativoAoProjeto(arquivo, cwd) {
  if (!arquivo || !cwd) return null;
  const abs = path.resolve(cwd, String(arquivo));
  const rel = path.relative(cwd, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return glob.normalizar(rel);
}

/**
 * F2-21 (D334): o arquivo esta dentro do projeto pelo caminho REAL? Resolve o link dos dois lados
 * (`realpath` do arquivo e do cwd) quando o arquivo existe: um link dentro do projeto que aponta para
 * fora da falso, e o projeto aberto por link com o arquivo pelo caminho real da verdadeiro. Arquivo que
 * ainda nao existe nao tem caminho real, e vale o caminho escrito. Vazio, nao-texto e o proprio projeto
 * dao falso.
 *
 * E uma funcao a parte de proposito: o portao de escopo depende do `relativoAoProjeto`, que fica lexico
 * (resolver link ali deixaria passar sem portao o arquivo que ja existe atras de um link). Esta serve so
 * a quem LE o arquivo e precisa saber se o conteudo e de dentro: a reinjecao do plano ativo.
 */
function dentroPeloCaminhoReal(arquivo, cwd) {
  if (typeof arquivo !== 'string' || arquivo === '' || !cwd) return false;
  const abs = path.resolve(cwd, arquivo);
  let rel;
  try {
    rel = path.relative(fs.realpathSync(cwd), fs.realpathSync(abs));
  } catch (e) {
    return relativoAoProjeto(arquivo, cwd) !== null;
  }
  return !(rel === '' || /^\.\.(?:[\\/]|$)/.test(rel) || path.isAbsolute(rel));
}

module.exports = { relativoAoProjeto, dentroPeloCaminhoReal };
