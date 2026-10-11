#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const saude = require('./lib/saude.js');
const correcao = require('./lib/correcao.js');
const config = require('./lib/config.js');

// UserPromptSubmit: zera as marcas do turno anterior (trabalhoReal, bloqueouNesteTurno,
// buscouNesteTurno, gravouHandoff) e preserva todo o resto do estado da sessao (contadores, e as chaves
// que a T18 usa). A busca e marca do TURNO: um turno que so leu nao chega ao fecho que a
// apagaria, e sem ela aqui o turno seguinte criava arquivo sem procurar (ronda 1 do 8b).
io.blindar(function () {
  io.lerEntrada(function (e) {
    // A1 (D426): a chave sugerirAprender (padrao ligado) vem do projeto.json; ilegivel ou ausente = ligado.
    const parece = correcao.pareceCorrecao(e.prompt) &&
      correcao.ligada(config.carregarProjeto(config.raizDoProjeto(e.cwd || process.cwd())));
    let sugerir = false;
    estado.alterar(e.session_id, function (s) {
      delete s.trabalhoReal;
      delete s.bloqueouNesteTurno;
      delete s.buscouNesteTurno;
      // D412 (o prompt do handoff vai ao chat): o marcar-trabalho.js liga gravouHandoff quando o turno
      // grava um arquivo de handoff, e o portao-fecho.js cobra o bloco na resposta final. O turno
      // interrompido antes do Stop nao deixa a marca para o seguinte.
      delete s.gravouHandoff;
      // A1: no maximo 1 sugestao a cada 5 turnos. Todo prompt gasta 1 da espera; ao sugerir, ela volta a 4.
      // Campo da SESSAO (estado.CAMPOS_DA_SESSAO): o fecho o carrega, senao a janela morria a cada turno.
      // PA1-5: ausente = 0 (primeira vez, libera). Valor que nao e numero finito (texto, null, objeto, lista)
      // e estado corrompido: vale a espera cheia, nunca 0 - senao a sugestao sairia a cada prompt. Numero fica
      // entre 0 e a espera cheia (negativo = 0; gigante nao prende a sessao para sempre).
      const bruto = s.esperaAprender;
      const espera = bruto === undefined ? 0
        : (typeof bruto === 'number' && isFinite(bruto) ? Math.min(Math.max(bruto, 0), correcao.ESPERA_ENTRE_SUGESTOES)
          : correcao.ESPERA_ENTRE_SUGESTOES);
      if (parece && espera === 0) {
        sugerir = true;
        s.esperaAprender = correcao.ESPERA_ENTRE_SUGESTOES;
      } else if (espera > 0) {
        s.esperaAprender = espera - 1;
      }
      return s;
    });
    // T10-4 (D357): quem pergunta se o contexto/memoria esta bom ja tem a resposta - dispara toda
    // vez que a pergunta vier (nao e "uma vez por sessao"). Sem projeto.json tambem.
    // A1: as duas podem valer no mesmo prompt ("o contexto esta bom? eu ja te disse isso"): um so
    // additionalContext, com a saude primeiro (e a que manda agir ja).
    const avisos = [];
    if (saude.perguntaSobreSaude(e.prompt)) avisos.push(saude.INSTRUCAO_DA_PERGUNTA);
    if (sugerir) avisos.push(correcao.INSTRUCAO_DA_CORRECAO);
    if (avisos.length) {
      return io.permitir({ hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit', additionalContext: avisos.join('\n\n') } });
    }
    io.permitir();
  });
});
