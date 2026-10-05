#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const veredito = require('./lib/veredito.js');
const estado = require('./lib/estado.js');
const cegar = require('./lib/cegar.js');
const caminho = require('./lib/caminho.js');
const textoLib = require('./lib/texto.js');

// F2-01: so e "valor que falta" quando o proximo argumento e outra flag do USO deste script (como o
// FLAGS_DO_USO do preparar-revisao.js): um arquivo chamado `--x.js` vale como caminho.
const FLAGS_DO_USO = ['--sessao', '--arquivo'];

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  return i !== -1 ? process.argv[i + 1] : null;
}

const cwd = process.cwd();
const revisao = path.join(cwd, '.claude', 'esquadro', 'revisao');

/** As pastas numeradas (as rondas) de uma base, em ordem. */
function rondasDe(base) {
  try {
    return fs.readdirSync(base, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory() && /^\d+$/.test(e.name); })
      .sort(function (a, b) { return parseInt(a.name, 10) - parseInt(b.name, 10); });
  } catch (err) {
    // Ronda 2 da T4: so a pasta ausente e "nenhuma ronda"; outro erro sobe, com a causa.
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

/** Os caminhos das mensagens: relativos ao cwd, com barra normal. */
function relDoCwd(p) {
  return path.relative(cwd, p).split(path.sep).join('/');
}

/**
 * O mapa.json de uma ronda, ou null quando nao ha (pacote antigo, sem mapa). 0.3.3, item 6: o que
 * existe e nao se le como o objeto que o preparar-revisao.js grava ({ arquivo, mapa: {...} }) para
 * aqui - antes virava "ronda sem mapa" calado e a ronda contava pelos dois lados.
 * F2-06: na listagem "ha N revisoes" (naListagem) o mapa ruim nao para o comando: lanca MAPA_ILEGIVEL, e a
 * listagem poe "(mapa ilegivel)" na linha da base.
 */
const MAPA_ILEGIVEL = new Error('mapa ilegivel');
function lerMapaJson(base, ronda, naListagem) {
  const arq = path.join(base, ronda, 'mapa.json');
  const corrompido = function (motivo) {
    if (naListagem) throw MAPA_ILEGIVEL;
    falhar('ERRO: ' + relDoCwd(arq) + ' esta corrompido (' + motivo + '). Ele diz qual arquivo a ronda revisou e ' +
      'qual rotulo e o lado novo; sem ele legivel os achados nao se separam por lado. Apague a pasta ' +
      relDoCwd(path.dirname(arq)) + '/ e prepare a ronda de novo (Passo 1 do /esquadro:revisar), regrave os ' +
      'vereditos dela e rode este comando de novo.\n');
  };
  let texto;
  try { texto = fs.readFileSync(arq, 'utf8'); } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    corrompido(textoLib.causaDoErro(err));
  }
  let mj;
  try { mj = JSON.parse(texto); } catch (err) { corrompido(err.message); }
  if (!mj || typeof mj !== 'object' || Array.isArray(mj)) corrompido('nao e um objeto');
  if (!mj.mapa || typeof mj.mapa !== 'object' || Array.isArray(mj.mapa)) corrompido('"mapa" nao e um objeto');
  return mj;
}

/** O arquivo revisado por uma base: o do mapa.json da ultima ronda dela. */
function arquivoDaBase(base, pastas, naListagem) {
  const rs = pastas || rondasDe(base);
  if (!rs.length) return null;
  const m = lerMapaJson(base, rs[rs.length - 1].name, naListagem);
  return m && typeof m.arquivo === 'string' ? m.arquivo : null;
}

function falhar(texto) {
  process.stdout.write(texto);
  process.exit(1);
}

/**
 * 0.3.2, item 7: o mesmo arquivo em grafias diferentes (barra invertida, "./" na frente) e o mesmo.
 * 0.3.3, item 5: e o "../" no meio do caminho (a/../b) tambem.
 */
function grafiaUnica(p) {
  return path.posix.normalize(String(p).replace(/\\/g, '/')).replace(/^(\.\/)+/, '');
}

