#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const config = require('./lib/config.js');
const escopoLib = require('./lib/escopo.js');
const custo = require('./lib/custo.js');

io.blindar(function () {
  io.lerEntrada(function (e) {
    const cwd = config.raizDoProjeto(e.cwd || process.cwd());
    const tipo = (e.tool_input || {}).subagent_type;

    // F18: contar sempre. Custo e informacao do dono, e ele so a tem se alguem contar.
    estado.incrementar(e.session_id, 'agentes_despachados');

    if (!tipo) return io.permitir();
    const projeto = config.carregarProjeto(cwd);
    if (!projeto) return io.permitir();

    const esc = escopoLib.carregar(cwd);
    const marchaMax = custo.marchaMaximaDoEscopo(esc, projeto);
    const r = custo.permitido(tipo, marchaMax, projeto);
    if (r.ok) return io.permitir();

    estado.incrementar(e.session_id, 'agente_caro_em_marcha_rapida');
    io.negarFerramenta(r.motivo);
  });
});
