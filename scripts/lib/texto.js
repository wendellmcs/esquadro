'use strict';

/** Devolve String(valor) sem o U+FEFF (BOM) inicial, se houver. */
function semBom(valor) {
  const s = String(valor);
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

module.exports = { semBom };
