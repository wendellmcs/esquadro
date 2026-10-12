#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const calibracao = require('./lib/calibracao.js');
const config = require('./lib/config.js');
const texto = require('./lib/texto.js');
const { LIMIARES_PADRAO } = require('./lib/saude.js');

/**
 * Item 2 da 0.7 (D466/D467): o calibrador por projeto (skill /esquadro:calibrar).
 *   node calibrar.js [--pasta <transcricoes>]  le e imprime o relatorio (so numeros), nao grava nada
 *   node calibrar.js --gravar <tokens>          poe limiares.tokensDeContexto no projeto.json (so com o sim do dono)
 * Sem --pasta, procura as transcricoes do projeto em <CLAUDE_CONFIG_DIR ou ~/.claude>/projects/.
 * Saida: JSON; na falha, `erro` e exit 1.
 */
const RELATIVO = '.claude/esquadro/projeto.json';
const MINIMO = 50000;

function valor(nome) {
  const i = process.argv.indexOf(nome);
  const v = i !== -1 ? process.argv[i + 1] : null;
  return v && !v.startsWith('--') ? v : null;
}

function sair(codigo, dados) {
  process.stdout.write(JSON.stringify(dados, null, 2) + '\n');
  process.exit(codigo);
}

const raiz = config.raizDoProjeto(process.cwd());
const projeto = config.carregarProjeto(raiz);
const limiares = (projeto && projeto.limiares) || {};
const alarme = typeof limiares.tokensAlarme === 'number' ? limiares.tokensAlarme : LIMIARES_PADRAO.tokensAlarme;

if (process.argv.indexOf('--gravar') !== -1) {
  const bruto = valor('--gravar');
  const n = Number(bruto);
  if (!bruto || !/^\d+$/.test(bruto) || n < MINIMO || n >= alarme) {
    sair(1, { gravou: false, erro: '--gravar pede um numero inteiro de tokens, de ' + MINIMO + ' ate abaixo do alarme (' + alarme + '); veio "' + bruto + '"' });
  }
  const arquivo = config.caminhoEmEsquadro(raiz, 'projeto.json');
  if (!fs.existsSync(arquivo)) sair(1, { gravou: false, erro: 'sem ' + RELATIVO + ' neste projeto: rode /esquadro:init antes' });
  let obj;
  try { obj = JSON.parse(texto.semBom(fs.readFileSync(arquivo, 'utf8'))); } catch (e) {
    sair(1, { gravou: false, erro: RELATIVO + ' nao e JSON valido (' + e.message + '); corrija e rode de novo' });
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) sair(1, { gravou: false, erro: RELATIVO + ' nao e um objeto JSON' });
  if ('limiares' in obj && (!obj.limiares || typeof obj.limiares !== 'object' || Array.isArray(obj.limiares))) {
    sair(1, { gravou: false, erro: 'limiares em ' + RELATIVO + ' nao e objeto; corrija e rode de novo' });
  }
  obj.limiares = Object.assign({}, obj.limiares, { tokensDeContexto: n });
  try { fs.writeFileSync(arquivo, JSON.stringify(obj, null, 2) + '\n'); } catch (e) {
    sair(1, { gravou: false, erro: 'nao consegui gravar ' + RELATIVO + ' (' + e.message + ')' });
  }
  sair(0, { gravou: true, tokensDeContexto: n, arquivo: RELATIVO });
}

const pasta = valor('--pasta') ? path.resolve(valor('--pasta')) : calibracao.pastaDasTranscricoes(raiz);
if (!pasta || !fs.existsSync(pasta)) {
  sair(1, { erro: 'nao achei as transcricoes deste projeto (' + calibracao.nomeDaPasta(raiz) + ' em projects/ da pasta de config do Claude Code); passe --pasta <pasta das transcricoes>' });
}
const lidas = calibracao.lerPasta(pasta);
const relatorio = calibracao.calibrar(lidas.sessoes, { limiarAtual: limiares.tokensDeContexto });
relatorio.amostra.chamadasSemPreco = lidas.semPreco;
sair(0, Object.assign({ pasta: pasta }, relatorio));
