#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cegar = require('./lib/cegar.js');
const git = require('./lib/git.js');
const caminho = require('./lib/caminho.js');
const config = require('./lib/config.js');
const textoLib = require('./lib/texto.js');

/**
 * D244/defeito 9: a secao "## Regua ..." do regras.md do projeto, do cabecalho ate o proximo
 * `## ` (as `###` de dentro vao junto). Sem a secao, null. Acento no cabecalho nao importa.
 * F2-12: `## ` dentro de bloco cercado (``` ou ~~~) nao e cabecalho: nao abre a secao nem a corta. A cerca
 * abre com 3 ou mais do mesmo marcador e so fecha com o mesmo marcador, em igual ou maior numero.
 */
function secaoDaRegua(texto) {
  const linhas = String(texto == null ? '' : texto).split(/\r?\n/);
  const semAcento = function (l) { return l.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  const emCerca = [];
  let aberta = null;
  linhas.forEach(function (l) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (aberta === null) {
      emCerca.push(false);
      if (m) aberta = m[1];
    } else {
      emCerca.push(true);
      if (m && m[1][0] === aberta[0] && m[1].length >= aberta.length && m[2].trim() === '') aberta = null;
    }
  });
  const ini = linhas.findIndex(function (l, i) { return !emCerca[i] && /^##\s+regua\b/i.test(semAcento(l)); });
  if (ini === -1) return null;
  let fim = linhas.length;
  for (let i = ini + 1; i < linhas.length; i++) if (!emCerca[i] && /^##\s/.test(linhas[i])) { fim = i; break; }
  return linhas.slice(ini, fim).join('\n').trim() + '\n';
}

const USO = 'uso: preparar-revisao.js --arquivo <caminho relativo> [--semente <texto>]\n';

// 0.3.2, item 10: flag presente sem valor (ultima da linha) ou seguida de outra flag ("--arquivo
// --semente x") deixava o alvo virar "--semente", ou a semente cair calada no pid. Agora e erro de uso
// que diz qual flag ficou sem valor.
//
// 0.3.3, itens 13 e 14: so e "valor que falta" quando o proximo argumento e outra flag do USO (um arquivo
// chamado `--x.js` vale) ou quando e vazio (`--semente ''` caia no pid, calado).
const FLAGS_DO_USO = ['--arquivo', '--semente'];
function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1) return null;
  const valor = process.argv[i + 1];
  if (valor === undefined || valor === '' || FLAGS_DO_USO.indexOf(valor) !== -1) {
    process.stdout.write('ERRO: --' + nome + ' pede um valor.\n' + USO);
    process.exit(1);
  }
  return valor;
}

// 0.3.2, item 8: "nao esta em HEAD" (git respondeu com status diferente de zero) e arquivo novo; git que
// nem respondeu (timeout, falha de spawn) NAO e: tratar como novo deixava o lado antigo vazio e calado.
// Devolve { texto } (esta em HEAD), { novo: true } (nao esta) ou { erro: <causa> }.
//
// 0.3.3, item 9: o status do `git show` sozinho nao separa "arquivo novo" de "objeto que nao se le" (fora do
// HEAD = 128, e em repositorio sem commit tambem 128; morto por sinal = null). Status 0 e o texto; o que nao
// e 0 se classifica: `ls-tree --full-tree` vazio = novo (listado = o objeto existe e nao se le = erro); se o
// ls-tree falha, `rev-parse --verify` = 1 e repositorio sem commit (novo), qualquer outro resultado e erro.
// --full-tree porque o ls-tree resolve o caminho a partir da pasta atual e `relRaiz` vem da raiz do repo.
// O caminho feliz gasta um processo so.
// 0.3.3, item 12: maxBuffer explicito; o padrao (1 MiB) estourava em arquivo maior no HEAD.
const MAX_BUFFER = 64 * 1024 * 1024;
function rodarGit(cwd, args) {
  return spawnSync('git', args, {
    cwd: cwd, encoding: 'utf8', shell: false, timeout: 10000, windowsHide: true, maxBuffer: MAX_BUFFER
  });
}
function versaoNoHead(cwd, relRaiz) {
  const r = rodarGit(cwd, ['show', 'HEAD:' + relRaiz]);
  if (!r) return { erro: 'sem resposta do git' };
  if (r.error) return { erro: r.error.code || r.error.message };
  if (r.status === 0) return { texto: r.stdout };
  if (r.status === null) return { erro: 'o git terminou por sinal (' + (r.signal || 'desconhecido') + ')' };
  const t = rodarGit(cwd, ['ls-tree', '--full-tree', 'HEAD', '--', relRaiz]);
  if (t && !t.error && t.status === 0) {
    if (String(t.stdout).trim() === '') return { novo: true };
    return { erro: 'o HEAD lista o arquivo mas o git nao consegue ler o objeto (status ' + r.status + ')' };
  }
  const v = rodarGit(cwd, ['rev-parse', '--verify', '-q', 'HEAD']);
  if (v && !v.error && v.status === 1) return { novo: true };
  // F2-11: a causa em portugues; os status crus do git ficam so entre parenteses, no fim.
  return { erro: 'o git nao respondeu se o arquivo esta no HEAD (codigos: show ' + r.status + ', ls-tree ' +
    (t ? (t.error ? (t.error.code || 'erro') : t.status) : 'sem resposta') + ', rev-parse ' +
    (v ? (v.error ? (v.error.code || 'erro') : v.status) : 'sem resposta') + ')' };
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
  process.stdout.write('ERRO: nao consegui ler ' + rel + ' (causa: ' + textoLib.causaDoErro(e) + '). ' +
    'Confira se e um arquivo que voce pode ler, e nao uma pasta, e rode de novo.\n');
  process.exit(1);
}

// R-T12-01 (D118): `git show HEAD:<caminho>` resolve pela RAIZ do repositorio, e o
// --arquivo chega relativo ao cwd. Sem descontar o prefixo, rodar de uma subpasta
// NEGA arquivo que esta em HEAD - falso negativo, e com uma mensagem que mente o
// motivo. A conversao ja existe no git.js desde a D41; aqui so se consome.
const pre = git.prefixo(cwd);
if (pre === null) {
  // 0.3.3, item 16: a mensagem diz o que fazer.
  process.stdout.write('ERRO: nao consegui falar com o git. Fora de um repositorio? A revisao compara o arquivo ' +
    'com o HEAD: rode de dentro de um repositorio git e confira se o git responde nesta pasta ' +
    '("git rev-parse --show-prefix"). Nada foi gravado.\n');
  process.exit(1);
}

// D244/defeito 10: arquivo que nao esta em HEAD e arquivo NOVO. Antes ele era recusado, e o
// CSS novo da onda 7 ficou sem inspecao nenhuma. Agora o lado antigo e vazio e o pacote diz.
const doHead = versaoNoHead(cwd, pre + rel);
if (doHead.erro === 'ENOBUFS') {
  // 0.3.3, item 12: rodar de novo nao resolve; o arquivo no HEAD e maior que o limite.
  process.stdout.write('ERRO: ' + rel + ' no HEAD do git passa do limite da revisao cega (' +
    (MAX_BUFFER / 1024 / 1024) + ' MiB; causa: ENOBUFS). Nada foi gravado. Revise um arquivo menor, ' +
    'ou divida este.\n');
  process.exit(1);
}
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

// 0.3.3, item 11: a regua e parte do pacote. Le-se ANTES de criar qualquer pasta: ausente (ENOENT) ou sem a
// secao = sem regua, como antes; outra falha de leitura e ERRO e nao grava nada. O regras.md mora na raiz do
// projeto, que pode estar acima da pasta atual (D244/defeito 1). A gravacao do regua.md e la embaixo, no try.
let secaoRegua = null;
try {
  secaoRegua = secaoDaRegua(fs.readFileSync(path.join(config.raizDoProjeto(cwd), '.claude', 'esquadro', 'regras.md'), 'utf8'));
} catch (e) {
  if (!e || e.code !== 'ENOENT') {
    process.stdout.write('ERRO: nao consegui ler .claude/esquadro/regras.md (causa: ' + (e ? textoLib.causaDoErro(e) : 'desconhecida') +
      '). Nada foi gravado. Confira se e um arquivo que voce pode ler, e nao uma pasta, e rode de novo.\n');
    process.exit(1);
  }
}

/**
 * F2-07: as pastas que faltam para chegar a `pai`, da mais funda para a mais rasa - as que o mkdir recursivo
 * vai CRIAR neste run. Lido antes do mkdir porque o retorno dele (a primeira pasta criada) vem no Windows como
 * caminho estendido (`\\?\C:\...`), que nao se compara com os caminhos daqui.
 */
function pastasQueFaltam(pai) {
  const faltam = [];
  for (let p = pai; !fs.existsSync(p); p = path.dirname(p)) {
    faltam.push(p);
    if (path.dirname(p) === p) break;
  }
  return faltam;
}

/**
 * F2-07: o rename falhou depois do mkdir recursivo: as pastas que ESTE run criou e que ficaram vazias saem, da
 * mais funda para a mais rasa. So rmdir (nunca remocao recursiva): pasta com algo dentro falha, e a remocao
 * para ali. Pasta que ja existia antes nao esta na lista, e nao e tocada.
 */
function desfazerPastasVazias(faltavam) {
  for (const p of faltavam) {
    try { fs.rmdirSync(p); } catch (e) { return; }
  }
}

// 0.3.3, item 2 (decisao do dono, 2026-09-29): base por arquivo que ja tem fechada.json e revisao FECHADA.
// Preparar de novo nao herda as rondas antigas nem o teto gasto: a base inteira e movida (nada se apaga) para
// .claude/esquadro/revisao-fechada/<id>/<carimbo>/ - FORA de revisao/, senao o escolherBase do apurar-ronda a
// veria como outra revisao - e a revisao nova comeca na ronda 1. Base sem fechada.json (em andamento) segue
// como antes; o formato antigo (pastas numeradas soltas) fica fora. renameSync so vale no mesmo volume: a
// pasta de arquivo mora ao lado de revisao/.
let arquivada = null;
if (!formatoAntigo && fs.existsSync(path.join(base, 'fechada.json'))) {
  const pai = path.join(path.dirname(revisao), 'revisao-fechada', path.basename(base));
  const d = new Date();
  const dois = function (v) { return String(v).padStart(2, '0'); };
  const carimbo = d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()) + '-' +
    dois(d.getHours()) + dois(d.getMinutes()) + dois(d.getSeconds());
  let destino = path.join(pai, carimbo);
  for (let k = 2; fs.existsSync(destino); k++) destino = path.join(pai, carimbo + '-' + k);
  const faltavam = pastasQueFaltam(pai);
  try {
    fs.mkdirSync(pai, { recursive: true });
    fs.renameSync(base, destino);
    arquivada = destino;
  } catch (e) {
    // F2-10: ENOENT e a base ja sem fechada.json = outro preparar a arquivou entre a nossa conferencia e o
    // rename. Nao e erro: a revisao fechada esta guardada (por ele) e esta e uma base nova. Qualquer outro
    // erro do rename, ou ENOENT com a fechada.json ainda la, segue no ERRO.
    if (e && e.code === 'ENOENT' && !fs.existsSync(path.join(base, 'fechada.json'))) {
      // segue como base nova: arquivada fica null, e nada a dizer sobre para onde a anterior foi.
    } else {
      desfazerPastasVazias(faltavam);
      process.stdout.write('ERRO: a revisao de ' + rel + ' ja esta fechada (fechada.json) e nao consegui arquivar ' +
        path.relative(cwd, base).replace(/\\/g, '/') + ' em ' + path.relative(cwd, destino).replace(/\\/g, '/') +
        ' (causa: ' + textoLib.causaDoErro(e) + '). Nada foi gravado. Feche o que estiver usando essa pasta e ' +
        'rode de novo.\n');
      process.exit(1);
    }
  }
}

