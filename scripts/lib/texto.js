'use strict';

/** Devolve String(valor) sem o U+FEFF (BOM) inicial, se houver. */
function semBom(valor) {
  const s = String(valor);
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

const TRADUCOES = {
  ENOENT: 'nao existe',
  EACCES: 'sem permissao',
  EPERM: 'sem permissao',
  EISDIR: 'e uma pasta',
  ENOTDIR: 'parte do caminho nao e uma pasta',
  EBUSY: 'em uso',
  EEXIST: 'ja existe',
  ENOSPC: 'disco cheio',
};

/** Causa de um erro em uma linha (max. 200), com o codigo do Node traduzido: "nao existe (ENOENT)". Origem: F3-22 (D297 secao 4); o shell.js passa a usar esta na T1. */
function causaDoErro(e) {
  let causa;
  if (e && e.code) {
    const codigo = String(e.code);
    const traducao = Object.prototype.hasOwnProperty.call(TRADUCOES, codigo) ? TRADUCOES[codigo] : null;
    causa = traducao ? traducao + ' (' + codigo + ')' : codigo;
  } else {
    causa = e && e.name ? e.name + ': ' + e.message : String(e);
  }
  return causa.replace(/\s+/g, ' ').slice(0, 200);
}

module.exports = { semBom, causaDoErro };
