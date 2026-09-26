#!/usr/bin/env node
'use strict';
const path = require('node:path');
const plataforma = require('./lib/plataforma.js');

/**
 * H6 na tela: em que sistemas este plugin de fato rodou, e o que nele so se
 * prova rodando no sistema de verdade.
 *
 * A matriz ja e conferida pela suite a cada rodada. Este comando existe porque
 * a DECLARACAO tem leitor humano: quem instala o plugin em Linux merece uma
 * frase que diga, sem eufemismo, o que ninguem mediu ali. Relatorio que so vive
 * dentro de uma assercao nao declara nada a ninguem.
 *
 * Saida 1 quando a matriz nao cobre o disco - orfa ou ponto morto. Um relatorio
 * de cobertura que se contradiz nao serve de declaracao.
 */

function argumento(argv, nome) {
  const i = argv.indexOf(nome);
  return (i !== -1 && argv[i + 1]) ? argv[i + 1] : null;
}

function main() {
  const argv = process.argv.slice(2);
  const raiz = path.resolve(argumento(argv, '--raiz') || '.');
  const so = argumento(argv, '--como') || undefined;

  const m = plataforma.matriz(raiz, so);
  console.log(plataforma.texto(m));

  if (!m.integra) {
    console.error('');
    console.error('A matriz NAO cobre o disco. Enquanto isto valer, a declaracao acima');
    console.error('fala de um codigo que nao e mais este.');
    console.error('Para consertar: em scripts/lib/plataforma.js, declare cada ORFA num ponto de PONTOS');
    console.error('e tire cada MORTO da lista de arquivos do ponto dele; depois rode este comando de novo.');
    process.exit(1);
  }
  process.exit(0);
}

main();