const n = cegar.proximaRonda(base);
const dir = path.join(base, String(n));
const dirRel = path.relative(cwd, dir).replace(/\\/g, '/');

// 0.3.2, item 11: o id da revisao antiga, lido ANTES de gravar a ronda nova (que cairia na mesma
// pasta solta). O mapa.json da revisao diz de que arquivo ela era; sem ele legivel, o aviso diz a regra do
// id em vez de inventar um.
// 0.3.3, item 15: percorre as pastas numeradas soltas da ultima para a primeira ate achar um mapa.json
// legivel com `arquivo` (antes lia so a n-1, e um mapa ausente ou quebrado ali calava o id).
let idAntigo = null;
let arquivoAntigo = null;
if (formatoAntigo) {
  let numeradas = [];
  try {
    numeradas = fs.readdirSync(revisao, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory() && /^\d+$/.test(e.name); })
      .map(function (e) { return e.name; })
      .sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
  } catch (e) { numeradas = []; }
  for (let i = 0; i < numeradas.length && !idAntigo; i++) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(revisao, numeradas[i], 'mapa.json'), 'utf8'));
      if (m && typeof m.arquivo === 'string' && m.arquivo !== '') {
        arquivoAntigo = m.arquivo;
        idAntigo = cegar.idDoArquivo(m.arquivo);
      }
    } catch (e) { /* esta pasta nao tem mapa legivel: tenta a anterior */ }
  }
}

