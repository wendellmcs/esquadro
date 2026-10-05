#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const busca = require('./lib/busca.js');

// PostToolUse em Write|Edit|Bash|PowerShell|Grep|Glob|Read: houve trabalho real neste turno.
io.blindar(function () {
  io.lerEntrada(function (e) {
    estado.alterar(e.session_id, function (s) {
      // C9: quem procurou pode criar arquivo novo neste turno.
      if (busca.ehBusca(e.tool_name, e.tool_input)) s.buscouNesteTurno = true;

      // Grep, Glob e Read entraram no matcher POR CAUSA do C9, e sao somente-leitura:
      // nao podem ligar `trabalhoReal`, senao um turno que so procurou passaria a
      // dever a evidencia que o portao de fecho cobra. Bash segue contando como
      // antes, inclusive quando o comando e um grep - ele pode ter feito qualquer
      // outra coisa junto. O Read entrou depois (ronda 1 do Passo 8b): a busca ja o
      // contava, e sem ele no matcher quem leu o vizinho era negado ao criar.
      // A caixa do nome nao decide, como na busca: com `read`, a busca ligava e o
      // turno ainda virava trabalho a provar (ronda 2 do Passo 8b).
      const nome = String(e.tool_name || '').toLowerCase();
      const soLeitura = nome === 'grep' || nome === 'glob' || nome === 'read';
      if (!soLeitura) {
        if (!s.trabalhoReal) s.turnosComTrabalho = (s.turnosComTrabalho || 0) + 1;
        s.trabalhoReal = true;
        const arquivo = (e.tool_input || {}).file_path;
        if (arquivo) {
          s.arquivosTocados = s.arquivosTocados || [];
          if (s.arquivosTocados.indexOf(arquivo) === -1) s.arquivosTocados.push(arquivo);
        }
      }
      return s;
    });
    io.permitir();
  });
});
