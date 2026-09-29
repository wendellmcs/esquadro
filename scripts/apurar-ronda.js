#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const veredito = require('./lib/veredito.js');
const estado = require('./lib/estado.js');
const cegar = require('./lib/cegar.js');
const caminho = require('./lib/caminho.js');

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

/** O mapa.json de uma ronda, ou null. */
function lerMapaJson(base, ronda) {
  try { return JSON.parse(fs.readFileSync(path.join(base, ronda, 'mapa.json'), 'utf8')); } catch (err) { return null; }
}

/** O arquivo revisado por uma base: o do mapa.json da ultima ronda dela. */
function arquivoDaBase(base) {
  const rs = rondasDe(base);
  if (!rs.length) return null;
  const m = lerMapaJson(base, rs[rs.length - 1].name);
  return m && typeof m.arquivo === 'string' ? m.arquivo : null;
}

function falhar(texto) {
  process.stdout.write(texto);
  process.exit(1);
}

/**
 * D257 secao 11, item 11: qual base apurar. Uma base por arquivo (revisao/<id>/<n>/); a pasta
 * numerada solta em revisao/ e o formato da 0.3.0, e mantem o comportamento de antes.
 */
function escolherBase() {
  const antigo = cegar.temPastaNumeradaSolta(revisao);
  const alvo = arg('arquivo');
  if (process.argv.indexOf('--arquivo') !== -1 && (!alvo || alvo.startsWith('--'))) {
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
      if (doAntigo === rel) return revisao;
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
        return '  ' + (arquivoDaBase(b) || path.basename(b));
      }).join('\n') + '\n');
  }
  return bases[0];
}

let base;
try { base = escolherBase(); } catch (err) {
  falhar('ERRO: nao consegui ler as revisoes (' + err.message + '). Confira a pasta citada e rode de novo.\n');
}
// Os caminhos das mensagens: relativos ao cwd, com barra normal, os da base escolhida.
const baseRel = path.relative(cwd, base).split(path.sep).join('/');
const arquivoRevisado = arquivoDaBase(base);
let rondas = [];
const mapas = [];
const semMapa = [];
const ilegiveis = [];
const invalidos = [];
try {
  rondas = rondasDe(base)
    .map(function (e) {
      // D244/defeito 3: o mapa diz qual rotulo e o lado novo. Sem ele (pacote antigo), a ronda
      // e contada como antes, pelos dois lados, e a saida diz que foi assim.
      const mj = lerMapaJson(base, e.name);
      const mapa = (mj && mj.mapa) || null;
      if (!mapa) semMapa.push(Number(e.name));
      mapas.push(mapa);
      const dir = path.join(base, e.name, 'vereditos');
      let arquivos = [];
      try { arquivos = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); }); } catch (err) { arquivos = []; }
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
} catch (e) {
  process.stdout.write('ERRO: nao consegui ler as rondas de ' + baseRel + ': ' + e.message + '\n');
  process.exit(1);
}

// D218 (ronda 1 do 8c.5): o veredito que nao se lia virava empate sem achados e contava a
// ronda como seca. Um voto que falta nao e voto a favor: para aqui, antes de apurar e de
// contar a revisao como fechada. D223 e D228 (ronda 2 do 8c.10): o que se le mas nao e
// veredito tambem e voto que falta, e para do mesmo jeito.
if (ilegiveis.length || invalidos.length) {
  for (const i of ilegiveis) process.stdout.write('ERRO: veredito ilegivel em ' + i + '\n');
  for (const i of invalidos) process.stdout.write('ERRO: veredito invalido em ' + i + '\n');
  process.stdout.write('Regrave cada um como o JSON do veredito - lente, melhor (A, B ou empate) e a ' +
    'lista de achados - e rode este comando de novo.\n');
  process.exit(1);
}

// D244/defeito 3: achado refutado na fonte primaria, com a prova. Arquivo que nao se le e
// erro, como veredito ilegivel: refutacao que falta nao pode virar ronda molhada calada.
let refutados = [];
const arqRefutados = path.join(base, 'refutados.json');
if (fs.existsSync(arqRefutados)) {
  try { refutados = JSON.parse(fs.readFileSync(arqRefutados, 'utf8')); } catch (err) {
    process.stdout.write('ERRO: refutados.json ilegivel: ' + err.message + '\n');
    process.exit(1);
  }
}

let r;
try {
  r = veredito.apurar(rondas, { mapas: mapas, refutados: refutados });
} catch (err) {
  process.stdout.write('ERRO: ' + err.message + '\n');
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
  }
  if (previa && previa.ronda === r.ronda) {
    contada = { jaContada: true, sessao: previa.sessao };
  } else {
    const sessao = arg('sessao') || process.env.CLAUDE_CODE_SESSION_ID || 'sem-sessao';
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
