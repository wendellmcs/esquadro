#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const git = require('./lib/git.js');
const fs = require('node:fs');
const path = require('node:path');
const regra = require('./lib/regra.js');
const config = require('./lib/config.js');
const textoLib = require('./lib/texto.js');
const escopoLib = require('./lib/escopo.js');

/**
 * S8/L2-abe-1: caminho que o AGENTE vai copiar para o shell. Aspas duplas servem ao caso normal (espaco,
 * acento, `\` do Windows); com `$`, crase ou `"` o shell reinterpretaria o pedaco, entao vai entre aspas
 * simples (vale no Bash e no PowerShell). Com `'` tambem, so sobra escapar para o Bash.
 */
function caminhoParaShell(p) {
  if (!/[$`"]/.test(p)) return '"' + p + '"';
  if (p.indexOf("'") === -1) return "'" + p + "'";
  return '"' + p.replace(/([\\$`"])/g, '\\$1') + '"';
}

/**
 * S8/A2-4: a reinjecao avisa do projeto.json ilegivel quando ha regras a reinjetar (`nucleo` sai antes sem
 * regras.md ou sem nenhuma regra). Saber isso pela ESTRUTURA, e nao procurando a frase dela no texto, e o que
 * impede o aviso de dobrar se a frase for reescrita.
 */
function reinjecaoJaAvisou(cwd) {
  try {
    return regra.parseRegras(fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'regras.md'), 'utf8')).length > 0;
  } catch (erro) { return false; }
}

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
    // D420/PT-04: projeto.json PRESENTE e ilegivel (config devolve null igual ao ausente) so era
    // avisado dentro da reinjecao, que sai antes quando nao ha regras.md - e os portoes de
    // escopo/intocaveis ficavam desligados sem ninguem saber. Aqui o aviso sai com ou sem regras;
    // quando a reinjecao ja o disse, nao dobra. Falha aberta de proposito: so a mensagem.
    if (!projeto && fs.existsSync(config.caminhoEmEsquadro(cwd, 'projeto.json')) &&
        !reinjecaoJaAvisou(cwd)) {
      process.stdout.write((texto ? '\n' : '') + 'esquadro: .claude/esquadro/projeto.json existe mas nao se le: ' +
        'os portoes de escopo e de intocaveis estao DESLIGADOS ate corrigir. ' +
        'Corrija o JSON (virgula sobrando, aspas) ou rode /esquadro:init de novo.\n');
    }
    // Qualidade de resposta: sai em toda abertura, com ou sem projeto.json, depois das regras;
    // so `qualidadeDeResposta: false` no projeto desliga.
    // D451: a regra de paralelismo, antes da qualidade e no mesmo molde; so `paralelismo: false` desliga.
    const paralelo = require('./lib/paralelismo.js').bloco(projeto);
    if (paralelo) process.stdout.write((texto ? '\n' : '') + paralelo);
    const qualidade = require('./lib/qualidade.js').bloco(projeto);
    if (qualidade) process.stdout.write((texto || paralelo ? '\n' : '') + qualidade);
    const heranca = require('./lib/escopo.js').avisoHeranca(cwd, estado.ler(e.session_id).frente);
    if (heranca) process.stdout.write('\n' + heranca + '\n');

    // O buraco que a D104 mediu e deixou aberto: `intocaveis` com typo fica
    // INERTE em silencio - nao e erro de tipo nem de sintaxe, entao nenhum
    // validador ve. Confere-se UMA vez por sessao, aqui, porque exige listar o
    // repositorio e os portoes de custo zero nao podem pagar isso a cada escrita.
    const projetoLib = require('./lib/projeto.js');
    const rastreados = git.rastreados(cwd);
    const inertes = projetoLib.intocaveisInertes(projeto, rastreados, cwd);
    // F1-C12: `null` e "o git nao respondeu" - e nao e "nenhum inerte". Calar aqui
    // fazia "nao sei" parecer "esta tudo certo". So se diz quando ha o que duvidar.
    if (rastreados === null && projeto && Array.isArray(projeto.intocaveis) && projeto.intocaveis.length) {
      process.stdout.write('\nesquadro: nao sei se ha intocavel inerte (o git nao respondeu).\n');
    }
    if (inertes.length) {
      process.stdout.write('\n' + projetoLib.motivoInerte(inertes) + '\n');
    }
    // D442/5 (S-35, S-68): o aviso de tipo so saia na primeira escrita (portao-escopo), e o dono que pos
    // `"sugerirAprender": "false"` achava que tinha desligado. So o booleano decide (D388, D415).
    const tipos = projetoLib.avisosDeTipo(projeto);
    if (tipos.length) {
      process.stdout.write('\nesquadro: ATENCAO - valor de tipo errado em .claude/esquadro/projeto.json: ' + tipos.join('; ') +
        '. Para ligar ou desligar vale so true ou false, sem aspas: "false" entre aspas NAO desliga.\n');
    }
    // A2 (D426): auditoria periodica. Depois da foto do git (a marca nao entra nela) e antes do plano
    // ativo, que segue por ultimo. A lib ja nao lanca; o try/catch aqui e a segunda rede, para que
    // nada da auditoria derrube o resto da abertura.
    try {
      const auditoriaTexto = require('./lib/auditoria-periodica.js').avisoDaAuditoria(cwd, projeto);
      if (auditoriaTexto) process.stdout.write('\n' + auditoriaTexto + '\n');
    } catch (erro) {
      // S8/A2-3: aqui so chega falha do `require` da lib (ela propria ja nao lanca). Calar deixava a
      // auditoria morta para sempre sem ninguem saber; uma linha diz que nao rodou e por que. A abertura segue.
      process.stdout.write('\nesquadro: auditoria automatica nao rodou (' +
        escopoLib.ascii(textoLib.causaDoErro(erro)).slice(0, 120) + '). O resto da abertura segue igual.\n');
    }
    // Bloco V (D426/D437): a novidade da semana do vigia. So le o disco (D148: gancho nenhum abre rede);
    // opt-in por `"vigia": true`, entao sem a chave nao toca em nada. Mesma segunda rede da auditoria.
    try {
      const vigiaTexto = require('./lib/vigia-local.js').avisoDoVigia(projeto);
      if (vigiaTexto) process.stdout.write('\n' + vigiaTexto + '\n');
    } catch (erro) {
      process.stdout.write('\nesquadro: vigia nao rodou (' +
        escopoLib.ascii(textoLib.causaDoErro(erro)).slice(0, 120) + '). O resto da abertura segue igual.\n');
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
        '  node ' + caminhoParaShell(path.join(__dirname, 'plano.js')) + ' --proxima-decisao <arquivo>',
        ''
      ].join('\n'));
    }
    process.exit(0);
  });
});
