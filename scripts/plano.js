#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const planoLib = require('./lib/plano.js');

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  return i !== -1 ? process.argv[i + 1] : null;
}

const cwd = process.cwd();
const abrirEm = arg('abrir');
const decisoes = arg('proxima-decisao');

if (decisoes) {
  process.stdout.write(String(planoLib.proximaDecisao(path.resolve(cwd, decisoes))) + '\n');
  process.exit(0);
}

if (abrirEm) {
  const sessao = arg('sessao') || process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID || 'sem-sessao';
  const a = planoLib.abrir(cwd, abrirEm, sessao);
  process.stdout.write('plano ativo: ' + a.arquivo + ' (dono: ' + a.sessionId + ')\n');
  process.exit(0);
}

const ativo = planoLib.lerAtivo(cwd);

// Bloco M / M2: o painel em texto, para o comando do mod. Saida 0 sempre: ler mal nao derruba nada.
if (process.argv.indexOf('--texto') !== -1) {
  // D442/3: o painel cita o caminho real deste script no "como abrir".
  const eu = __filename;
  // D442/10: arquivo presente que nao da plano (JSON quebrado, lista, sem "arquivo" texto) nao e "nenhum plano ativo".
  if (!(ativo && typeof ativo.arquivo === 'string' && ativo.arquivo) && fs.existsSync(path.join(cwd, planoLib.ATIVO))) {
    process.stdout.write(planoLib.painelIlegivel(eu) + '\n');
    process.exit(0);
  }
  let tarefasDoPainel = [];
  if (ativo && ativo.arquivo) {
    try { tarefasDoPainel = planoLib.parseTarefas(fs.readFileSync(path.join(cwd, ativo.arquivo), 'utf8')); }
    catch (e) { process.stdout.write('painel do plano\nnao consegui ler ' + ativo.arquivo + '\n'); process.exit(0); }
  }
  process.stdout.write(planoLib.painelTexto(ativo, tarefasDoPainel, eu) + '\n');
  process.exit(0);
}

if (!ativo) {
  process.stdout.write('nenhum plano ativo. Use --abrir <caminho do plano>\n');
  process.exit(0);
}

let tarefas = [];
try { tarefas = planoLib.parseTarefas(fs.readFileSync(path.join(cwd, ativo.arquivo), 'utf8')); }
catch (e) { process.stdout.write('ERRO: nao consegui ler ' + ativo.arquivo + '\n'); process.exit(1); }

const abertas = tarefas.filter(function (t) { return t.abertos > 0; });
// D442/9 (M-23/M-24): tarefa sem nenhuma caixa nao e concluida - o painel em texto ja dizia isso (D436).
const semCaixas = tarefas.filter(function (t) { return !(t.total > 0); }).length;
process.stdout.write(JSON.stringify({
  arquivo: ativo.arquivo,
  dono: ativo.sessionId,
  tarefas: tarefas.length,
  concluidas: tarefas.length - abertas.length - semCaixas,
  semCaixas: semCaixas,
  proximaAberta: abertas.length ? { n: abertas[0].n, titulo: abertas[0].titulo, abertos: abertas[0].abertos } : null
}, null, 2) + '\n');
