#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const config = require('./lib/config.js');

// D387/D388 (#3): a regra "decisao do dono = exatamente 3 opcoes, a recomendada em primeiro"
// (modelos/regras.md:9) deixa de ser so texto: AskUserQuestion fora do padrao e barrada antes de
// chegar ao dono. Segue o padrao, mas desliga com "portaoDecisao": false no projeto.json.
// Falha do proprio portao libera (R6, io.blindar).

// D389: a marca e exata e entre parenteses: (Recomendado), (Recomendada), (Recommended) ou (Recom.), em
// qualquer caixa. Palavra solta ("Recomendado: x", "Nao recomendado", "Ver recomendacoes") nao e a marca:
// heuristica de linguagem natural virou corrida de bordas na revisao da 0.5.0.
const MARCA_RECOMENDADA = /\((?:recomendad[oa]|recommended|recom\.)\)/i;

/** O que ha de errado na pergunta (1-based em `n`), ou null quando ela segue o padrao. */
function defeitoDaPergunta(q, n) {
  const opcoes = q && typeof q === 'object' ? q.options : null;
  if (!Array.isArray(opcoes)) return 'pergunta ' + n + ' sem a lista de opcoes';
  if (opcoes.length !== 3) {
    return 'pergunta ' + n + ' tem ' + opcoes.length + (opcoes.length === 1 ? ' opcao' : ' opcoes');
  }
  const primeira = opcoes[0];
  const rotulo = primeira && typeof primeira === 'object' ? primeira.label : primeira;
  if (typeof rotulo !== 'string' || !MARCA_RECOMENDADA.test(rotulo)) {
    return 'a 1a opcao da pergunta ' + n + ' nao e a recomendada';
  }
  return null;
}

io.blindar(function () {
  io.lerEntrada(function (e) {
    const raiz = config.raizDoProjeto(e.cwd || process.cwd());
    const projeto = config.carregarProjeto(raiz);
    // Desliga so com o booleano false: texto "false", ausente ou projeto.json ausente = ligado.
    if (projeto && projeto.portaoDecisao === false) return io.permitir();

    const perguntas = e.tool_input && e.tool_input.questions;
    if (!Array.isArray(perguntas)) return io.permitir();

    const defeitos = [];
    perguntas.forEach(function (q, i) {
      const d = defeitoDaPergunta(q, i + 1);
      if (d) defeitos.push(d);
    });
    if (defeitos.length === 0) return io.permitir();

    return io.negarFerramenta([
      'Pergunta ao dono fora do padrao: ' + defeitos.join('; ') + '.',
      'Refaca a pergunta: exatamente 3 opcoes, a recomendada em primeiro com (Recomendado) no rotulo, ' +
        'cada uma com consequencia pratica e custo.',
      'Para desligar este portao no projeto: "portaoDecisao": false em .claude/esquadro/projeto.json.'
    ].join('\n'));
  });
});
