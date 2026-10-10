#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const evidencia = require('./lib/evidencia.js');
const config = require('./lib/config.js');
const projetoLib = require('./lib/projeto.js');
const saude = require('./lib/saude.js');

function avisoDeAmpliacao(contadores) {
  const n = (contadores && contadores.escopo_ampliado) || 0;
  if (!n) return null;
  // desenho §5: o escape existe, mas fica visivel.
  return 'esquadro: o escopo foi ampliado ' + n + 'x neste turno.';
}

function encerrarTurno(e, s) {
  const contadores = s.contadores || {};
  const cwd = config.raizDoProjeto(e.cwd);
  estado.descarregar(cwd, contadores);
  const projeto = config.carregarProjeto(cwd);

  // D123: dois baldes. `contadores` e do TURNO - descarregado e depois ZERADO, senao o
  // ledger da D14 conta o mesmo disparo de novo a cada turno (medido: 1 -> 2 -> 3).
  // `contadoresSessao` acumula e so alimenta o gatilho de saude; nunca e descarregado.
  const acumulados = Object.assign({}, s.contadoresSessao || {});
  for (const chave of Object.keys(contadores)) {
    acumulados[chave] = (acumulados[chave] || 0) + contadores[chave];
  }
  const vs = saude.avaliar(Object.assign({}, s, { contadores: acumulados }), projeto && projeto.limiares);

  // T10-1: em laco (stop_hook_active) nao se continua a conversa nem se marca o aviso como dado:
  // ele fica pendente para o proximo Stop. Continuar dentro do laco e o que a trava de 8 existe para cortar.
  const avisa = vs.disparou && e.stop_hook_active !== true;

  const partes = [];
  const amp = avisoDeAmpliacao(contadores);
  if (amp) partes.push(amp);
  if (avisa) partes.push(vs.aviso);

  // O estado do TURNO morre aqui (trabalhoReal, bloqueouNesteTurno, contadores); o da
  // SESSAO sobrevive. Separar os dois e exatamente o que a T18 existe para fazer.
  // Os campos da SESSAO que os outros portoes gravam - avisos de "uma vez por sessao" e
  // registros - moram em `estado.CAMPOS_DA_SESSAO`: fora dela, morriam a cada turno.
  const sessao = function (dados) { estado.gravar(e.session_id, Object.assign(dados, estado.camposDaSessao(s))); };
  if (avisa) {
    // Zera o turno mas guarda que ja avisou: o aviso sai uma vez por sessao.
    sessao({ avisouSaude: true, turnosComTrabalho: s.turnosComTrabalho || 0, gitAbertura: s.gitAbertura || [] });
  } else {
    sessao({ turnosComTrabalho: s.turnosComTrabalho || 0, gitAbertura: s.gitAbertura || [], arquivosTocados: s.arquivosTocados || [], contadoresSessao: acumulados, avisouSaude: s.avisouSaude || false });
  }
  if (!partes.length) return io.permitir();
  const saida = { systemMessage: partes.join('\n\n') };
  // T10-1: o systemMessage so o usuario ve. O additionalContext do Stop e o que chega ao modelo
  // e o faz agir (rodar o handoff e colar o prompt na mesma resposta).
  if (avisa) {
    // D412: o turno que gravou o handoff e ja colou o bloco nao recebe a ordem de colar de novo.
    // Mesma regra do portao (handoffSemPrompt), sem o projeto: a ordem nao depende do portaoHandoff.
    const jaColado = s.gravouHandoff === true && !handoffSemPrompt(e, s, null);
    saida.hookSpecificOutput = { hookEventName: 'Stop', additionalContext: saude.instrucaoAoModelo(vs.gatilhos, jaColado) };
  }
  io.permitir(saida);
}

/** D412: handoff gravado neste turno e a resposta final sem bloco de codigo. D415: so
 *  `"portaoHandoff": false` no projeto.json desliga - independente de `travas.fecho`. */