/**
 * 0.3.3, item 5: as duas grafias sao o mesmo arquivo. Iguais depois de grafiaUnica, sim. Diferindo so
 * na caixa, quem diz e o disco: os dois existem e tem o mesmo dev+ino (sistema de arquivos que nao
 * distingue a caixa); num que distingue, sao dois nomes e nao se juntam. Sem olhar a plataforma.
 */
function mesmoArquivo(a, b) {
  const x = grafiaUnica(a);
  const y = grafiaUnica(b);
  if (x === y) return true;
  if (x.toLowerCase() !== y.toLowerCase()) return false;
  try {
    const sx = fs.statSync(path.resolve(cwd, x), { bigint: true });
    const sy = fs.statSync(path.resolve(cwd, y), { bigint: true });
    // F2-13: dev ou ino 0 e campo que o sistema de arquivos nao preenche: dois zeros nao confirmam nada.
    if (sx.dev === 0n || sx.ino === 0n) return false;
    return sx.dev === sy.dev && sx.ino === sy.ino;
  } catch (err) {
    // Um dos dois nao existe (ou nao se le): o disco nao confirma que sejam o mesmo arquivo.
    return false;
  }
}

/** A classe do estado.js: letras, numeros, "_" e "-". */
function validarSessao(valor, origem) {
  if (!/^[a-zA-Z0-9_-]+$/.test(valor)) {
    falhar('ERRO: o valor de ' + origem + ' (' + valor + ') nao serve de id de sessao. Use so letras, numeros, ' +
      '"_" e "-" (exemplo: --sessao minha-sessao) e rode de novo.\n');
  }
}

/**
 * 0.3.2, itens 2 e 3: a sessao vem de --sessao ou do ambiente, e vai crua para o fechada.json e para o
 * contador. 0.3.3, item 4: o --sessao e entrada de quem roda - sem valor, ou fora da classe, para aqui,
 * antes de escolher a base, fechando a revisao ou nao. O valor do AMBIENTE so se valida onde vai ser
 * usado (a revisao fecha e o fecho nao foi contado): ambiente ruim nao para uma ronda que nao fecha.
 * Devolve { valor, origem }; valor null = nenhuma sessao.
 */
function sessaoDoUso() {
  const i = process.argv.indexOf('--sessao');
  if (i !== -1) {
    const valor = process.argv[i + 1];
    if (!valor || FLAGS_DO_USO.indexOf(valor) !== -1) {
      falhar('ERRO: --sessao sem valor. Passe o id da sessao: --sessao <id>, ou tire a flag para usar ' +
        'CLAUDE_CODE_SESSION_ID.\n');
    }
    validarSessao(valor, '--sessao');
    return { valor: valor, origem: '--sessao' };
  }
  if (process.env.CLAUDE_CODE_SESSION_ID) {
    return { valor: process.env.CLAUDE_CODE_SESSION_ID, origem: 'CLAUDE_CODE_SESSION_ID' };
  }
  return { valor: null, origem: '' };
}

/**
 * D257 secao 11, item 11: qual base apurar. Uma base por arquivo (revisao/<id>/<n>/); a pasta
 * numerada solta em revisao/ e o formato da 0.3.0, e mantem o comportamento de antes.
 */
