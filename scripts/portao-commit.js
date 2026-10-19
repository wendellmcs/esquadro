#!/usr/bin/env node
'use strict';
const path = require('node:path');
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const config = require('./lib/config.js');
const commit = require('./lib/commit.js');
const ordens = require('./lib/ordens.js');

// Plano 091 (#1, D558, D559): PreToolUse em Bash|PowerShell. So o comando que roda `git commit` paga o git; o resto
// passa direto. So com projeto.json lido e sem `"portaoCommit": false`; a marca de commit sem revisao passa.
io.blindar(function () {
  io.lerEntrada(function (e) {
    const comando = (e.tool_input || {}).command;
    if (!commit.ehCommit(comando)) return io.permitir();
    if (commit.semRevisao(comando)) {
      // Plano 091 T6: a marca depois de um commit negado e a recusa do dono (so conta com a ordem pendente).
      try { estado.alterar(e.session_id, function (s) { s.ordensPendentes = ordens.marcarRecusada(s, 'revisar'); return s; }); } catch (err) { /* passa igual */ }
      return io.permitir();
    }
    const cwd = e.cwd || process.cwd();
    const raiz = config.raizDoProjeto(cwd);
    const projeto = config.carregarProjeto(raiz);
    if (!projeto || projeto.portaoCommit === false) return io.permitir();
    const s = estado.ler(e.session_id);
    const pasta = commit.pastaDoComando(comando);
    const design = require('./lib/design.js');
    const lista = commit.pendentes(s.arquivosTocados, s.revisadosAprovados, raiz,
      commit.topo(pasta ? path.resolve(cwd, pasta) : cwd),
      function (rel) { return design.ehArquivoDeEstilo(rel, projeto); },
      require('./lib/atalhos.js').marcas(projeto));
    if (!lista.length) return io.permitir();
    try { estado.incrementar(e.session_id, 'commit_sem_revisao'); } catch (err) { /* nega do mesmo jeito */ }
    try { estado.alterar(e.session_id, function (s) { s.ordensPendentes = ordens.marcarDada(s, 'revisar'); return s; }); } catch (err) { /* idem */ }
    io.negarFerramenta(commit.motivo(lista));
  });
});
