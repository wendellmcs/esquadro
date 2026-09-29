'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.js');
const regraLib = require('./regra.js');
const escopoLib = require('./escopo.js');
const planoLib = require('./plano.js');
const estado = require('./estado.js');

// A2: compactacao preserva o sentido e destroi a literalidade.
// Depois dela eu sei que existe uma regra de escopo, e nao sei mais QUAL e o escopo.
const ORIGENS_COM_ESTADO = ['compact', 'resume', 'clear', 'fork'];

function bloco(titulo, linhas) {
  return ['', '## ' + titulo, ''].concat(linhas).join('\n');
}

const NAO_DECLARADO = 'nao declarado';

/** Texto nao vazio, ou a confissao de que o campo nao foi declarado. Nunca `null`
 *  cru: reinjetar "quem decide: null" seria pior que reinjetar nada - o agente le
 *  `null` como se fosse um valor. */
function declarado(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : NAO_DECLARADO;
}

/**
 * D116 / R-T10-22: as quatro respostas da entrevista do `/esquadro:init`
 * (`modeloDeAmeaca`, `quemDecide`, `provaDePronto`, `fontesCanonicas`) eram
 * gravadas, validadas na forma e lidas por NINGUEM - nem portao, nem reinjecao.
 * Duas das dez regras semeadas mandam consultar justamente esses valores ("a menos
 * que esteja em fontesCanonicas", E15; "o shell declarado em projeto.json", F16),
 * o que obrigava o agente a ABRIR ARQUIVO para obedecer a regra - o oposto do que
 * a reinjecao existe para fazer. Por isso o `plataforma.shell` vem junto.
 *
 * A fonte e o `projeto.json`, nao o `regras.md`: o criterio de fecho escrito no
 * ledger da T10 ("se o regras.md passar a carregar as quatro respostas") ficou
 * impossivel depois da D115 - prosa acrescentada ao `regras.md` e descartada em
 * silencio pelo `parseRegras`, medido. Duplicar as respostas no `regras.md` daria
 * duas fontes para o mesmo fato, e a que o dono edita a mao dessincronizaria calada.
 */
function contexto(cwd) {
  const p = config.carregarProjeto(cwd);
  if (!p) return null;

  const alcance = p.modeloDeAmeaca === 'interno' || p.modeloDeAmeaca === 'publico'
    ? 'projeto ' + p.modeloDeAmeaca
    : 'alcance ' + NAO_DECLARADO;

  const fontes = (Array.isArray(p.fontesCanonicas) ? p.fontesCanonicas : [])
    .filter(function (f) { return typeof f === 'string' && f.trim(); })
    .map(function (f) { return f.trim(); });

  const plat = p.plataforma && typeof p.plataforma === 'object' ? p.plataforma : {};
  const shell = declarado(plat.shell);
  const so = declarado(plat.so);

  return [
    'Contexto declarado: ' + alcance +
      ' | quem decide: ' + declarado(p.quemDecide) +
      ' | prova de pronto: ' + declarado(p.provaDePronto),
    'Fontes canonicas (mandam de verdade, nesta ordem): ' +
      (fontes.length ? fontes.join(', ') : 'nenhuma declarada'),
    'Shell declarado: ' + shell +
      (shell !== NAO_DECLARADO && so !== NAO_DECLARADO ? ' (' + so + ')' : '')
  ];
}

