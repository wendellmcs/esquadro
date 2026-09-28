#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const config = require('./lib/config.js');
const destrutivo = require('./lib/destrutivo.js');
const projetoLib = require('./lib/projeto.js');

io.blindar(function () {
  io.lerEntrada(function (e) {
    const comando = (e.tool_input || {}).command;
    if (!comando) return io.permitir();

    const projeto = config.carregarProjeto(config.raizDoProjeto(e.cwd || process.cwd()));

    // X2b: o botao honesto de desligar. Substitui o comandosLiberados:[".*"],
    // que desligava o portao por efeito colateral e sem dizer que desligava.
    // So `=== false` literal desliga: "false", 0, null e ausente ficam LIGADOS.
    const travas = projetoLib.travasDe(projeto);
    if (travas.destrutivo === false) return io.permitir();

    // Escape declarado pelo dono, em projeto.json.
    // X1: texto itera letra a letra no for..of e libera quase tudo; objeto e
    // numero ESTOURAM, e io.blindar (io.js:69) vira exit 0 mudo - portao que
    // estoura PERMITE. No lado LIBERADO, "nao entendi o valor" tem de virar
    // NEGO: quem escreveu sem colchetes le o motivo e corrige, e permitir
    // "rm -rf /" calado nao tem desfazer. O lado bloqueado e o contrario, e
    // por isso nao muda nesta rodada (D105).
    const brutos = projeto && projeto.comandosLiberados;
    const liberados = Array.isArray(brutos) ? brutos : [];
    for (const padrao of liberados) {
      // X1 um nivel abaixo: new RegExp faz ToString. [".*"] vira ".*", [] vira
      // "" (universal) e {} vira "[object Object]" - classe de caracteres COM
      // espaco, que casa quase todo comando. E o mesmo idioma que validar() ja
      // usa em projeto.js:143, e que este laco nunca herdou.
      if (typeof padrao !== 'string') continue;
      try { if (new RegExp(padrao, 'i').test(comando)) return io.permitir(); } catch (err) { /* ignora padrao ruim */ }
    }

    const shell = require('./lib/shell.js');
    const problemas = shell.conferir(comando, projeto && projeto.plataforma, e.tool_name);
    if (problemas.length) {
      const tentativa = estado.incrementar(e.session_id, 'shell_idioma_errado');
      return io.negarFerramenta(shell.motivo(comando, problemas, tentativa));
    }

    const r = destrutivo.classificar(comando, projeto);
    if (!r.destrutivo) return io.permitir();

    estado.incrementar(e.session_id, 'comando_destrutivo');
    io.negarFerramenta(destrutivo.motivo(comando, r));
  });
});
