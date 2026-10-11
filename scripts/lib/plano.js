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

// N1: roda no gancho Stop, tem de ser linear. O texto passa antes por `\s+ -> ' '`: com um unico espaco
// entre os tokens, o regex nao tem `\s+`/`\s*` adjacentes nem aninhados (era o backtracking quadratico).
// N2: plural ("tarefas", "as tarefas") e lista de numeros ("1 e 2", "3, 4 e 5"), com os auxiliares
// plurais ("estao", "foram"). Sem o nome da tarefa dentro da lista: cada nome da cadeia ("tarefa 1 e
// tarefa 2 concluidas") ja casa sozinho, e a lista nao atravessa outro nome (cada inicio e local).
// Mesmas duas formas do RE_ALEGA_N de scripts/portao-fecho.js (paridade em test/portao-fecho.test.js).
const RE_CONCLUIDA = /\b(?:tarefa|etapa|onda|fase)s? (?:\d+(?: ?(?:,|e) ?\d+)* ?)?(?:est[aá] |est[aã]o |foi |foram )?(?:conclu[ií]d|fechad|finalizad|pronta|complet)|\b(?:conclu[ií]|fech|finaliz|complet)\w* (?:(?:as|os|a|o) )?(?:tarefa|etapa|onda|fase)s?\b/i;

function alegaEtapaConcluida(texto) {
  return RE_CONCLUIDA.test(String(texto == null ? '' : texto).replace(/\s+/g, ' '));
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

/**
 * Bloco M / M2 (D435): o painel do plano em texto (ASCII, R5) - o que o /esquadro-plano do mod
 * responde. Mostra a vista o que o portao de fecho so barra no fim: passo aberto = tarefa aberta.
 */
function painelTexto(ativo, tarefas) {
  if (!ativo || !ativo.arquivo) {
    // Sem "esquadro - " no titulo: o motor ja escreve o nome do plugin antes da resposta do comando.
    return 'painel do plano\nnenhum plano ativo (.claude/esquadro/plano-ativo.json). Para abrir: ' +
      'node <pasta do plugin esquadro>/scripts/plano.js --abrir <caminho do plano>';
  }
  const linhas = ['painel do plano','plano ativo: ' + ativo.arquivo + ' (dono: ' + (ativo.sessionId || 'sem-sessao') + ')'];
  const lista = Array.isArray(tarefas) ? tarefas : [];
  if (!lista.length) {
    linhas.push('o plano nao tem cabecalhos "### Tarefa N: titulo": o painel nao consegue contar as tarefas.');
    return linhas.join('\n');
  }
  const abertas = lista.filter(function (t) { return t.abertos > 0; });
  // Tarefa sem nenhuma caixa de passo: o portao nao a cobra, mas o painel nao a da como feita.
  const feitas = lista.filter(function (t) { return t.total > 0 && t.abertos === 0; });
  linhas.push('tarefas: ' + feitas.length + ' de ' + lista.length + ' concluidas');
  for (const t of lista) {
    linhas.push(t.abertos > 0
      ? '  [ ] Tarefa ' + t.n + ': ' + t.titulo + ' (' + t.abertos + ' de ' + t.total + ' passos abertos)'
      : t.total > 0
        ? '  [x] Tarefa ' + t.n + ': ' + t.titulo
        : '  [?] Tarefa ' + t.n + ': ' + t.titulo + ' (sem caixas de passo: o painel nao sabe se esta feita)');
  }
  const p = abertas[0];
  const semCaixas = lista.filter(function (t) { return !(t.total > 0); }).length;
  linhas.push(p
    ? 'proxima: Tarefa ' + p.n + ' "' + p.titulo + '" - faltam ' + p.abertos + ' de ' + p.total + ' passos'
    : semCaixas
      // D436: so tarefa sem caixa sobrando nao e plano acabado - o painel nao sabe se ela esta feita.
      ? 'proxima: nenhuma tarefa com passo aberto; ' + semCaixas + ' sem caixas de passo, confira a mao'
      : 'proxima: nenhuma tarefa aberta');
  return linhas.join('\n');
}

module.exports = {
  ATIVO, RE_TAREFA, RE_CAIXA, parseTarefas, lerAtivo, abrir, donoOutro,
  proximaDecisao, alegaEtapaConcluida, motivoSubitemAberto, painelTexto
};
