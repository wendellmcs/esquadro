'use strict';

const ESPECIAIS = new Set(['.', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
const CAIXA_PADRAO = process.platform === 'win32';

/** Tira barra invertida, './' da frente e barra sobrando no comeco. */
function normalizar(caminho) {
  return String(caminho == null ? '' : caminho)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .trim();
}

// Padrao de caminho -> RegExp ancorada.
//   **/  -> zero ou mais niveis de diretorio
//   **   -> qualquer coisa, inclusive barra
//   *    -> qualquer coisa menos barra
function paraRegExp(padrao, ignorarCaixa) {
  const p = normalizar(padrao);
  let re = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') { re += '(?:.*/)?'; i += 3; }
      else { re += '.*'; i += 2; }
    } else if (c === '*') {
      re += '[^/]*'; i += 1;
    } else if (ESPECIAIS.has(c)) {
      re += '\\' + c; i += 1;
    } else {
      re += c; i += 1;
    }
  }
  const flags = (ignorarCaixa === undefined ? CAIXA_PADRAO : ignorarCaixa) ? 'i' : '';
  return new RegExp('^' + re + '$', flags);
}

function casa(padrao, caminho, ignorarCaixa) {
  if (!padrao) return false;
  return paraRegExp(padrao, ignorarCaixa).test(normalizar(caminho));
}

function casaAlgum(padroes, caminho, ignorarCaixa) {
  if (!Array.isArray(padroes)) return false;
  return padroes.some(function (p) { return casa(p, caminho, ignorarCaixa); });
}

module.exports = { normalizar, paraRegExp, casa, casaAlgum };
