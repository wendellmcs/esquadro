#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const busca = require('./lib/busca.js');

/**
 * T10-2: quantas respostas nao vazias o AskUserQuestion devolveu. Fica fora do `alterar` porque
 * o teste do fecho le o corpo dele procurando gravacao no estado, e um `return` de filtro la dentro
 * parece o `alterar` devolvendo outra coisa que nao o proprio estado.
 */
function contarRespostas(resp) {
  if (!resp || typeof resp !== 'object') return 0;
  const respostas = resp.answers;
  if (!respostas || typeof respostas !== 'object' || Array.isArray(respostas)) return 0;
  return Object.keys(respostas).filter(function (k) {
    const v = respostas[k];
    return v !== null && v !== undefined && String(v).trim() !== '';
  }).length;
}

// PostToolUse em Write|Edit|Bash|PowerShell|Grep|Glob|Read|AskUserQuestion: houve trabalho real
// neste turno (o AskUserQuestion so conta a decisao do dono; perguntar nao e trabalho).
io.blindar(function () {
  io.lerEntrada(function (e) {
    estado.alterar(e.session_id, function (s) {
      // T10-2 (D357): decisao do dono = resposta do AskUserQuestion. Cada chave de `answers` com
      // valor nao vazio e uma decisao. Perguntar NAO e trabalho a provar: sai antes de ligar
      // trabalhoReal, turnosComTrabalho e buscouNesteTurno. `tool_response` ausente ou sem
      // `answers` conta zero (o formato do gancho nao foi provado em sessao interativa).
      if (String(e.tool_name || '').toLowerCase() === 'askuserquestion') {
        const n = contarRespostas(e.tool_response);
        if (n) s.decisoesDoDono = (s.decisoesDoDono || 0) + n;
        return s;
      }

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
        // T10-3 (D357): commit que PASSOU. So o que o proprio Claude Code informa em
        // tool_response.gitOperation.commit.sha (medido na 2.1.258) - sem regex no comando, que
        // daria falso positivo com `echo "git commit"`. O commit que falha nem chega ao PostToolUse.
        if (nome === 'bash' || nome === 'powershell') {
          const resp = e.tool_response;
          const op = resp && typeof resp === 'object' ? resp.gitOperation : null;
          if (op && op.commit && op.commit.sha) s.commitsFeitos = (s.commitsFeitos || 0) + 1;
        }
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