function handoffSemPrompt(e, s, projeto) {
  if (s.gravouHandoff !== true) return false;
  if (projeto && projeto.portaoHandoff === false) return false;
  return !saude.temBlocoDeCodigo(e.last_assistant_message);
}

/** Um bloqueio por turno, com os motivos que o turno juntou - o do subitem aberto OU o da
 *  evidencia (o subitem sai antes de a evidencia ser olhada), mais o do handoff: o segundo Stop
 *  chega com stop_hook_active e libera, e um motivo deixado para depois nunca seria cobrado.
 *  Soma o balde do handoff, marca o bloqueio do turno, grava o estado e barra; nao muda `motivos`. */
function barrar(e, s, motivos, semPrompt) {
  const todos = semPrompt ? motivos.concat([saude.MOTIVO_HANDOFF_SEM_PROMPT]) : motivos;
  s.contadores = s.contadores || {};
  if (semPrompt) s.contadores.handoff_sem_prompt = (s.contadores.handoff_sem_prompt || 0) + 1;
  s.bloqueouNesteTurno = true;
  estado.gravar(e.session_id, s);
  io.bloquearFecho(todos.join('\n\n'));
}

io.blindar(function () {
  io.lerEntrada(function (e) {
    const s = estado.ler(e.session_id);

    // Ja bloqueou neste turno, ou o harness avisa que estamos em laco: encerra.
    if (s.bloqueouNesteTurno || e.stop_hook_active === true) return encerrarTurno(e, s);

    // Nao houve trabalho real: conversa passa direto. Custo zero.
    if (!s.trabalhoReal) return io.permitir();

    // X2b: o dono desligou a cobranca de evidencia - NAO o ledger. encerrarTurno
    // e o UNICO chamador de estado.descarregar (unico escritor de
    // contadores.json) e o unico lugar que zera o estado do TURNO. Um io.permitir()
    // aqui desligaria a medicao do plugin inteiro e congelaria bloqueouNesteTurno.
    // Excecao (D415): `travas.fecho: false` nao desliga o portao do prompt do handoff - so
    // `"portaoHandoff": false` desliga. Por isso o semPrompt e calculado antes do retorno.
    // Custo declarado (P2-38): o Stop le o projeto.json aqui e, quando termina em encerrarTurno,
    // de novo la - duas leituras de disco no mesmo Stop.
    const cwd = config.raizDoProjeto(e.cwd);
    const projeto = config.carregarProjeto(cwd);
    const travas = projetoLib.travasDe(projeto);
    const semPrompt = handoffSemPrompt(e, s, projeto);
    if (travas.fecho === false) return semPrompt ? barrar(e, s, [], true) : encerrarTurno(e, s);

    const planoLib = require('./lib/plano.js');
    const ativo = planoLib.lerAtivo(cwd);
    if (ativo && planoLib.alegaEtapaConcluida(e.last_assistant_message)) {
      let tarefas = [];
      try { tarefas = planoLib.parseTarefas(require('node:fs').readFileSync(require('node:path').join(cwd, ativo.arquivo), 'utf8')); }
      catch (err) { tarefas = []; }
      const aberta = tarefas.filter(function (t) { return t.abertos > 0; })[0];
      if (aberta) {
        s.contadores = s.contadores || {};
        s.contadores.subitem_pendente = (s.contadores.subitem_pendente || 0) + 1;
        return barrar(e, s, [planoLib.motivoSubitemAberto(aberta)], semPrompt);
      }
    }

    const semEvidencia = evidencia.deveBloquear(e.last_assistant_message);
    if (!semEvidencia && !semPrompt) return encerrarTurno(e, s);

    const motivos = [];
    if (semEvidencia) {
      s.contadores = s.contadores || {};
      s.contadores.fecho_sem_evidencia = (s.contadores.fecho_sem_evidencia || 0) + 1;
      motivos.push(evidencia.MOTIVO);
    }
    barrar(e, s, motivos, semPrompt);
  });
});