const r = cegar.rotular(
  [{ nome: 'HEAD', conteudo: anterior }, { nome: 'trabalho', conteudo: atual }],
  sementeTexto + '|' + rel
);

// 0.3.2, item 9: falha de disco ao criar a pasta ou gravar o pacote vira ERRO com o caminho, sem
// stack trace. Se a pasta da ronda ja existe, o erro diz qual ficou pela metade: o apurar-ronda conta
// toda pasta numerada como ronda, entao ela tem de ser apagada antes de rodar de novo.
let criada = false;
let regua = null;
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
  // 0.3.3, item 11: a regua e parte do pacote, gravada aqui dentro: falha = "ficou pela metade".
  if (secaoRegua) {
    fs.writeFileSync(path.join(dir, 'regua.md'), secaoRegua, 'utf8');
    regua = path.join(dir, 'regua.md');
  }
} catch (e) {
  const causa = textoLib.causaDoErro(e);
  // F2-09: nos dois ramos, a revisao anterior (arquivada por este run) diz para onde foi.
  const ondeFoi = arquivada ? ' A revisao anterior ja foi arquivada em ' + path.relative(cwd, arquivada).replace(/\\/g, '/') + '.' : '';
  if (criada) {
    process.stdout.write('ERRO: nao consegui gravar o pacote em ' + dirRel + ' (causa: ' + causa + '). ' +
      'A pasta ' + dirRel + ' ficou pela metade: apague-a antes de rodar de novo, senao o apurar-ronda ' +
      'a conta como uma ronda. Depois rode de novo.' + ondeFoi + '\n');
  } else {
    process.stdout.write('ERRO: nao consegui criar a pasta da ronda ' + dirRel + ' (causa: ' + causa + '). ' +
      'Nada foi gravado. Confira se .claude/esquadro/revisao, e cada pasta do caminho ate ela, e uma pasta ' +
      'e nao um arquivo, e rode de novo.' + ondeFoi + '\n');
  }
  process.exit(1);
}