/** Texto curto que o SessionStart reinjeta. A2: reinjecao depois da compactacao. */
function nucleo(cwd) {
  try {
    const texto = fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'regras.md'), 'utf8');
    const regras = regraLib.parseRegras(texto);
    if (!regras.length) return null;
    const linhas = ['# esquadro - regras deste projeto (reinjetadas nesta sessao)', ''];
    // D116: o contexto e cabecalho, nao substituto - a regra segue sendo o corpo.
    // Sem projeto.json nao ha contexto a declarar, e a reinjecao das regras nao pode
    // morrer por isso: e a ausencia normal de todo projeto antes do /esquadro:init.
    const ctx = contexto(cwd);
    if (ctx) linhas.push(ctx.join('\n'), '');
    // 0.3.2, item 16: projeto.json PRESENTE e ilegivel (JSON quebrado, ou nao e objeto) faz o
    // config devolver null, igual ao ausente - e a reinjecao saia calada, sem o contexto.
    // Ausente segue como sempre (o normal antes do /esquadro:init); ilegivel avisa e diz o que fazer.
    if (!ctx && fs.existsSync(path.join(cwd, '.claude', 'esquadro', 'projeto.json'))) {
      linhas.push(
        'ATENCAO: .claude/esquadro/projeto.json existe mas nao se le (JSON quebrado ou nao e um objeto), ' +
        'entao o contexto declarado nao entra aqui. Corrija o JSON ou rode /esquadro:init de novo.',
        ''
      );
    }
    for (const r of regras) linhas.push('- ' + r.gatilho + ' -> ' + r.acao);
    linhas.push('');
    linhas.push(
      ctx
        ? 'Fonte das regras: .claude/esquadro/regras.md; do contexto: ' +
          '.claude/esquadro/projeto.json. Regra numerica se cita com arquivo:linha.'
        : 'Fonte: .claude/esquadro/regras.md. Regra numerica se cita com arquivo:linha.'
    );
    return linhas.join('\n') + '\n';
  } catch (e) {
    return null;
  }
}

function montar(cwd, sessionId, origem) {
  const partes = [];

  const regras = nucleo(cwd);
  if (regras) partes.push(regras.replace(/\s*$/, ''));

  if (ORIGENS_COM_ESTADO.indexOf(String(origem)) === -1) {
    return partes.length ? partes.join('\n') + '\n' : null;
  }

  const estadoPartes = [];

  const s = estado.ler(sessionId);
  const frente = s.frente;
  const esc = escopoLib.carregar(cwd, frente);
  if (esc && (esc.dentro.length || esc.objetivo)) {
    const linhas = [];
    // Com vinculo a uma frente que ainda existe, a primeira linha diz qual e -
    // sem isto, depois de uma compactacao o agente le "Dentro do escopo" e nao
    // tem como saber que o arquivo que manda e o da frente, nao o escopo.md.
    const arquivo = escopoLib.arquivoEmVigor(cwd, frente);
    if (frente && arquivo !== escopoLib.ARQUIVO) linhas.push('Frente: ' + escopoLib.nomeSeguro(frente) + ' (' + arquivo + ')');
    if (esc.objetivo) linhas.push('Objetivo: ' + esc.objetivo);
    linhas.push('Dentro do escopo:');
    for (const d of esc.dentro) linhas.push('  - ' + d);
    if (esc.fora.length) {
      linhas.push('Fora de escopo (a parte que funciona):');
      for (const f of esc.fora) linhas.push('  - ' + f);
    }
    estadoPartes.push(bloco('ESTADO - escopo declarado', linhas));
  }

  const ativo = planoLib.lerAtivo(cwd);
  if (ativo) {
    try {
      const tarefas = planoLib.parseTarefas(fs.readFileSync(path.join(cwd, ativo.arquivo), 'utf8'));
      const aberta = tarefas.filter(function (t) { return t.abertos > 0; })[0];
      const linhas = ['Plano: ' + ativo.arquivo, 'Dono: ' + ativo.sessionId];
      if (aberta) {
        linhas.push('Tarefa aberta: Tarefa ' + aberta.n + ' - ' + aberta.titulo);
        linhas.push('Passos por marcar: ' + aberta.abertos + ' de ' + aberta.total);
        linhas.push('RELEIA o texto dessa tarefa NO ARQUIVO antes de continuar. Nao de memoria.');
      } else {
        linhas.push('Todas as tarefas com os passos marcados.');
      }
      estadoPartes.push(bloco('ESTADO - plano em execucao', linhas));
    } catch (e) { /* plano ilegivel nao derruba a abertura */ }
  }

  const c = s.contadores || {};
  const chaves = Object.keys(c);
  if (chaves.length) {
    estadoPartes.push(bloco('ESTADO - portoes que dispararam nesta sessao',
      chaves.map(function (k) { return '  ' + c[k] + 'x ' + k; })));
  }

  if (!estadoPartes.length) return partes.length ? partes.join('\n') + '\n' : null;
  return partes.concat(estadoPartes).join('\n') + '\n';
}

module.exports = { ORIGENS_COM_ESTADO, contexto, nucleo, montar };
