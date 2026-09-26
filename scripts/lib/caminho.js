'use strict';
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

module.exports = { relativoAoProjeto };