function escolherBase() {
  const antigo = cegar.temPastaNumeradaSolta(revisao);
  const alvo = arg('arquivo');
  if (process.argv.indexOf('--arquivo') !== -1 && (!alvo || FLAGS_DO_USO.indexOf(alvo) !== -1)) {
    falhar('ERRO: --arquivo sem caminho. Passe o arquivo revisado: --arquivo <caminho>.\n');
  }
  if (alvo) {
    const rel = caminho.relativoAoProjeto(alvo.replace(/\\/g, '/'), cwd);
    if (rel === null) {
      falhar('ERRO: ' + alvo + ' fica fora da pasta atual. Rode de uma pasta que o contenha, ' +
        'com o caminho relativo a ela.\n');
    }
    const daqui = cegar.baseDoArquivo(revisao, rel);
    if (rondasDe(daqui).length) return daqui;
    if (antigo) {
      // Rondas 1 e 2 da T4: a plana e a revisao de um arquivo (o do mapa.json); a de outro, ou a sem
      // mapa que diga de qual, nao se apura calada.
      const doAntigo = arquivoDaBase(revisao);
      if (doAntigo && mesmoArquivo(doAntigo, rel)) return revisao;
      falhar('ERRO: a revisao no formato antigo (pastas numeradas soltas em revisao/) ' +
        (doAntigo ? 'e de ' + doAntigo + ', nao de ' + rel : 'nao diz de qual arquivo e') +
        '. Apure-a sem --arquivo.\n');
    }
    falhar('ERRO: nao ha revisao de ' + rel + '. Prepare-a antes com preparar-revisao.js --arquivo ' + rel +
      ' (Passo 1 do /esquadro:revisar).\n');
  }
  if (antigo) return revisao;
  let bases = [];
  try {
    bases = fs.readdirSync(revisao, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory() && rondasDe(path.join(revisao, e.name)).length > 0; })
      .map(function (e) { return path.join(revisao, e.name); });
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
    bases = [];
  }
  if (bases.length === 0) {
    falhar('ERRO: nao ha revisao em .claude/esquadro/revisao/. Prepare uma com preparar-revisao.js --arquivo ' +
      '<caminho> (Passo 1 do /esquadro:revisar).\n');
  }
  if (bases.length > 1) {
    falhar('ERRO: ha ' + bases.length + ' revisoes em ' + revisao + ' e nao sei qual apurar. Passe --arquivo ' +
      '<caminho> com um destes:\n' + bases.map(function (b) {
        try {
          return '  ' + (arquivoDaBase(b, null, true) || path.basename(b));
        } catch (err) {
          if (err !== MAPA_ILEGIVEL) throw err;
          return '  ' + path.basename(b) + ' (mapa ilegivel)';
        }
      }).join('\n') + '\n');
  }
  return bases[0];
}

const sessaoPedida = sessaoDoUso();

let base;
let pastas;
// 0.3.2, item 1: as pastas de ronda da base escolhida se leem uma vez, aqui, sob este tratamento so
// (causa e proximo passo). Antes havia uma leitura fora de qualquer try e um catch mais abaixo que
// nada alcancava: as rondas ja tinham sido lidas. Cobre tambem o item 5 (mensagem sem proximo passo).
try {
  base = escolherBase();
  pastas = rondasDe(base);
} catch (err) {
  falhar('ERRO: nao consegui ler as revisoes (' + textoLib.causaDoErro(err) + '). Confira a pasta citada e rode de novo.\n');
}
// Os caminhos das mensagens: relativos ao cwd, com barra normal, os da base escolhida.
const baseRel = path.relative(cwd, base).split(path.sep).join('/');
const arquivoRevisado = arquivoDaBase(base, pastas);
const mapas = [];
const semMapa = [];
const semVeredito = [];
const ilegiveis = [];
const invalidos = [];
const rondas = pastas
  .map(function (e) {
    // D244/defeito 3: o mapa diz qual rotulo e o lado novo. Sem ele (pacote antigo), a ronda
    // e contada como antes, pelos dois lados, e a saida diz que foi assim.
    const mj = lerMapaJson(base, e.name);
    const mapa = (mj && mj.mapa) || null;
    if (!mapa) semMapa.push(Number(e.name));
    mapas.push(mapa);
    const dir = path.join(base, e.name, 'vereditos');
    // 0.3.3, item 1: ronda sem nenhum veredito (pasta ausente, ou sem .json) nao e ronda seca, e voto
    // que falta - e o readdir nao zera mais em qualquer erro: a causa vai na mensagem.
    const dirRel = [baseRel, e.name, 'vereditos'].join('/') + '/';
    let arquivos = null;
    try { arquivos = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); }); } catch (err) {
      if (err && err.code === 'ENOENT') arquivos = [];
      else semVeredito.push('ERRO: nao consegui ler ' + dirRel + ' (' + textoLib.causaDoErro(err) + '). Confira essa pasta e ' +
        'rode este comando de novo.');
    }
    if (arquivos === null) return [];
    if (arquivos.length === 0) {
      semVeredito.push('ERRO: a ronda ' + Number(e.name) + ' nao tem nenhum veredito: ' + dirRel + ' nao existe ou ' +
        'nao tem nenhum .json. Grave os vereditos dela (Passo 2 do /esquadro:revisar) ou, se a ronda foi preparada ' +
        'por engano, apague a pasta ' + [baseRel, e.name].join('/') + '/, e rode este comando de novo.');
      return [];
    }
    return arquivos.map(function (f) {
      const nome = [baseRel, e.name, 'vereditos', f].join('/');
      let vd;
      try { vd = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (err) {
        ilegiveis.push(nome + ': ' + err.message);
        return null;
      }
      const erros = veredito.errosDoVeredito(vd);
      if (erros.length) { invalidos.push(nome + ': ' + erros.join('; ')); return null; }
      return vd;
    });
  });

