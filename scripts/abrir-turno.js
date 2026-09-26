#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');

// UserPromptSubmit: zera as marcas do turno anterior (trabalhoReal, bloqueouNesteTurno,
// buscouNesteTurno) e preserva todo o resto do estado da sessao (contadores, e as chaves
// que a T18 usa). A busca e marca do TURNO: um turno que so leu nao chega ao fecho que a
// apagaria, e sem ela aqui o turno seguinte criava arquivo sem procurar (ronda 1 do 8b).
io.blindar(function () {
  io.lerEntrada(function (e) {
    estado.alterar(e.session_id, function (s) {
      delete s.trabalhoReal;
      delete s.bloqueouNesteTurno;
      delete s.buscouNesteTurno;
      return s;
    });
    io.permitir();
  });
});
