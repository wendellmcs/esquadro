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

const USO = 'uso: preparar-revisao.js --arquivo <caminho relativo> [--semente <texto>]\n';

// 0.3.2, item 10: flag presente sem valor (ultima da linha) ou seguida de outra flag ("--arquivo
// --semente x") deixava o alvo virar "--semente", ou a semente cair calada no pid. Agora e erro de uso
// que diz qual flag ficou sem valor.
function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1) return null;
  const valor = process.argv[i + 1];
  if (valor === undefined || valor.slice(0, 2) === '--') {
    process.stdout.write('ERRO: --' + nome + ' pede um valor.\n' + USO);
    process.exit(1);
  }
  return valor;
}

// 0.3.2, item 8: "nao esta em HEAD" (git respondeu com status diferente de zero) e arquivo novo; git que
// nem respondeu (timeout, falha de spawn) NAO e: tratar como novo deixava o lado antigo vazio e calado.
// Devolve { texto } (esta em HEAD), { novo: true } (nao esta) ou { erro: <causa> }.
function versaoNoHead(cwd, rel) {
  const r = spawnSync('git', ['show', 'HEAD:' + rel], {
    cwd: cwd, encoding: 'utf8', shell: false, timeout: 10000, windowsHide: true
  });
  if (!r) return { erro: 'sem resposta do git' };
  if (r.error) return { erro: r.error.code || r.error.message };
  if (r.status !== 0) return { novo: true };
  return { texto: r.stdout };
}

const cwd = process.cwd();
const alvo = arg('arquivo');
const sementeTexto = arg('semente') || String(process.pid);

if (!alvo) {
  process.stdout.write(USO);
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
// 0.3.2, item 9: o arquivo existe mas pode nao ser lido (e uma pasta, sem permissao). Sem o try
// isso saia como stack trace.
let atual;
try {
  atual = fs.readFileSync(path.join(cwd, rel), 'utf8');
} catch (e) {
  process.stdout.write('ERRO: nao consegui ler ' + rel + ' (causa: ' + (e.code || e.message) + '). ' +
    'Confira se e um arquivo que voce pode ler, e nao uma pasta, e rode de novo.\n');
  process.exit(1);
}

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
if (doHead.erro) {
  process.stdout.write('ERRO: nao consegui ler ' + rel + ' no HEAD do git (causa: ' + doHead.erro + '). ' +
    'Nada foi gravado. Rode de novo; se repetir, confira se "git show HEAD:' + pre + rel +
    '" responde nesta pasta.\n');
  process.exit(1);
}
const novo = doHead.novo === true;
const anterior = novo ? '' : doHead.texto;

// D257 secao 11, item 11: uma base por arquivo (revisao/<id>/<n>/). Revisao em andamento no formato
// da 0.3.0 - pasta numerada solta em revisao/ - segue na base unica, para nao partir a revisao ao meio.
const revisao = path.join(cwd, '.claude', 'esquadro', 'revisao');
const formatoAntigo = cegar.temPastaNumeradaSolta(revisao);
const base = formatoAntigo ? revisao : cegar.baseDoArquivo(revisao, rel);
const n = cegar.proximaRonda(base);
const dir = path.join(base, String(n));
const dirRel = path.relative(cwd, dir).replace(/\\/g, '/');

// 0.3.2, item 11: o id da revisao antiga, lido ANTES de gravar a ronda nova (que cairia na mesma
// pasta solta). O mapa.json da ultima pasta numerada diz de que arquivo era a revisao; sem ele legivel,
// o aviso diz a regra do id em vez de inventar um.
let idAntigo = null;
let arquivoAntigo = null;
if (formatoAntigo) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(revisao, String(n - 1), 'mapa.json'), 'utf8'));
    if (m && typeof m.arquivo === 'string' && m.arquivo !== '') {
      arquivoAntigo = m.arquivo;
      idAntigo = cegar.idDoArquivo(m.arquivo);
    }
  } catch (e) { idAntigo = null; }
}

const r = cegar.rotular(
  [{ nome: 'HEAD', conteudo: anterior }, { nome: 'trabalho', conteudo: atual }],
  sementeTexto + '|' + rel
);

// 0.3.2, item 9: falha de disco ao criar a pasta ou gravar o pacote vira ERRO com o caminho, sem
// stack trace. Se a pasta da ronda ja existe, o erro diz qual ficou pela metade: o apurar-ronda conta
// toda pasta numerada como ronda, entao ela tem de ser apagada antes de rodar de novo.
let criada = false;
try {
  fs.mkdirSync(dir, { recursive: true });
  criada = true;
  // Artefato INTEIRO. Fatia que corta funcao no meio faz o inspetor reportar o corte como defeito.
  fs.writeFileSync(path.join(dir, 'A.txt'), r.A.conteudo, 'utf8');
  fs.writeFileSync(path.join(dir, 'B.txt'), r.B.conteudo, 'utf8');
  const mapaJson = { arquivo: rel, mapa: r.mapa };
  if (novo) mapaJson.novo = true;
  fs.writeFileSync(path.join(dir, 'mapa.json'), JSON.stringify(mapaJson, null, 2), 'utf8');
  fs.mkdirSync(path.join(dir, 'vereditos'), { recursive: true });
} catch (e) {
  const causa = e.code || e.message;
  if (criada) {
    process.stdout.write('ERRO: nao consegui gravar o pacote em ' + dirRel + ' (causa: ' + causa + '). ' +
      'A pasta ' + dirRel + ' ficou pela metade: apague-a antes de rodar de novo, senao o apurar-ronda ' +
      'a conta como uma ronda. Depois rode de novo.\n');
  } else {
    process.stdout.write('ERRO: nao consegui criar a pasta da ronda ' + dirRel + ' (causa: ' + causa + '). ' +
      'Nada foi gravado. Confira se .claude/esquadro/revisao, e cada pasta do caminho ate ela, e uma pasta ' +
      'e nao um arquivo, e rode de novo.\n');
  }
  process.exit(1);
}

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
  aviso += ' A revisao em andamento esta no formato antigo (pastas numeradas soltas em ' +
    '.claude/esquadro/revisao/). Terminada ela, mova essas pastas numeradas para dentro de ' +
    '.claude/esquadro/revisao/<id>/, mantendo os numeros; <id> e o caminho do arquivo revisado com cada / ' +
    'trocado por __ e cada caractere fora de letras, numeros, ".", "_" e "-" trocado por _ ' +
    '(a/b.js vira a__b.js).';
  if (idAntigo) {
    aviso += ' O arquivo dessa revisao e ' + arquivoAntigo + ', entao o destino e ' +
      '.claude/esquadro/revisao/' + idAntigo + '/.';
  } else {
    aviso += ' Nao consegui ler o mapa.json da ultima pasta numerada para dizer o id dessa revisao.';
  }
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
