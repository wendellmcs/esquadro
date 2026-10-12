#!/usr/bin/env node
'use strict';
// Bloco M / M1 (D435): o medidor da sessao, chamado pelo mod (hooks/mods.ts) por $.process.run.
// Entrada no stdin: { uso, amostras, sessao } - uso = $.session.usage() sem breakdown (D148).
// Saida: JSON { curta, longa, cruzou } e, se a entrada veio torta, `erro`. Saida 0 sempre:
// o medidor nunca derruba a sessao.
const fs = require('node:fs');
const estado = require('./lib/estado.js');
const config = require('./lib/config.js');
const saude = require('./lib/saude.js');
const medidor = require('./lib/medidor.js');

let entrada = {};
let erro = null;
try {
  const bruto = fs.readFileSync(0, 'utf8');
  entrada = JSON.parse(bruto);
  if (!entrada || typeof entrada !== 'object') { entrada = {}; erro = 'entrada nao e objeto JSON'; }
} catch (e) {
  entrada = {};
  erro = 'entrada nao e JSON: ' + e.message;
}

let resposta;
try {
  const s = entrada.sessao ? estado.ler(String(entrada.sessao)) : {};
  const projeto = config.carregarProjeto(config.raizDoProjeto(process.cwd()));
  const conta = Object.assign({}, s, { contadores: saude.acumular(s) });
  // D445: o contexto ao vivo do motor vale mais que o gravado no ultimo Stop.
  const ctx = entrada.uso && entrada.uso.context;
  if (ctx && typeof ctx.tokens === 'number') conta.tokensDeContexto = ctx.tokens;
  resposta = medidor.linhaDaSessao({
    uso: entrada.uso,
    amostras: entrada.amostras,
    medidas: saude.medir(conta, projeto && projeto.limiares, require('./lib/continuo.js').ativo(projeto)),
    avisouSaude: s.avisouSaude === true
  });
} catch (e) {
  resposta = medidor.linhaDaSessao({});
  erro = (erro ? erro + '; ' : '') + 'falha ao medir: ' + e.message;
}
if (erro) resposta.erro = erro;
process.stdout.write(JSON.stringify(resposta) + '\n');
process.exit(0);
