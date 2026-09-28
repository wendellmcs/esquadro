#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const veredito = require('./lib/veredito.js');
const estado = require('./lib/estado.js');

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  return i !== -1 ? process.argv[i + 1] : null;
}

const base = path.join(process.cwd(), '.claude', 'esquadro', 'revisao');
let rondas = [];
const mapas = [];
const semMapa = [];
const ilegiveis = [];
const invalidos = [];
try {
  rondas = fs.readdirSync(base, { withFileTypes: true })
    .filter(function (e) { return e.isDirectory() && /^\d+$/.test(e.name); })
    .sort(function (a, b) { return parseInt(a.name, 10) - parseInt(b.name, 10); })
    .map(function (e) {
      // D244/defeito 3: o mapa diz qual rotulo e o lado novo. Sem ele (pacote antigo), a ronda
      // e contada como antes, pelos dois lados, e a saida diz que foi assim.
      let mapa = null;
      try { mapa = JSON.parse(fs.readFileSync(path.join(base, e.name, 'mapa.json'), 'utf8')).mapa || null; }
      catch (err) { mapa = null; }
      if (!mapa) semMapa.push(Number(e.name));
      mapas.push(mapa);
      const dir = path.join(base, e.name, 'vereditos');
      let arquivos = [];
      try { arquivos = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); }); } catch (err) { arquivos = []; }
      return arquivos.map(function (f) {
        const nome = ['.claude', 'esquadro', 'revisao', e.name, 'vereditos', f].join('/');
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
  process.stdout.write('ERRO: nao ha revisao em ' + base + '\n');
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
  const sessao = arg('sessao') || process.env.CLAUDE_CODE_SESSION_ID || 'sem-sessao';
  contada = { sessao: sessao, revisao_fechada: estado.incrementar(sessao, 'revisao_fechada') };
}

process.stdout.write(JSON.stringify({
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
