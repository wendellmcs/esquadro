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
    // D442/10: JSON gravado no Windows costuma vir com BOM (D124); sem semBom o plano valido sumia calado.
    const o = JSON.parse(require('./texto.js').semBom(fs.readFileSync(path.join(cwd, ATIVO), 'utf8')));
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
// D442/8 (S-47, S-48): o id aceita "nº 3", "7b" e "1.2"; entre o id e o participio, ":"/"-"/travessao e "ja";
// na 2a forma o verbo e passado ou participio (concluí, fechei, fechamos, fechada): "vou concluir a tarefa",
// "antes de fechar a etapa" e "concluindo" deixam de alegar. Na 1a forma "complet" so como participio/adjetivo
// ("completa", "completado"): com o separador, "Tarefa 3: completar os testes" alegava.
const RE_CONCLUIDA = /\b(?:tarefa|etapa|onda|fase)s? (?:(?:n[º°.] ?)?\d+(?:\.\d+)*(?:[a-z](?![a-z]))?(?: ?(?:,|e) ?(?:n[º°.] ?)?\d+(?:\.\d+)*(?:[a-z](?![a-z]))?)* ?)?(?:[:\-–—] ?)?(?:j[aá] )?(?:est[aá] |est[aã]o |foi |foram )?(?:conclu[ií]d|fechad|finalizad|pronta|complet(?:[ao]s?|ad[ao]s?)\b)|\b(?:conclu(?:[ií](?:mos|ram|u|d[ao]s?)?)|(?:fech|finaliz|complet)(?:ei|ou|amos|aram|ad[ao]s?)) (?:(?:as|os|a|o) )?(?:tarefa|etapa|onda|fase)s?\b/i;

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
 * D442/3: o comando de abrir com o caminho real do plano.js (quem roda o script sabe onde ele esta), entre aspas.
 * Caminho fora de ASCII (R5) ou com `$`, crase ou `"` (o shell reinterpretaria) volta ao marcador, sem inventar.
 */
function comandoDeAbrir(script) {
  const cabeEntreAspas = typeof script === 'string' && /^[\x20-\x7E]+$/.test(script) && !/[$`"]/.test(script);
  return 'node ' + (cabeEntreAspas ? '"' + script + '"' : '<pasta do plugin esquadro>/scripts/plano.js') + ' --abrir <caminho do plano>';
}

/** D442/10: plano-ativo.json presente que nao se le (JSON quebrado, sem "arquivo") nao e "nenhum plano ativo". */
function painelIlegivel(script) {
  return 'painel do plano\n.claude/esquadro/plano-ativo.json existe mas nao se le (JSON quebrado, ou sem o campo ' +
    '"arquivo"). Abra o plano de novo: ' + comandoDeAbrir(script);
}

/**
 * Bloco M / M2 (D435): o painel do plano em texto (ASCII, R5) - o que o /esquadro-plano do mod
 * responde. Mostra a vista o que o portao de fecho so barra no fim: passo aberto = tarefa aberta.
 * D442/3: `script` e o caminho do plano.js para o "como abrir"; sem ele, o marcador.
 */
function painelTexto(ativo, tarefas, script) {
  if (!ativo || !ativo.arquivo) {
    // Sem "esquadro - " no titulo: o motor ja escreve o nome do plugin antes da resposta do comando.
    return 'painel do plano\nnenhum plano ativo (.claude/esquadro/plano-ativo.json). Para abrir: ' + comandoDeAbrir(script);
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
  proximaDecisao, alegaEtapaConcluida, motivoSubitemAberto, painelTexto, painelIlegivel
};
