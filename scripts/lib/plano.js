'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RE_TAREFA = /^#{2,4}\s*Tarefa\s+(\d+)\s*[:.\-]\s*(.+?)\s*$/i;
const RE_CAIXA = /^\s*-\s*\[( |x|X)\]/;
const ATIVO = path.join('.claude', 'esquadro', 'plano-ativo.json');

/** CLAUDE.md: etapa so e completa quando TODOS os subitens dela estao feitos. */
function parseTarefas(texto) {
  const linhas = String(texto == null ? '' : texto).split(/\r?\n/);
  const tarefas = [];
  let atual = null;
  linhas.forEach(function (linha, i) {
    const cab = linha.match(RE_TAREFA);
    if (cab) {
      atual = { n: parseInt(cab[1], 10), titulo: cab[2].trim(), abertos: 0, total: 0, linha: i + 1 };
      tarefas.push(atual);
      return;
    }
    const caixa = linha.match(RE_CAIXA);
    if (caixa && atual) {
      atual.total += 1;
      if (caixa[1] === ' ') atual.abertos += 1;
    }
  });
  return tarefas;
}

function lerAtivo(cwd) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(cwd, ATIVO), 'utf8'));
    return o && typeof o === 'object' ? o : null;
  } catch (e) { return null; }
}

function abrir(cwd, arquivoDoPlano, sessionId) {
  const dado = {
    arquivo: String(arquivoDoPlano).replace(/\\/g, '/'),
    sessionId: String(sessionId || 'sem-sessao'),
    tarefa: null
  };
  const alvo = path.join(cwd, ATIVO);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, JSON.stringify(dado, null, 2) + '\n', 'utf8');
  return dado;
}

/** F17: Outra sessao detem este plano. */
function donoOutro(ativo, sessionId) {
  if (!ativo || !ativo.sessionId) return false;
  return ativo.sessionId !== String(sessionId || 'sem-sessao');
}

/**
 * O erro cometido nesta sessao: numerar decisao pela memoria do ultimo numero escrito.
 * Numero de decisao se le do disco, sempre.
 */
function proximaDecisao(arquivoDeDecisoes) {
  let texto;
  try { texto = fs.readFileSync(arquivoDeDecisoes, 'utf8'); } catch (e) { return 1; }
  let maior = 0;
  const re = /^#{2,4}\s*D(\d+)\b/gim;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > maior) maior = n;
  }
  return maior + 1;
}

const RE_CONCLUIDA = /\b(tarefa|etapa|onda|fase)\s+\d*\s*(esta |foi |)?(conclu[ií]d|fechad|finalizad|pronta|complet)|\b(conclu[ií]|fech|finaliz|complet)\w*\s+(a|o)?\s*(tarefa|etapa|onda|fase)\b/i;

function alegaEtapaConcluida(texto) {
  return RE_CONCLUIDA.test(String(texto == null ? '' : texto));
}

function motivoSubitemAberto(tarefa) {
  return [
    'esquadro - subitem pendente = etapa aberta.',
    '',
    'Voce disse que a etapa esta concluida, mas a Tarefa ' + tarefa.n + ' ("' + tarefa.titulo + '")',
    'ainda tem ' + tarefa.abertos + ' de ' + tarefa.total + ' passos sem marcar no plano.',
    '',
    'Faca uma destas:',
    '  1. execute os passos que faltam e marque as caixas; ou',
    '  2. diga explicitamente que a etapa segue ABERTA, e qual passo ficou pendente.',
    '',
    'Etapa nao se fecha "com ressalva". Ou esta completa, ou esta aberta.'
  ].join('\n');
}

module.exports = {
  ATIVO, RE_TAREFA, RE_CAIXA, parseTarefas, lerAtivo, abrir, donoOutro,
  proximaDecisao, alegaEtapaConcluida, motivoSubitemAberto
};
