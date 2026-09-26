'use strict';
/**
 * Criterio 7 da secao 10: alguem que nunca viu este projeto entende o README.
 * Isso nao da para testar. O que DA, e o que ja custou caro duas vezes, e que o
 * README nao minta sobre si mesmo.
 *
 * D134, defeito 5: "CHANGELOG com cinco travas, cinco perguntas, oito lentes -
 * os mesmos tres defeitos que o README tinha de manha". Numero escrito por
 * extenso envelhece calado, porque quem acrescenta a nona linha da tabela nao
 * volta ao paragrafo que diz "oito".
 *
 * D134, defeito 6: "plugin.json descrevia 4 portoes de 8 - descricao escrita na
 * T1 e nunca revista".
 *
 * Aqui cada numero que o README escreve sobre si e conferido contra o que o
 * proprio README contem, e cada skill citada e conferida contra o disco.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const README = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8');

const NUMEROS = {
  'uma': 1, 'um': 1, 'duas': 2, 'dois': 2, 'tres': 3, 'três': 3, 'quatro': 4,
  'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10, 'onze': 11,
  'doze': 12, 'treze': 13, 'quatorze': 14, 'catorze': 14, 'quinze': 15,
  'dezesseis': 16, 'dezessete': 17, 'dezoito': 18, 'dezenove': 19, 'vinte': 20
};

const ORDINAIS = {
  'sexta': 6, 'sétima': 7, 'setima': 7, 'oitava': 8, 'nona': 9, 'décima': 10, 'decima': 10
};

function porExtenso(palavra) {
  const n = NUMEROS[String(palavra).toLowerCase()];
  assert.ok(n !== undefined, 'numero por extenso desconhecido: ' + palavra);
  return n;
}

/** Do cabecalho `## ` que contem `pedaco` ate o `## ` seguinte. */
function secao(pedaco) {
  const linhas = README.split(/\r?\n/);
  let i = linhas.findIndex((l) => /^## /.test(l) && l.indexOf(pedaco) !== -1);
  assert.notStrictEqual(i, -1, 'sumiu a secao que contem: ' + pedaco);
  const titulo = linhas[i];
  const corpo = [];
  for (let j = i + 1; j < linhas.length && !/^## /.test(linhas[j]); j++) corpo.push(linhas[j]);
  return { titulo: titulo, corpo: corpo.join('\n') };
}

/** Linhas de dados de uma tabela markdown: fora o cabecalho e o separador. */
function linhasDeTabela(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => /^\|/.test(l.trim()));
  return linhas.filter((l) => !/^\|[\s:|-]+\|$/.test(l.trim())).slice(1);
}

function itens(texto) {
  return texto.split(/\r?\n/).filter((l) => /^- /.test(l));
}

// ── os numeros que o README escreve sobre si mesmo ───────────────────────

test('readme: o numero de travas no titulo bate com as linhas da tabela', () => {
  const s = secao('travas');
  const dito = porExtenso(s.titulo.match(/^## As (\S+) travas/)[1]);
  assert.strictEqual(linhasDeTabela(s.corpo).length, dito,
    'o titulo diz ' + dito + ' e a tabela tem outra coisa');
});

test('readme: o numero de comandos no titulo bate com as linhas da tabela', () => {
  const s = secao('comandos');
  const dito = porExtenso(s.titulo.match(/^## Os (\S+) comandos/)[1]);
  assert.strictEqual(linhasDeTabela(s.corpo).length, dito,
    'o titulo diz ' + dito + ' e a tabela tem outra coisa');
  const outros = s.corpo.match(/Os outros (\S+) \*\*não são travas/);
  assert.ok(outros, 'sumiu a frase que conta os comandos que nao sao travas');
  assert.strictEqual(porExtenso(outros[1]), dito - 2,
    'so as travas 1 e 2 sao comandos: os outros sao ' + (dito - 2) + ', e a frase diz ' + outros[1]);
});

test('readme: o numero de promessas negadas bate com a lista', () => {
  const s = secao('NÃO promete');
  const m = s.corpo.match(/Cada uma dessas (\S+)/);
  assert.ok(m, 'sumiu a frase que conta as promessas negadas');
  assert.strictEqual(itens(s.corpo).length, porExtenso(m[1]),
    'a frase conta ' + m[1] + ' e a lista tem ' + itens(s.corpo).length);
});

test('readme: o numero de limites irredutiveis bate com a lista', () => {
  const s = secao('limites');
  const dito = porExtenso(s.titulo.match(/^## Os (\S+) limites/)[1]);
  assert.strictEqual(itens(s.corpo).length, dito,
    'o titulo diz ' + dito + ' limites e a lista tem ' + itens(s.corpo).length);
  const ab = s.corpo.match(/As (\S+) acima são promessas[\s\S]*?Estas (\S+) são outra coisa/);
  assert.ok(ab, 'sumiu a abertura que conta as promessas e os limites');
  assert.strictEqual(porExtenso(ab[2]), dito,
    'a abertura diz ' + ab[2] + ' limites e a lista tem ' + dito);
  const negadas = itens(secao('NÃO promete').corpo).length;
  assert.strictEqual(porExtenso(ab[1]), negadas,
    'a abertura diz ' + ab[1] + ' promessas e a lista tem ' + negadas);
});

// ── o que o README promete existe no disco ───────────────────────────────

test('readme: toda skill do disco aparece no README', () => {
  const doDisco = fs.readdirSync(path.join(RAIZ, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const faltando = doDisco.filter((n) => README.indexOf(n) === -1);
  assert.deepStrictEqual(faltando, [],
    'skill instalada e nao documentada: quem instala paga o contexto dela sem saber o que e');
  const ord = README.match(/A (\S+) skill instalada/);
  assert.ok(ord, 'sumiu a frase que conta as skills instaladas');
  assert.strictEqual(ORDINAIS[ord[1].toLowerCase()], doDisco.length,
    'a frase diz ' + ord[1] + ' skill e o disco tem ' + doDisco.length);
});

test('readme: todo comando citado no README existe como skill no disco', () => {
  const doDisco = new Set(fs.readdirSync(path.join(RAIZ, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name));
  const citados = new Set();
  const re = /esquadro:([a-z-]+)/g;
  let m;
  while ((m = re.exec(README)) !== null) citados.add(m[1]);
  assert.ok(citados.size > 0, 'o README nao cita comando nenhum: o parser quebrou');
  const inventados = Array.from(citados).filter((c) => !doDisco.has(c)).sort();
  assert.deepStrictEqual(inventados, [],
    'o README promete comando que nao existe - foi a D134 defeito 6, de novo');
});

test('readme: todo script citado no README existe em scripts/', () => {
  const re = /scripts\/([a-z-]+\.js)/g;
  const citados = new Set();
  let m;
  while ((m = re.exec(README)) !== null) citados.add(m[1]);
  assert.ok(citados.size > 0, 'o README nao cita script nenhum: o parser quebrou');
  const inventados = Array.from(citados)
    .filter((n) => !fs.existsSync(path.join(RAIZ, 'scripts', n))).sort();
  assert.deepStrictEqual(inventados, [], 'o README manda rodar coisa que nao esta la');
});

/**
 * Este e o unico ponto com lista escrita a mao, e e assim de proposito: os seis
 * limites vem da spec, nao do disco - nao ha de onde derivar. O que se confere e
 * que os SEIS ASSUNTOS continuam nomeados, nao a redacao deles.
 */
test('readme: os seis limites sao os seis da spec, por assunto', () => {
  // No titulo em negrito de cada item, e um assunto por item: no corpo inteiro, o
  // limite trocado passava, porque o vizinho tambem diz "harness".
  const titulos = itens(secao('limites').corpo)
    .map((l) => (l.match(/^- \*\*(.+?)\*\*/) || [null, ''])[1].toLowerCase());
  const assuntos = [
    ['custo', /custo|pagar|bolso|dinheiro/],
    ['janela ate o proximo gatilho', /janela|entre o lancamento|intervalo/],
    ['ambiente da outra pessoa', /outra pessoa|sem rede|politica|ambiente/],
    ['campo nao documentado', /documentad|documentou|pode sumir|sem aviso/],
    ['o harness muda', /harness|evento de hook|schema/],
    ['instrucao nao e deterministica', /instru[cç][aã]o|pode ser pulad|determinist/]
  ];
  const faltando = assuntos.filter(([, re]) => titulos.filter((x) => re.test(x)).length !== 1)
    .map(([nome]) => nome);
  assert.deepStrictEqual(faltando, [],
    'limite que sumiu do README volta a ser buraco escondido: ' + faltando.join(', '));
  const usados = new Set(assuntos.map(([, re]) => titulos.findIndex((x) => re.test(x))));
  assert.strictEqual(usados.size, assuntos.length, 'dois assuntos no mesmo limite: um deles sumiu');

  // Decisao 34: agente do plugin que crava modelo no frontmatter e a excecao a
  // regra de nao guardar nome de modelo - e quem instala tem de ler isso aqui.
  const dirAg = path.join(RAIZ, 'agents');
  const frente = (f) => fs.readFileSync(path.join(dirAg, f), 'utf8').split(/^---\s*$/m)[1] || '';
  const comModelo = fs.readdirSync(dirAg).filter((f) => /\.md$/.test(f))
    .filter((f) => /^model:/m.test(frente(f))).map((f) => f.replace(/\.md$/, ''));
  const secaoLimites = secao('limites').corpo;
  assert.strictEqual(/uma exceção, declarada/.test(secaoLimites), comModelo.length > 0,
    'agentes com model: ' + JSON.stringify(comModelo) +
    ' - a excecao declarada tem de existir so se eles existirem');
  comModelo.forEach((n) => assert.ok(secaoLimites.indexOf('`' + n + '`') !== -1,
    'excecao nao nomeada: ' + n));
});

test('readme: o que nao foi testado em outro sistema esta DECLARADO', () => {
  // Na secao dela: a tabela de falhas cita "Linux" por outro motivo, e segurava o teste.
  const sis = secao('sistemas').corpo;
  assert.ok(/(linux|macos|mac os)/i.test(sis),
    'o H6 se fecha declarando; README que nao nomeia os outros sistemas nao declara nada');
  assert.ok(/n[aã]o[^.]{0,24}testad/i.test(sis),
    'falta dizer, com estas palavras, que nao foi testado');
});
