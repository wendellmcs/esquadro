#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const git = require('./lib/git.js');
const regra = require('./lib/regra.js');
const config = require('./lib/config.js');

io.blindar(function () {
  io.lerEntrada(function (e) {
    const cwd = config.raizDoProjeto(e.cwd || process.cwd());
    estado.alterar(e.session_id, function (s) {
      // D17: a foto e tirada uma vez, na abertura. Arquivo que ja estava
      // modificado aqui pertence a outra frente ate prova em contrario.
      // D46: o SessionStart tambem dispara em `compact` e em `resume`, com o
      // MESMO session_id. Sem esta guarda a foto seria refeita com o git status
      // ATUAL, que ja contem o trabalho do proprio agente - e depois de uma
      // compactacao de contexto o agente ficaria barrado nos proprios arquivos.
      // A guarda olha a foto, nao a origem: origem nova no harness nao deixa
      // a trava muda sem avisar.
      if (Array.isArray(s.gitAbertura)) return s;
      const foto = git.modificados(cwd);
      // D49: `null` e "nao consegui fotografar" (git ausente, fora de repo,
      // timeout); `[]` e "arvore limpa". Congelar uma foto que falhou deixaria a
      // trava 5b muda pelo resto da sessao, em silencio - e uma reabertura
      // (`compact`, `resume`) e justamente a segunda chance de conseguir.
      if (foto === null) return s;
      s.gitAbertura = foto;
      s.abertoEm = e.source || null;
      return s;
    });
    // A2: stdout de abertura de sessao entra como contexto que o Claude ve.
    // Roda em toda reabertura de proposito: e depois da compactacao que a regra
    // se perde, e e por isso que ela se reinjeta em vez de so se ler uma vez.
    const projeto = config.carregarProjeto(cwd);
    const texto = require('./lib/reinjecao.js').montar(cwd, e.session_id, e.source);
    if (texto) process.stdout.write(texto);
    // Qualidade de resposta: sai em toda abertura, com ou sem projeto.json, depois das regras;
    // so `qualidadeDeResposta: false` no projeto desliga.
    const qualidade = require('./lib/qualidade.js').bloco(projeto);
    if (qualidade) process.stdout.write((texto ? '\n' : '') + qualidade);
    const heranca = require('./lib/escopo.js').avisoHeranca(cwd, estado.ler(e.session_id).frente);
    if (heranca) process.stdout.write('\n' + heranca + '\n');

    // O buraco que a D104 mediu e deixou aberto: `intocaveis` com typo fica
    // INERTE em silencio - nao e erro de tipo nem de sintaxe, entao nenhum
    // validador ve. Confere-se UMA vez por sessao, aqui, porque exige listar o
    // repositorio e os portoes de custo zero nao podem pagar isso a cada escrita.
    const projetoLib = require('./lib/projeto.js');
    const inertes = projetoLib.intocaveisInertes(projeto, git.rastreados(cwd), cwd);
    if (inertes.length) {
      process.stdout.write('\n' + projetoLib.motivoInerte(inertes) + '\n');
    }
    const planoLib = require('./lib/plano.js');
    const ativo = planoLib.lerAtivo(cwd);
    if (planoLib.donoOutro(ativo, e.session_id)) {
      process.stdout.write([
        '',
        '# esquadro - ATENCAO: outra sessao detem o plano ativo',
        '',
        'Plano: ' + ativo.arquivo,
        'Dono registrado: ' + ativo.sessionId + ' (esta sessao e outra).',
        '',
        'Nao edite esse arquivo nem o log de decisoes sem combinar com o dono.',
        'Numero de decisao se le do disco:',
        '  node "${CLAUDE_PLUGIN_ROOT}/scripts/plano.js" --proxima-decisao <arquivo>',
        ''
      ].join('\n'));
    }
    process.exit(0);
  });
});
