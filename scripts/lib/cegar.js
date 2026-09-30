'use strict';
const fs = require('node:fs');
const path = require('node:path');

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

/**
 * D257 secao 11, item 11: uma base por arquivo. O id e o caminho relativo com a barra virando
 * duplo underscore e todo caractere fora de [a-zA-Z0-9._-] virando underscore
 * (scripts/lib/escopo.js -> scripts__lib__escopo.js). Sempre um nome de pasta seguro. Nunca so
 * digitos: `2026` viraria uma ronda solta do formato antigo (temPastaNumeradaSolta), e ganha `_`.
 */
function idDoArquivo(rel) {
  const id = String(rel == null ? '' : rel).split('/').join('__').replace(/[^a-zA-Z0-9._-]/g, '_');
  return /^\d+$/.test(id) ? '_' + id : id;
}

// 0.3.3, item 18: a regra do id em texto, para os avisos dos scripts. Mora ao lado do idDoArquivo, e um
// teste prende que o texto e a funcao concordam.
const REGRA_DO_ID = 'o caminho do arquivo revisado com cada / trocado por __ e cada caractere fora de ' +
  'letras, numeros, ".", "_" e "-" trocado por _';

/** A base das rondas de um arquivo: <revisao>/<id>. As rondas moram em <base>/<n>/. */
function baseDoArquivo(revisao, rel) {
  return path.join(revisao, idDoArquivo(rel));
}

/**
 * Formato da 0.3.0: pasta numerada SOLTA em revisao/ (revisao/1/), uma base unica para todos os
 * arquivos. Ha revisao em andamento nesse formato quando existe uma. As pastas numeradas das
 * bases novas ficam um nivel abaixo e nao contam.
 */
function temPastaNumeradaSolta(revisao) {
  try {
    return fs.readdirSync(revisao, { withFileTypes: true })
      .some(function (e) { return e.isDirectory() && /^\d+$/.test(e.name); });
  } catch (e) {
    return false;
  }
}

module.exports = { semente, rotular, proximaRonda, idDoArquivo, REGRA_DO_ID, baseDoArquivo, temPastaNumeradaSolta };
