'use strict';
const fs = require('node:fs');

/** FNV-1a de 32 bits. Deterministico: a mesma sessao reproduz a mesma ordem. */
function semente(texto) {
  let h = 0x811c9dc5;
  const s = String(texto == null ? '' : texto);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * B5: o inspetor recebe A e B sem autoria e sem ordem fixa.
 * O mapa fica com quem despachou, e o inspetor nunca o ve.
 */
function rotular(itens, sementeTexto) {
  if (!Array.isArray(itens) || itens.length !== 2) {
    throw new Error('rotular espera exatamente dois itens');
  }
  const inverter = (semente(sementeTexto) % 2) === 1;
  const primeiro = inverter ? itens[1] : itens[0];
  const segundo = inverter ? itens[0] : itens[1];
  return {
    A: { conteudo: primeiro.conteudo },
    B: { conteudo: segundo.conteudo },
    mapa: { A: primeiro.nome, B: segundo.nome }
  };
}

/** Rondas sao pastas numeradas: 1, 2, 3. Teto de 3 e apurado em veredito.js. */
function proximaRonda(dir) {
  let existentes = [];
  try {
    existentes = fs.readdirSync(dir, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory() && /^\d+$/.test(e.name); })
      .map(function (e) { return parseInt(e.name, 10); });
  } catch (e) {
    existentes = [];
  }
  return existentes.length ? Math.max.apply(null, existentes) + 1 : 1;
}

module.exports = { semente, rotular, proximaRonda };
