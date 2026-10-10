#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const saude = require('./lib/saude.js');

// UserPromptSubmit: zera as marcas do turno anterior (trabalhoReal, bloqueouNesteTurno,
// buscouNesteTurno, gravouHandoff) e preserva todo o resto do estado da sessao (contadores, e as chaves
// que a T18 usa). A busca e marca do TURNO: um turno que so leu nao chega ao fecho que a
// apagaria, e sem ela aqui o turno seguinte criava arquivo sem procurar (ronda 1 do 8b).
io.blindar(function () {
  io.lerEntrada(function (e) {
    estado.alterar(e.session_id, function (s) {
      delete s.trabalhoReal;
      delete s.bloqueouNesteTurno;
      delete s.buscouNesteTurno;
      // D412 (o prompt do handoff vai ao chat): o marcar-trabalho.js liga gravouHandoff quando o turno
      // grava um arquivo de handoff, e o portao-fecho.js cobra o bloco na resposta final. O turno
      // interrompido antes do Stop nao deixa a marca para o seguinte.
      delete s.gravouHandoff;
      return s;
    });
    // T10-4 (D357): quem pergunta se o contexto/memoria esta bom ja tem a resposta - dispara toda
    // vez que a pergunta vier (nao e "uma vez por sessao"). Sem projeto.json tambem.
    if (saude.perguntaSobreSaude(e.prompt)) {
      return io.permitir({ hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit', additionalContext: saude.INSTRUCAO_DA_PERGUNTA } });
    }
    io.permitir();
  });
});
