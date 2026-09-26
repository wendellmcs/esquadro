'use strict';
/**
 * Auxiliar de teste, NAO e suite: nome nao casa com *.test.js de proposito,
 * para o glob de `npm test` (test/*.test.js) nao tentar rodar isto como teste.
 *
 * Exercita o caso que o try/catch sincrono de blindar() nao cobre: excecao
 * lancada dentro do callback assincrono de lerEntrada (o 'end' do stdin
 * chega depois que o try da blindar() ja saiu de escopo).
 */
const io = require('../scripts/lib/io.js');

io.blindar(function () {
  io.lerEntrada(function () {
    throw new Error('estourou dentro do callback assincrono, de proposito');
  });
});