// D218 (ronda 1 do 8c.5): o veredito que nao se lia virava empate sem achados e contava a
// ronda como seca. Um voto que falta nao e voto a favor: para aqui, antes de apurar e de
// contar a revisao como fechada. D223 e D228 (ronda 2 do 8c.10): o que se le mas nao e
// veredito tambem e voto que falta, e para do mesmo jeito.
if (semVeredito.length || ilegiveis.length || invalidos.length) {
  for (const i of semVeredito) process.stdout.write(i + '\n');
  for (const i of ilegiveis) process.stdout.write('ERRO: veredito ilegivel em ' + i + '\n');
  for (const i of invalidos) process.stdout.write('ERRO: veredito invalido em ' + i + '\n');
  if (ilegiveis.length || invalidos.length) {
    process.stdout.write('Regrave cada um como o JSON do veredito - lente, melhor (A, B ou empate) e a ' +
      'lista de achados - e rode este comando de novo.\n');
  }
  process.exit(1);
}

// D244/defeito 3: achado refutado na fonte primaria, com a prova. Arquivo que nao se le e
// erro, como veredito ilegivel: refutacao que falta nao pode virar ronda molhada calada.
let refutados = [];
const arqRefutados = path.join(base, 'refutados.json');
if (fs.existsSync(arqRefutados)) {
  try { refutados = JSON.parse(fs.readFileSync(arqRefutados, 'utf8')); } catch (err) {
    // 0.3.2, item 4: o erro cita o arquivo (cada base tem o seu) e diz o que fazer.
    process.stdout.write('ERRO: ' + baseRel + '/refutados.json ilegivel (' + err.message + '). Corrija o JSON ' +
      'ou apague o arquivo se nao ha refutacao, e rode este comando de novo.\n');
    process.exit(1);
  }
  // 0.3.3, item 3: o que se le mas nao e lista virava [] calado no apurar, e a refutacao sumia.
  if (!Array.isArray(refutados)) {
    process.stdout.write('ERRO: ' + baseRel + '/refutados.json nao e uma lista (veio ' +
      (refutados === null ? 'null' : typeof refutados) + '). A forma e uma lista de refutacoes, e [] quando nao ' +
      'ha refutacao. Corrija o arquivo e rode este comando de novo.\n');
    process.exit(1);
  }
}

let r;
try {
  r = veredito.apurar(rondas, { mapas: mapas, refutados: refutados });
} catch (err) {
  // 0.3.3, item 7: o erro diz o defeito; a linha seguinte diz onde corrigir e o que fazer depois.
  process.stdout.write('ERRO: ' + err.message + '\n' + 'Corrija a refutacao em ' + baseRel + '/refutados.json ' +
    '(ou o veredito que o erro cita) e rode este comando de novo.\n');
  process.exit(1);
}
const descartados = [];
for (const ronda of rondas) for (const vd of ronda) {
  for (const e of veredito.validarVeredito(vd).erros) descartados.push(e);
}

/**
 * D21/D120: "2+ revisoes independentes fechadas" e gatilho contavel de troca de chat, e ate aqui
 * ninguem incrementava a chave que o saude.js le. So conta quando a revisao FECHA — contador
 * inflado e D14 sem base. Este script e CLI, nao hook: a sessao vem de --sessao ou do ambiente.
 */
