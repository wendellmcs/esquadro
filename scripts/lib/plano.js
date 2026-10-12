'use strict';
const fs = require('node:fs');
const path = require('node:path');
const escopoLib = require('./escopo.js');

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

// D476: o painel le o formato real dos planos (o da 0.7 usa "### Item N —" sem caixas). So o painel: o portao de
// fecho segue no parseTarefas, porque nenhum teste prova que o formato largo nao barraria plano antigo a toa.
const RE_ITEM = /^#{2,4}\s*(Tarefa|Item|Etapa|Onda|Fase)\s+(\d+[a-z]?)\s*(?::|\.|-|—|–)\s*(.+?)\s*$/i;
const RE_FEITO = /\s*(?:\[feito\]|\(feito\))/ig;

/** Estado de um item: as caixas mandam; sem caixas, [FEITO]/(feito) no cabecalho = feita; senao "sem marca". */
function estadoDoItem(t) {
  if (t.abertos > 0) return 'aberta';
  if (t.total > 0) return 'feita';
  return t.feitoNoCabecalho ? 'feita' : 'sem marca';
}

function parseItens(texto) {
  const linhas = String(texto == null ? '' : texto).split(/\r?\n/);
  const itens = [];
  let atual = null;
  linhas.forEach(function (linha, i) {
    const cab = linha.match(RE_ITEM);
    if (cab) {
      atual = {
        tipo: cab[1], id: cab[2].toLowerCase(), n: parseInt(cab[2], 10),
        titulo: cab[3].replace(RE_FEITO, '').trim(), feitoNoCabecalho: cab[3].search(RE_FEITO) !== -1,
        abertos: 0, total: 0, linha: i + 1, nivel: linha.match(/^#+/)[0].length
      };
      itens.push(atual);
      return;
    }
    const caixa = linha.match(RE_CAIXA);
    if (caixa && atual) {
      atual.total += 1;
      if (caixa[1] === ' ') atual.abertos += 1;
    }
  });
  // R1 da revisao cega: "## Fase 1" que so agrupa "### Tarefa N" (sem caixa propria nem [FEITO], e o cabecalho
  // seguinte e mais fundo) nao e tarefa - senao aparecia como [?] num plano todo feito.
  const tarefas = itens.filter(function (t, i) {
    const prox = itens[i + 1];
    return !(t.total === 0 && !t.feitoNoCabecalho && prox && prox.nivel > t.nivel);
  });
  tarefas.forEach(function (t) { t.estado = estadoDoItem(t); });
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

/**
 * D476 (Tarefa 4 da 0.7.1): nada chamava `plano.js --abrir`, e o painel dizia "nenhum plano ativo" numa sessao
 * que trabalhava num plano. Sem plano-ativo.json, o plano vem do Objetivo da frente: o ULTIMO "Plano: <caminho>"
 * (a frente acumula planos; o mais novo fica no fim). Pontuacao que fecha a frase nao e do caminho.
 * R1 da revisao cega: caminho com espaco vai entre crases ou aspas; sem elas, vale ate o primeiro espaco.
 * R2: aceita `**Plano:**` do markdown e aspas simples; nao atravessa linha; aspa sem fechar e valor vazio nao contam
 * (nem apagam o "Plano:" anterior).
 */
function planosDoObjetivo(objetivo) {
  const re = /\bPlano:(?:\*\*)?[ \t]*(?:\*\*)?(?:`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'|([^\s`"'][^\s]*))/g;
  const texto = String(objetivo == null ? '' : objetivo);
  const achados = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const c = m[4] != null ? m[4].replace(/[.,;:)\]*'"`!?]+$/, '') : (m[1] || m[2] || m[3]).trim();
    if (c) achados.push(c);
  }
  return achados;
}

function planoDoObjetivo(objetivo) {
  const achados = planosDoObjetivo(objetivo);
  return achados.length ? achados[achados.length - 1] : null;
}

/** R2: com varios "Plano:", vale o ultimo que existe no disco (um "Plano: pendente" no fim nao apaga o real). */
function planoNoDisco(cwd, objetivo) {
  const achados = planosDoObjetivo(objetivo);
  for (let i = achados.length - 1; i >= 0; i--) {
    try { if (fs.existsSync(path.join(cwd, achados[i]))) return achados[i]; } catch (e) { /* segue */ }
  }
  return achados.length ? achados[achados.length - 1] : null;
}

/** null = o arquivo nao se le (R1: nao confundir com Objetivo sem "Plano:"). */
function objetivoDoArquivo(abs) {
  try { return escopoLib.parse(fs.readFileSync(abs, 'utf8')).objetivo || ''; } catch (e) { return null; }
}

/**
 * D476: as frentes da pasta que declaram plano no Objetivo, em ordem de nome. R2: a frente cujo arquivo nao se le
 * entra com `ilegivel` (antes sumia da lista calada).
 */
function frentesComPlano(cwd) {
  const pasta = path.join(cwd, escopoLib.PASTA_FRENTES);
  let nomes = [];
  try {
    nomes = fs.readdirSync(pasta).filter(function (n) { return n.toLowerCase().slice(-3) === '.md'; }).sort();
  } catch (e) { nomes = []; }
  return nomes.map(function (n) {
    const objetivo = objetivoDoArquivo(path.join(pasta, n));
    if (objetivo === null) return { frente: n.slice(0, -3), arquivo: null, ilegivel: escopoLib.PASTA_FRENTES + n };
    return { frente: n.slice(0, -3), arquivo: planoNoDisco(cwd, objetivo), objetivo: objetivo };
  }).filter(function (f) { return f.arquivo || f.ilegivel; });
}

/**
 * D476: a frente vinculada a sessao manda (sem "Plano:" no Objetivo dela, o painel diz isso, nao pega o de outra);
 * sem vinculo, uma frente com plano no disco -> ela; varias -> { varias } para o painel listar. Nada -> null.
 */
function acharPlanoDaFrente(cwd, frenteVinculada) {
  if (frenteVinculada) {
    const rel = escopoLib.arquivoEmVigor(cwd, frenteVinculada);
    if (rel !== escopoLib.ARQUIVO) {
      const objetivo = objetivoDoArquivo(path.join(cwd, rel));
      if (objetivo === null) return { frente: escopoLib.nomeSeguro(frenteVinculada), arquivo: null, ilegivel: rel };
      return { frente: escopoLib.nomeSeguro(frenteVinculada), arquivo: planoNoDisco(cwd, objetivo), objetivo: objetivo };
    }
  }
  const lista = frentesComPlano(cwd);
  if (lista.length === 1) return lista[0];
  if (lista.length > 1) return { varias: lista };
  return null;
}

/** D476: sessoes gastas = marcas "(sessao N" / "(sessão N" no Objetivo da frente (cada sessao anota a sua). */
function sessoesDoObjetivo(objetivo) {
  return (String(objetivo == null ? '' : objetivo).match(/\(sess[aã]o\s+\d+/gi) || []).length;
}

/**
 * D476: (sessoes / feitas) x as que faltam, arredondada. Sem tarefa feita, ou sem nenhuma marca de sessao (R1: a
 * media 0 dava "0 sessoes" com trabalho pela frente), nao ha base (null).
 */
function estimativaDeSessoes(sessoes, feitas, faltam) {
  if (!(feitas > 0) || !(sessoes > 0)) return null;
  const media = sessoes / feitas;
  // R2: com trabalho pela frente, nunca "0 sessoes" (media < 0,5 com 1 que falta arredondava para 0).
  return { sessoes: faltam > 0 ? Math.max(1, Math.round(media * faltam)) : 0, media: media };
}

/** D476: varias frentes com plano e a sessao sem vinculo - lista e diz como escolher. */
function painelVariasFrentes(lista, script) {
  const linhas = ['painel do plano', 'nenhum plano ativo, e esta sessao nao esta ligada a nenhuma frente (frente = linha ' +
    'de trabalho com arquivo proprio em ' + escopoLib.PASTA_FRENTES + '). Frentes com plano:'];
  for (const f of lista) {
    linhas.push('  ' + escopoLib.ascii(f.frente) + ': ' + (f.arquivo ? escopoLib.ascii(f.arquivo) : '(o arquivo da frente nao se le)'));
  }
  linhas.push('Para escolher: edite o arquivo da frente que voce quer, ' + escopoLib.PASTA_FRENTES + '<frente>.md ' +
    '(qualquer edicao liga esta sessao a ela), e rode /esquadro-plano de novo; ou abra um plano: ' + comandoDeAbrir(script));
  return linhas.join('\n');
}

/** R1 da revisao cega: o arquivo da frente vinculada existe mas nao se le - nao e "frente sem Plano:". */
function painelFrenteIlegivel(frente, rel) {
  return 'painel do plano\nnao consegui ler o arquivo da frente ' + escopoLib.ascii(frente) + ' (' + escopoLib.ascii(rel) +
    '). Confira se ele e um arquivo e se abre, e rode /esquadro-plano de novo.';
}

/** D476: a frente vinculada nao declara "Plano: <caminho>" no Objetivo. */
function painelFrenteSemPlano(frente, script) {
  return 'painel do plano\na frente ' + escopoLib.ascii(frente) + ' nao tem "Plano: <caminho>" no Objetivo. Anote o plano ' +
    'no fim do Objetivo, ou abra um: ' + comandoDeAbrir(script);
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
  const linhas = ['painel do plano', ativo.frente
    // D476: plano achado pela frente (sem plano-ativo.json): diz de qual frente veio.
    ? 'plano: ' + escopoLib.ascii(ativo.arquivo) + ' (frente: ' + escopoLib.ascii(ativo.frente) + ')'
    : 'plano ativo: ' + ativo.arquivo + ' (dono: ' + (ativo.sessionId || 'sem-sessao') + ')'];
  const lista = Array.isArray(tarefas) ? tarefas : [];
  if (!lista.length) {
    linhas.push('o plano nao tem cabecalhos "### Tarefa N: titulo" (nem Item/Etapa/Onda/Fase N): o painel nao consegue ' +
      'contar as tarefas.');
    return linhas.join('\n');
  }
  // D476: os itens vem do parseItens (tipo, id, estado). Titulo e tipo em ASCII (R5): o plano real tem acento e travessao.
  const estado = function (t) { return t.estado; };
  const rotulo = function (t) { return escopoLib.ascii(t.tipo) + ' ' + escopoLib.ascii(t.id); };
  const titulo = function (t) { return escopoLib.ascii(t.titulo); };
  const abertas = lista.filter(function (t) { return estado(t) === 'aberta'; });
  // Tarefa sem caixa de passo nem [FEITO]: o portao nao a cobra, mas o painel nao a da como feita.
  const feitas = lista.filter(function (t) { return estado(t) === 'feita'; });
  linhas.push('tarefas: ' + feitas.length + ' de ' + lista.length + ' concluidas');
  for (const t of lista) {
    const e = estado(t);
    linhas.push(e === 'aberta'
      ? '  [ ] ' + rotulo(t) + ': ' + titulo(t) + ' (' + t.abertos + ' de ' + t.total + ' passos abertos)'
      : e === 'feita'
        ? '  [x] ' + rotulo(t) + ': ' + titulo(t)
        : '  [?] ' + rotulo(t) + ': ' + titulo(t) + ' (sem caixas de passo nem [FEITO]: o painel nao sabe se esta feita)');
  }
  const p = abertas[0];
  const semCaixas = lista.filter(function (t) { return estado(t) === 'sem marca'; }).length;
  linhas.push(p
    ? 'proxima: ' + rotulo(p) + ' "' + titulo(p) + '" - faltam ' + p.abertos + ' de ' + p.total + ' passos'
    : semCaixas
      // D436: so tarefa sem caixa sobrando nao e plano acabado - o painel nao sabe se ela esta feita.
      ? 'proxima: nenhuma tarefa com passo aberto; ' + semCaixas + ' sem caixas de passo, confira a mao'
      : 'proxima: nenhuma tarefa aberta');
  // D476 (item 4): o que falta (tudo que nao esta feito, inclusive o [?]), as sessoes gastas e a estimativa com a base.
  const faltam = lista.filter(function (t) { return estado(t) !== 'feita'; });
  linhas.push(faltam.length
    ? 'falta: ' + faltam.length + ' de ' + lista.length + ' (' + faltam.map(rotulo).join(', ') + ')'
    : 'falta: nada');
  return linhas.concat(linhasDeSessoes(ativo, feitas.length, faltam.length)).join('\n');
}

/** D476 (item 4): "sessoes gastas:" e "estimativa:" com a base da conta. */
function linhasDeSessoes(ativo, feitas, faltam) {
  if (!ativo.frente) {
    // plano-ativo.json nao tem Objetivo de frente: sem as marcas, nao ha o que contar.
    return [
      'sessoes gastas: nao contadas - este plano foi aberto com --abrir, sem frente; as sessoes se contam pelas marcas ' +
        '"(sessao N, ...)" que cada sessao anota no Objetivo da frente',
      'estimativa: sem as sessoes gastas nao ha base (para contar, anote "Plano: <caminho>" no Objetivo de uma frente ' +
        'e apague ' + ATIVO.replace(/\\/g, '/') + ')'
    ];
  }
  const sessoes = function (n) { return n + (n === 1 ? ' sessao' : ' sessoes'); };
  const gastas = sessoesDoObjetivo(ativo.objetivo);
  const linhas = ['sessoes gastas: ' + gastas + ' (marcas "(sessao N, ...)" no Objetivo da frente ' + escopoLib.ascii(ativo.frente) + ')'];
  if (!faltam) return linhas.concat('estimativa: nada falta');
  if (!gastas) {
    return linhas.concat('estimativa: sem base (o Objetivo da frente nao tem nenhuma marca "(sessao N, ...)"; cada sessao ' +
      'anota a sua)');
  }
  const est = estimativaDeSessoes(gastas, feitas, faltam);
  if (!est) return linhas.concat('estimativa: sem base para estimar ainda (nenhuma tarefa feita)');
  const media = est.media.toFixed(1).replace('.', ',') + (est.media === 1 ? ' sessao' : ' sessoes');
  return linhas.concat('estimativa: ' + sessoes(est.sessoes) + ' para ' +
    (faltam === 1 ? 'a 1 que falta' : 'as ' + faltam + ' que faltam') + ' (base: media de ' + media +
    ' por tarefa feita = ' + sessoes(gastas) + ' / ' + feitas + (feitas === 1 ? ' feita)' : ' feitas)'));
}

module.exports = {
  ATIVO, RE_TAREFA, RE_CAIXA, parseTarefas, parseItens, lerAtivo, abrir, donoOutro,
  proximaDecisao, alegaEtapaConcluida, motivoSubitemAberto, painelTexto, painelIlegivel,
  planoDoObjetivo, frentesComPlano, acharPlanoDaFrente, painelVariasFrentes, painelFrenteSemPlano,
  sessoesDoObjetivo, estimativaDeSessoes, painelFrenteIlegivel
};