let aviso = 'mapa.json revela os lados. Nao o abra, e nao o mostre a nenhum inspetor.';
if (arquivada) {
  // 0.3.3, item 2: a saida diz para onde a revisao fechada foi.
  aviso += ' A revisao anterior deste arquivo ja estava fechada (fechada.json): foi movida inteira, sem apagar ' +
    'nada, para ' + path.relative(cwd, arquivada).replace(/\\/g, '/') + '. Esta e a ronda 1 de uma revisao ' +
    'nova, com o teto de 3 rondas inteiro.';
}
if (novo) {
  aviso += ' E arquivo novo: um dos lados e vazio, a cegueira nao existe; julgue o lado cheio pelo que ele e, ' +
    'e diga isso no fecho.';
}
if (formatoAntigo) {
  aviso += ' A revisao em andamento esta no formato antigo (pastas numeradas soltas em ' +
    '.claude/esquadro/revisao/). Terminada ela, mova essas pastas numeradas para dentro de ' +
    '.claude/esquadro/revisao/<id>/, mantendo os numeros; <id> e ' + cegar.REGRA_DO_ID +
    ' (a/b.js vira ' + cegar.idDoArquivo('a/b.js') + ').';
  if (idAntigo) {
    aviso += ' O arquivo dessa revisao e ' + arquivoAntigo + ', entao o destino e ' +
      '.claude/esquadro/revisao/' + idAntigo + '/.';
  } else {
    // 0.3.3, item 17: o proximo passo. O aviso ja diz a regra do id logo acima.
    aviso += ' Nao consegui ler o mapa.json de nenhuma pasta numerada para dizer o id dessa revisao. ' +
      'Descubra o caminho do arquivo que essa revisao inspecionou e aplique a regra do id a ele.';
  }
  // F2-08: a base antiga e a propria revisao/, e o arquivamento automatico (acima) so vale para o formato
  // novo. Se ela ja estava fechada, o aviso diz isso e como arquivar a mao.
  if (fs.existsSync(path.join(base, 'fechada.json'))) {
    aviso += ' Essa revisao ja estava fechada (revisao/fechada.json) e fica fora do arquivamento automatico: para ' +
      'arquivar, mova as pastas numeradas e o fechada.json para .claude/esquadro/revisao-fechada/' +
      (idAntigo || '<id>') + '/<carimbo>/ (o <carimbo> e a data e a hora, como 2026-09-29-173045) e prepare de novo.';
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
if (arquivada) saida.arquivada = arquivada;
if (!regua) saida.semRegua = 'nenhuma regua declarada no regras.md do projeto (secao "## Regua ...")';
process.stdout.write(JSON.stringify(saida, null, 2) + '\n');