let contada = null;
if (r.encerrar) {
  // D257 secao 11, item 12: o fecho fica registrado na base (fechada.json). Apurar de novo a mesma
  // ronda ja fechada nao conta outra vez; ronda nova e outro fecho, e conta.
  const arqFechada = path.join(base, 'fechada.json');
  let previa = null;
  // Ronda 1 da T4: ilegivel e erro, como o refutados.json - recontar calado inflava o gatilho.
  if (fs.existsSync(arqFechada)) {
    try { previa = JSON.parse(fs.readFileSync(arqFechada, 'utf8')); } catch (err) {
      falhar('ERRO: ' + baseRel + '/fechada.json ilegivel (' + err.message + '). Ele registra o fecho ja ' +
        'contado desta revisao. Apague-o e rode de novo: o fecho sera contado outra vez.\n');
    }
    // 0.3.2, item 6: o que se le mas nao e o registro do fecho ({}, 5, [], null, "ronda" que nao e
    // inteira) tambem nao diz se o fecho foi contado; recontar calado inflava o gatilho.
    if (!previa || typeof previa !== 'object' || Array.isArray(previa) || !Number.isInteger(previa.ronda)) {
      falhar('ERRO: ' + baseRel + '/fechada.json nao tem o formato esperado (um objeto com "ronda" inteira). ' +
        'Ele registra o fecho ja contado desta revisao. Apague-o e rode de novo: o fecho sera contado outra vez.\n');
    }
  }
  if (previa && previa.ronda === r.ronda) {
    contada = { jaContada: true, sessao: previa.sessao };
  } else {
    // 0.3.3, item 4: o valor do ambiente so se valida aqui, onde vai ser usado - antes de contar e de gravar.
    if (sessaoPedida.origem === 'CLAUDE_CODE_SESSION_ID') validarSessao(sessaoPedida.valor, sessaoPedida.origem);
    const sessao = sessaoPedida.valor || 'sem-sessao';
    // Conta antes de gravar: fechada.json existir quer dizer que o fecho foi contado.
    let n;
    try { n = estado.incrementar(sessao, 'revisao_fechada'); } catch (err) {
      falhar('ERRO: a revisao fechou, mas o fecho nao foi contado (' + err.message + '). Rode este comando de novo.\n');
    }
    try {
      fs.writeFileSync(arqFechada, JSON.stringify({ ronda: r.ronda, sessao: sessao, motivo: r.motivo }, null, 2),
        'utf8');
    } catch (err) {
      falhar('ERRO: o fecho foi contado, mas ' + baseRel + '/fechada.json nao foi gravado (' + err.message + '). ' +
        'Corrija a gravacao nessa pasta antes de rodar de novo: rodar agora conta o fecho outra vez.\n');
    }
    contada = { sessao: sessao, revisao_fechada: n };
    // 0.3.3, item 8: sem sessao o fecho cai em "sem-sessao", que nenhuma sessao le. O aviso nao manda rodar
    // de novo: o fechada.json ja registra o fecho e rodar de novo nao o recontaria.
    if (!sessaoPedida.valor) {
      contada.aviso = 'o fecho nao entrou no contador de nenhuma sessao: sem --sessao e sem CLAUDE_CODE_SESSION_ID ' +
        'ele foi contado em "sem-sessao". Ele ja esta registrado em ' + baseRel + '/fechada.json e nao precisa ser ' +
        'refeito; na proxima revisao, passe --sessao <id>.';
    }
  }
}

process.stdout.write(JSON.stringify({
  arquivo: arquivoRevisado,
  ronda: r.ronda,
  rondasSecas: r.secas,
  encerrar: r.encerrar,
  motivo: r.motivo,
  placarDaUltimaRonda: r.placar,
  achadosNovosP0P1: r.novos,
  achadosDoLadoAntigo: r.achadosDoLadoAntigo,
  refutados: r.refutados,
  rondasSemMapa: semMapa,
  vereditosDescartados: descartados,
  revisaoFechadaContada: contada,
  lembrete: 'placar A/B e sinal; o achado com arquivo:linha e a prova'
}, null, 2) + '\n');
process.exit(0);
