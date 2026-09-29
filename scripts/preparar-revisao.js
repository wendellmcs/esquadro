#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cegar = require('./lib/cegar.js');
const git = require('./lib/git.js');
const caminho = require('./lib/caminho.js');
const config = require('./lib/config.js');

/**
 * D244/defeito 9: a secao "## Regua ..." do regras.md do projeto, do cabecalho ate o proximo
 * `## ` (as `###` de dentro vao junto). Sem a secao, null. Acento no cabecalho nao importa.
 */
function secaoDaRegua(texto) {
  const linhas = String(texto == null ? '' : texto).split(/\r?\n/);
  const semAcento = function (l) { return l.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  const ini = linhas.findIndex(function (l) { return /^##\s+regua\b/i.test(semAcento(l)); });
  if (ini === -1) return null;
  let fim = linhas.length;
  for (let i = ini + 1; i < linhas.length; i++) if (/^##\s/.test(linhas[i])) { fim = i; break; }
  return linhas.slice(ini, fim).join('\n').trim() + '\n';
}

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  return i !== -1 ? process.argv[i + 1] : null;
}

function versaoNoHead(cwd, rel) {
  const r = spawnSync('git', ['show', 'HEAD:' + rel], {
    cwd: cwd, encoding: 'utf8', shell: false, timeout: 10000, windowsHide: true
  });
  if (!r || r.error || r.status !== 0) return null;
  return r.stdout;
}

const cwd = process.cwd();
const alvo = arg('arquivo');
const sementeTexto = arg('semente') || String(process.pid);

if (!alvo) {
  process.stdout.write('uso: preparar-revisao.js --arquivo <caminho relativo> [--semente <texto>]\n');
  process.exit(1);
}

// D219 (ronda 1 do 8c.5): so dentro da pasta atual. O `..` e o absoluto de fora eram lidos
// e recebiam o motivo errado ("nao existe em HEAD"), e o inexistente estourava com stack
// trace. O `..` de subpasta ja nao achava o arquivo em HEAD: a guarda nao tira uso.
const rel = caminho.relativoAoProjeto(alvo.replace(/\\/g, '/'), cwd);
if (rel === null) {
  process.stdout.write('ERRO: ' + alvo + ' fica fora da pasta atual. Rode de uma pasta que o contenha, ' +
    'com o caminho relativo a ela.\n');
  process.exit(1);
}
if (!fs.existsSync(path.join(cwd, rel))) {
  process.stdout.write('ERRO: ' + rel + ' nao existe no disco. Confira o caminho, relativo a pasta atual.\n');
  process.exit(1);
}
const atual = fs.readFileSync(path.join(cwd, rel), 'utf8');

// R-T12-01 (D118): `git show HEAD:<caminho>` resolve pela RAIZ do repositorio, e o
// --arquivo chega relativo ao cwd. Sem descontar o prefixo, rodar de uma subpasta
// NEGA arquivo que esta em HEAD - falso negativo, e com uma mensagem que mente o
// motivo. A conversao ja existe no git.js desde a D41; aqui so se consome.
const pre = git.prefixo(cwd);
if (pre === null) {
  process.stdout.write('ERRO: nao consegui falar com o git. Fora de um repositorio?\n');
  process.exit(1);
}

// D244/defeito 10: arquivo que nao esta em HEAD e arquivo NOVO. Antes ele era recusado, e o
// CSS novo da onda 7 ficou sem inspecao nenhuma. Agora o lado antigo e vazio e o pacote diz.
const doHead = versaoNoHead(cwd, pre + rel);
const novo = doHead === null;
const anterior = novo ? '' : doHead;

// D257 secao 11, item 11: uma base por arquivo (revisao/<id>/<n>/). Revisao em andamento no formato
// da 0.3.0 - pasta numerada solta em revisao/ - segue na base unica, para nao partir a revisao ao meio.
const revisao = path.join(cwd, '.claude', 'esquadro', 'revisao');
const formatoAntigo = cegar.temPastaNumeradaSolta(revisao);
const base = formatoAntigo ? revisao : cegar.baseDoArquivo(revisao, rel);
const n = cegar.proximaRonda(base);
const dir = path.join(base, String(n));
fs.mkdirSync(dir, { recursive: true });

const r = cegar.rotular(
  [{ nome: 'HEAD', conteudo: anterior }, { nome: 'trabalho', conteudo: atual }],
  sementeTexto + '|' + rel
);

// Artefato INTEIRO. Fatia que corta funcao no meio faz o inspetor reportar o corte como defeito.
fs.writeFileSync(path.join(dir, 'A.txt'), r.A.conteudo, 'utf8');
fs.writeFileSync(path.join(dir, 'B.txt'), r.B.conteudo, 'utf8');
const mapaJson = { arquivo: rel, mapa: r.mapa };
if (novo) mapaJson.novo = true;
fs.writeFileSync(path.join(dir, 'mapa.json'), JSON.stringify(mapaJson, null, 2), 'utf8');
fs.mkdirSync(path.join(dir, 'vereditos'), { recursive: true });

// D244/defeito 9: a regua do projeto vai no pacote. O regras.md mora na raiz do projeto, que
// pode estar acima da pasta atual (defeito 1).
let regua = null;
try {
  const texto = fs.readFileSync(path.join(config.raizDoProjeto(cwd), '.claude', 'esquadro', 'regras.md'), 'utf8');
  const secao = secaoDaRegua(texto);
  if (secao) {
    regua = path.join(dir, 'regua.md');
    fs.writeFileSync(regua, secao, 'utf8');
  }
} catch (e) { regua = null; }

let aviso = 'mapa.json revela os lados. Nao o abra, e nao o mostre a nenhum inspetor.';
if (novo) {
  aviso += ' E arquivo novo: um dos lados e vazio, a cegueira nao existe; julgue o lado cheio pelo que ele e, ' +
    'e diga isso no fecho.';
}
if (formatoAntigo) {
  aviso += ' A revisao em andamento esta no formato antigo (base unica em revisao/). Terminada ela, mova as ' +
    'pastas numeradas para usar uma base por arquivo.';
}
const saida = {
  ronda: n,
  arquivo: rel,
  base: base,
  a: path.join(dir, 'A.txt'),
  b: path.join(dir, 'B.txt'),
  regua: regua,
  vereditos: path.join(dir, 'vereditos'),
  aviso: aviso
};
if (!regua) saida.semRegua = 'nenhuma regua declarada no regras.md do projeto (secao "## Regua ...")';
process.stdout.write(JSON.stringify(saida, null, 2) + '\n');
