'use strict';
/**
 * PRE-VOO. A publicacao e o unico ato irreversivel deste plano: depois do push,
 * o que foi para o ar foi, e reescrever historico e forca bruta em cima do que
 * outros ja clonaram.
 *
 * Por isso o que da para conferir por maquina NAO fica em checklist. Enquanto
 * faltar qualquer peca, a suite fica vermelha - e nao ha como chegar ao commit
 * com algo em aberto sem ver.
 *
 * DUAS LICOES MEDIDAS, das quais este arquivo nasceu (`docs/etapa6-skill-universal.md`):
 *   1. o LICENSE gerado pela INTERFACE do GitHub preenche o copyright com o nome
 *      do perfil - foi preciso apagar e recriar um repositorio por causa disso.
 *      Entao o LICENSE nasce AQUI, no repositorio, e vai junto no export.
 *   2. a identidade do git se configura ANTES do primeiro commit. Isso nao da
 *      para testar em Node; e passo de checklist, e a conferencia dele acontece
 *      DEPOIS do commit e ANTES do push - que e a janela em que ainda da para
 *      desfazer.
 *
 * O QUE ESTE ARQUIVO NAO TESTA, e esta dito para nao parecer que testa: se o
 * export esta limpo nas tres superficies. Isso se mede no export montado, com o
 * `sanitar.js`, e e passo do plano. Um teste aqui mediria o repositorio de
 * trabalho, que e outra coisa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sanit = require('../scripts/lib/sanitacao.js');
const saude = require('../scripts/lib/saude.js');
const veredito = require('../scripts/lib/veredito.js');
const design = require('../scripts/lib/design.js');
const projetoLib = require('../scripts/lib/projeto.js');
const { baldesNoCodigo, SO_CONTAM } = require('./auxiliar-baldes.js');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const json = (rel) => JSON.parse(ler(rel));

const PLUGIN = json('.claude-plugin/plugin.json');
const MERCADO = json('.claude-plugin/marketplace.json');
const CHANGELOG = ler('CHANGELOG.md');
const README = ler('README.md');

const NUMEROS = {
  'tres': 3, 'quatro': 4,
  'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
  'onze': 11, 'doze': 12, 'treze': 13, 'quatorze': 14, 'quinze': 15,
  'dezesseis': 16, 'dezessete': 17
};

// ── a licenca ────────────────────────────────────────────────────────────

test('publicacao: o LICENSE existe no repositorio, nao na interface do GitHub', () => {
  assert.ok(fs.existsSync(path.join(RAIZ, 'LICENSE')),
    'sem LICENSE no repositorio, quem cria pela interface do GitHub ganha o ' +
    'copyright preenchido com o nome do perfil - e ja custou apagar e recriar um repo');
});

test('publicacao: o LICENSE e MIT, com ano, e o plugin.json concorda', () => {
  const texto = ler('LICENSE');
  assert.ok(/MIT License/i.test(texto), 'o LICENSE nao se declara MIT');
  assert.ok(/Permission is hereby granted, free of charge/.test(texto),
    'falta o corpo da MIT: um arquivo que so diz "MIT" nao licencia nada');
  assert.ok(/Copyright \(c\) (\d{4})/.test(texto), 'LICENSE sem ano de copyright');
  assert.strictEqual(PLUGIN.license, 'MIT', 'o manifesto declara outra licenca');
});

test('publicacao: o detentor do LICENSE e o mesmo autor do manifesto', () => {
  const m = ler('LICENSE').match(/Copyright \(c\) \d{4}\s+(.+)/);
  assert.ok(m, 'nao deu para ler o detentor do direito no LICENSE');
  assert.strictEqual(m[1].trim(), PLUGIN.author.name,
    'LICENSE e manifesto discordam sobre quem publica isto');
});

test('publicacao: manifesto e marketplace concordam sobre quem publica', () => {
  assert.strictEqual(MERCADO.owner.name, PLUGIN.author.name);
});

test('publicacao: o LICENSE entra na superficie que vai a publico', () => {
  const s = sanit.superficiePublicavel(RAIZ);
  assert.ok(s !== null, 'git nao respondeu');
  assert.ok(s.indexOf('LICENSE') !== -1,
    'o LICENSE ficou de fora do que seria publicado: repositorio publico sem licenca ' +
    'nao autoriza ninguem a usar nada');
});

// ── a superficie que vai a publico ───────────────────────────────────────

test('publicacao: o diario de trabalho e o vocabulario privado NAO vao junto', () => {
  const s = sanit.superficiePublicavel(RAIZ);
  assert.strictEqual(s.filter((a) => a.indexOf('docs/') === 0).length, 0, 'docs/ na superficie (D132)');
  assert.strictEqual(s.indexOf(sanit.ARQUIVO_LOCAL), -1,
    'o vocabulario privado iria ao repositorio publico levando exatamente o que existe para impedir');
  assert.strictEqual(s.filter((a) => a.indexOf('.context/') === 0 ||
    a.indexOf('.superpowers/') === 0).length, 0, 'contexto local na superficie');
});

// ── os numeros que o CHANGELOG afirma ────────────────────────────────────

test('publicacao: a versao do manifesto e a do topo do CHANGELOG', () => {
  const m = CHANGELOG.match(/^## (\d+\.\d+\.\d+)/m);
  assert.ok(m, 'o CHANGELOG nao abre com uma versao');
  assert.strictEqual(PLUGIN.version, m[1],
    'manifesto e CHANGELOG discordam da versao que esta saindo');
});

test('publicacao: a versao do package.json e a do manifesto', () => {
  assert.strictEqual(json('package.json').version, PLUGIN.version,
    'package.json e manifesto discordam da versao (a 0.2.0 saiu com o package.json em 0.1.0)');
});

/**
 * Spec, secao 3: "guarde o metodo, nunca o resultado". Numero de teste congelado
 * em prosa apodrece calado - o CHANGELOG ja carregou "419 testes" quando eram
 * outros, e a D134 registrou a mesma classe de erro no README e no manifesto.
 * O CHANGELOG passa a dizer ONDE o numero se obtem.
 */
test('publicacao: o CHANGELOG nao congela contagem de teste - aponta o comando', () => {
  const congelado = CHANGELOG.match(/\*?\*?(\d+)\*?\*? testes/);
  assert.strictEqual(congelado, null,
    'contagem de teste congelada no CHANGELOG: ' + (congelado && congelado[0]) +
    '. O numero muda a cada tarefa e ninguem volta aqui para corrigi-lo');
  assert.ok(/npm test/.test(CHANGELOG),
    'se o numero sai, o comando que o produz tem de entrar no lugar');
});

test('publicacao: o numero de travas e o MESMO no README, no CHANGELOG e no manifesto', () => {
  const doReadme = NUMEROS[README.match(/^## As (\S+) travas/m)[1].toLowerCase()];
  const doChangelog = NUMEROS[(CHANGELOG.match(/(\S+) travas/) || [])[1].toLowerCase()];
  const doManifesto = NUMEROS[(PLUGIN.description.match(/^(\S+) port[oõ]es/i) || [])[1].toLowerCase()];
  assert.strictEqual(doChangelog, doReadme, 'CHANGELOG e README discordam do numero de travas');
  assert.strictEqual(doManifesto, doReadme,
    'a descricao do manifesto conta outro numero - foi a D134, defeito 6');
});

test('publicacao: o numero de baldes que negam vem do codigo, nao da memoria', () => {
  const m = CHANGELOG.match(/(\d+) que negam/);
  assert.ok(m, 'o CHANGELOG nao diz quantos baldes negam');
  assert.strictEqual(Number(m[1]), saude.BALDES_DE_BLOQUEIO.length,
    'lista escrita a mao contra lista do codigo: foi assim que a D134 achou o defeito 4');
});

// Ronda 1 do Passo 8b: a frase dos baldes tem tres numeros, e o teste acima
// conferia um so. O total e os que so contam passavam errados com a suite verde.
test('publicacao: o total de baldes e os que so contam tambem vem do codigo', () => {
  const m = CHANGELOG.match(/\*\*(\d+) baldes\*\* de contador: (\d+) que negam, (\d+) que so contam/);
  assert.ok(m, 'o CHANGELOG nao diz quantos baldes ha, nem quantos so contam');
  const noCodigo = baldesNoCodigo();
  assert.strictEqual(Number(m[1]), noCodigo.size, 'o total de baldes foi escrito a mao');
  const soContam = Array.from(noCodigo).filter((b) => SO_CONTAM.has(b)).length;
  assert.strictEqual(Number(m[3]), soContam, 'os que so contam foram escritos a mao');
  assert.strictEqual(Number(m[1]), Number(m[2]) + Number(m[3]), 'a frase nao fecha a propria conta');
});

// Ronda 1 do Passo 8b: as lentes que o revisar despacha sao duas familias, e a
// soma quando a mudanca e de codigo e de tela. Tres numeros por extenso, nenhum
// ligado ao veredito.js - uma lente nova apodreceria o CHANGELOG calada.
// Ronda 1 do 8c.5: a linha do /esquadro:revisar no README passa a dizer os mesmos tres.
test('publicacao: as lentes do CHANGELOG e do README sao as do veredito.js - as duas familias e a soma', () => {
  for (const [nome, texto] of [['CHANGELOG', CHANGELOG], ['README', README]]) {
    const m = texto.match(/\*\*(\S+)\*\* de c[oó]digo, \*\*(\S+)\*\* de\s+tela, e \*\*(\S+)\*\* quando/);
    assert.ok(m, 'o ' + nome + ' nao diz quantas lentes o revisar despacha');
    const [codigo, tela, soma] = m.slice(1).map((p) => NUMEROS[p.toLowerCase()]);
    assert.strictEqual(codigo, veredito.LENTES.length, 'lentes de codigo: o ' + nome + ' conta outra coisa');
    assert.strictEqual(tela, veredito.LENTES_UI.length, 'lentes de tela: o ' + nome + ' conta outra coisa');
    assert.strictEqual(soma, veredito.LENTES.length + veredito.LENTES_UI.length,
      nome + ': codigo e tela juntos despacham as duas familias inteiras');
  }
});

// Ronda 1 do 8c.5: a skill padrao dizia "oito lentes" como se fossem todas, e a tabela da
// rubrica mandava revisar logica sem UI com duas das oito de tela - o revisar despacha as
// nove de codigo. Toda "<numero> lentes" da skill diz a familia, com o numero do codigo.
test('publicacao: a skill padrao conta as duas familias de lentes, com os numeros do veredito.js', () => {
  const dir = path.join(RAIZ, 'skills', 'padrao');
  const arquivos = ['SKILL.md'].concat(fs.readdirSync(path.join(dir, 'references'))
    .filter((f) => f.endsWith('.md')).map((f) => 'references/' + f));
  const FAMILIA = { tela: veredito.LENTES_UI.length, codigo: veredito.LENTES.length };
  const numero = (p) => (/^\d+$/.test(p) ? Number(p) : NUMEROS[p.toLowerCase()]);
  const soltas = [];
  const erradas = [];
  const naSkill = { tela: 0, codigo: 0 };
  for (const rel of arquivos) {
    const texto = fs.readFileSync(path.join(dir, rel), 'utf8');
    // "4.2 Lentes distintas" e numero de secao, nao contagem: o numero nao vem colado a ponto.
    for (const m of texto.matchAll(/(?<![\p{L}\d.])([\p{L}\d]+)\s+lentes(?!\s+de\s+(?:tela|c[oó]digo))/giu)) {
      if (numero(m[1]) !== undefined) soltas.push(rel + ': "' + m[0] + '"');
    }
    for (const m of texto.matchAll(/([\p{L}\d]+)(?:\s+lentes)?\s+de\s+(tela|c[oó]digo)/giu)) {
      const n = numero(m[1]);
      if (n === undefined) continue;
      const fam = m[2].toLowerCase() === 'tela' ? 'tela' : 'codigo';
      if (rel === 'SKILL.md') naSkill[fam] += 1;
      if (n !== FAMILIA[fam]) erradas.push(rel + ': "' + m[0] + '" (o codigo tem ' + FAMILIA[fam] + ')');
    }
  }
  assert.deepStrictEqual(soltas, [], 'numero de lentes sem dizer a familia');
  assert.deepStrictEqual(erradas, [], 'numero de lentes que nao e o do veredito.js');
  assert.ok(naSkill.tela > 0 && naSkill.codigo > 0, 'o SKILL.md tem de contar as duas familias: ' +
    JSON.stringify(naSkill));
  const rubrica = fs.readFileSync(path.join(dir, 'references', '02-rubrica-aaa.md'), 'utf8').split('\n');
  for (const mudanca of ['Lógica sem UI', 'Contrato entre sistemas']) {
    const linha = rubrica.find((l) => l.startsWith('| ' + mudanca + ' |'));
    assert.ok(linha && /de c[oó]digo/.test(linha), 'a rubrica manda "' + mudanca + '" para outra familia: ' + linha);
  }
  // Ronda 2 do 8c.10: a secao 4.2 dizia que as nove de codigo vao "em toda mudanca". A regra de
  // despacho e a tabela do Passo 2 do revisar; a secao aponta para ela, e ela bate com o codigo.
  const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  const secao = skill.slice(skill.indexOf('### 4.2'), skill.indexOf('### 4.3'));
  assert.ok(secao.includes('skills/revisar/SKILL.md'), 'a secao 4.2 tem de apontar para a tabela do revisar');
  assert.ok(!/em toda mudan/.test(secao), 'a secao 4.2 manda as de codigo em toda mudanca: ' + secao);
  const revisar = fs.readFileSync(path.join(RAIZ, 'skills', 'revisar', 'SKILL.md'), 'utf8').split('\n');
  const despacho = { 'Só código': FAMILIA.codigo, 'Só tela': FAMILIA.tela, 'Código e tela': FAMILIA.codigo + FAMILIA.tela };
  for (const [mudanca, n] of Object.entries(despacho)) {
    const linha = revisar.find((l) => l.startsWith('| ' + mudanca + ' |'));
    assert.ok(linha && linha.includes('**' + n + '**'), 'o revisar manda "' + mudanca + '" com outro numero: ' + linha);
  }
});

// T2/item 13 da D257 (decisao do dono, 2026-09-29): arquivo so de logica - nao e de estilo e nao
// monta tela - e revisado com as 9 de codigo sem a `design`. O numero nao e escrito a mao: e
// LENTES.length - 1, e so faz sentido enquanto a `design` existir em LENTES. Na duvida, as 9.
test('publicacao: a linha "So logica" do revisar diz LENTES.length - 1, e a lente design existe para sair', () => {
  assert.ok(veredito.LENTES.some((l) => l.chave === 'design'),
    'sem a lente design em LENTES o "8" de so logica nao tem sentido');
  const revisar = fs.readFileSync(path.join(RAIZ, 'skills', 'revisar', 'SKILL.md'), 'utf8').split('\n');
  const linha = revisar.find((l) => l.startsWith('| Só lógica '));
  assert.ok(linha, 'a tabela do Passo 2 do revisar nao tem a linha "Só lógica"');
  assert.ok(linha.includes('**' + (veredito.LENTES.length - 1) + '**'),
    'so logica tem de dizer LENTES.length - 1: ' + linha);
  assert.match(linha, /sem\s+`?design`?/, 'a linha tem de dizer que a lente que sai e a design: ' + linha);
  assert.match(revisar.join('\n'), /na d[uú]vida, as 9/i, 'o revisar tem de dizer que na duvida vao as 9');
  const m = README.match(/\*\*(\S+)\*\* quando [ée] s[oó] l[oó]gica/);
  assert.ok(m, 'a linha do /esquadro:revisar no README nao diz o caso so logica');
  assert.strictEqual(NUMEROS[m[1].toLowerCase()], veredito.LENTES.length - 1, 'o README conta so logica errado');
});

// Ronda 2 do Passo 8b: "oito travas" batia o README com o CHANGELOG e o manifesto, e o
// titulo do README com a tabela dele - nunca com o codigo. Trava e portao que nega (os
// baldes de bloqueio do saude.js) ou um dos dois comandos. Balde novo que nega tem de
// dizer aqui de que trava e, ou se e modulo.
const TRAVA_DO_BALDE = {
  fecho_sem_evidencia: 3, subitem_pendente: 3,
  fora_do_escopo: 4, sem_escopo: 4, intocavel: 4,
  comando_destrutivo: 5, shell_idioma_errado: 5, outra_frente: 5, cd_solto: 5,
  agente_caro_em_marcha_rapida: 6, criou_sem_buscar: 7, catraca_afrouxada: 8,
  // o modulo de design nega, mas e opcional e nao e trava: so existe com design.json
  token_fora_do_sistema: null
};
const TRAVA_DO_COMANDO = { init: 1, revisar: 2 };

test('publicacao: as travas do README sao as do codigo - os portoes que negam e os dois comandos', () => {
  const temTrava = (b) => Object.prototype.hasOwnProperty.call(TRAVA_DO_BALDE, b);
  assert.deepStrictEqual(saude.BALDES_DE_BLOQUEIO.filter((b) => !temTrava(b)), [],
    'balde que nega sem trava declarada: e trava nova ou modulo? declare no mapa');
  assert.deepStrictEqual(Object.keys(TRAVA_DO_BALDE).filter((b) => saude.BALDES_DE_BLOQUEIO.indexOf(b) === -1), [],
    'o mapa tem balde que o codigo nao tem mais');
  for (const c of Object.keys(TRAVA_DO_COMANDO)) {
    assert.ok(fs.existsSync(path.join(RAIZ, 'skills', c, 'SKILL.md')), 'a trava do comando ' + c + ' sumiu do disco');
  }
  const doCodigo = Object.values(TRAVA_DO_COMANDO)
    .concat(Object.values(TRAVA_DO_BALDE).filter((n) => n !== null));
  const numeros = Array.from(new Set(doCodigo)).sort((a, b) => a - b);
  const secao = README.split(/^## /m).filter((s) => /^As \S+ travas/.test(s))[0];
  const linhas = secao.split('\n').filter((l) => /^\| \d+ \|/.test(l)).map((l) => Number(l.match(/^\| (\d+) \|/)[1]));
  assert.deepStrictEqual(linhas, numeros, 'a tabela do README numera outras travas que o codigo');
  assert.strictEqual(NUMEROS[README.match(/^## As (\S+) travas/m)[1].toLowerCase()], numeros.length,
    'o titulo do README conta outras travas que o codigo');
});

const ORDINAIS = { 'quarta': 4, 'quinta': 5, 'sexta': 6, 'setima': 7, 'oitava': 8 };

// Ronda 2 do Passo 8b: "seis perguntas" esta no CHANGELOG e no README, e nada contava
// as perguntas que a skill do init de fato faz, nem o campo que cada uma grava.
test('publicacao: as perguntas do init sao as que o CHANGELOG e o README contam', () => {
  const p4 = ler('skills/init/SKILL.md').split(/^## /m).filter((s) => /^Passo 4 /.test(s))[0];
  assert.ok(p4, 'sumiu o Passo 4 do init');
  const perguntas = p4.split(/\n(?=\d+\. \*\*)/).slice(1);
  const titulo = p4.match(/^Passo 4 — as (\S+) perguntas/);
  assert.ok(titulo, 'o Passo 4 nao diz quantas perguntas faz');
  assert.strictEqual(perguntas.length, NUMEROS[titulo[1]], 'o titulo do Passo 4 conta outras perguntas');
  // cada pergunta grava um campo que o projeto.json aceita, e nenhuma o mesmo que outra
  const campos = perguntas.map((t) => (t.match(/grav(?:a|e em) `(\w+)/i) || [])[1]);
  assert.deepStrictEqual(campos.filter((c) => projetoLib.CHAVES.indexOf(c) === -1), [],
    'pergunta sem campo do projeto.json: ' + campos.join(', '));
  assert.strictEqual(new Set(campos).size, perguntas.length, 'duas perguntas gravam o mesmo campo');

  const ch = CHANGELOG.match(/faz \*\*(\S+)\*\* perguntas[\s\S]*?a (\S+) e a escada de agentes/);
  assert.ok(ch, 'o CHANGELOG nao diz quantas perguntas o init faz');
  assert.strictEqual(NUMEROS[ch[1].toLowerCase()], perguntas.length, 'o CHANGELOG conta outras perguntas');
  assert.strictEqual(ORDINAIS[ch[2].toLowerCase()], campos.indexOf('agentes') + 1,
    'o CHANGELOG poe a escada de agentes em outra pergunta');
  const rd = README.match(/faz (\S+) perguntas/);
  assert.ok(rd, 'o README nao diz quantas perguntas o init faz');
  assert.strictEqual(NUMEROS[rd[1].toLowerCase()], perguntas.length, 'o README conta outras perguntas');
});

// Ronda 2 do Passo 8b: o teto de rondas esta por extenso no CHANGELOG e em algarismo
// no README, e nenhum dos dois estava ligado ao veredito.js, que e quem para.
test('publicacao: o teto de rondas do CHANGELOG e do README e o do veredito.js', () => {
  const ditos = [];
  for (const [nome, texto] of [['CHANGELOG', CHANGELOG], ['README', README]]) {
    const re = /teto de (\S+) rondas/gi;
    let m;
    while ((m = re.exec(texto)) !== null) ditos.push([nome, m[1]]);
  }
  assert.deepStrictEqual(Array.from(new Set(ditos.map((d) => d[0]))).sort(), ['CHANGELOG', 'README'],
    'o teto sumiu de um dos dois: ' + JSON.stringify(ditos));
  for (const [nome, p] of ditos) {
    const n = /^\d+$/.test(p) ? Number(p) : NUMEROS[p.toLowerCase()];
    assert.strictEqual(n, veredito.TETO,
      nome + ' diz teto de ' + p + ' rondas, e o veredito.js para em ' + veredito.TETO);
  }
});

// Ronda 2 do Passo 8b: o portao de design so le medida em algumas unidades, e o texto
// nao dizia - `border-radius:50%` passava calado para quem confiasse nele.
test('publicacao: o limite de unidades do portao de design esta escrito, com as do codigo', () => {
  const naoPromete = README.split(/^## /m).filter((s) => s.indexOf('NÃO promete') !== -1)[0] || '';
  const item = naoPromete.split('\n').filter((l) => /^- \*\*/.test(l) && /design/.test(l))[0];
  assert.ok(item, 'o README nao declara o limite do portao de design no que nao promete');
  const par = CHANGELOG.split(/\n\s*\n/).filter((p) => /^Modulo opcional/.test(p))[0];
  assert.ok(par, 'sumiu do CHANGELOG o paragrafo do modulo de design');
  for (const [nome, texto] of [['README', item], ['CHANGELOG', par]]) {
    for (const u of design.UNIDADES.concat(['%'])) {
      assert.ok(texto.indexOf('`' + u + '`') !== -1, nome + ' nao nomeia `' + u + '` no limite do design: ' + texto);
    }
  }
});

test('publicacao: todo comando que o CHANGELOG anuncia existe como skill', () => {
  const doDisco = new Set(fs.readdirSync(path.join(RAIZ, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name));
  const citados = new Set();
  const re = /esquadro:([a-z-]+)/g;
  let m;
  while ((m = re.exec(CHANGELOG)) !== null) citados.add(m[1]);
  assert.ok(citados.size > 0, 'o CHANGELOG nao anuncia comando nenhum');
  const inventados = Array.from(citados).filter((c) => !doDisco.has(c)).sort();
  assert.deepStrictEqual(inventados, [], 'o CHANGELOG anuncia comando que nao existe');
});

// ── o texto que vai a publico ────────────────────────────────────────────

/**
 * Ronda 1 do Passo 8b: mensagens, moldes e skills citavam codigos de dois
 * registros que NAO vao a publico - a autoavaliacao (B7, C9, F16...) e o log de
 * decisoes (D14, "decisao 12"). Quem le nao tem onde procurar o que o codigo quer
 * dizer. Mede-se o que chega a quem le: as strings dos scripts e os .md e .json.
 * Comentario fica de fora de proposito - e de quem mantem, e tem o repositorio.
 * O test/ tambem: nome de teste e assercao sao para quem roda a suite.
 * Codigo precedido de `%` e hexadecimal de URL codificada (`%C3%A7`), nao registro.
 */
const CODIGO_INTERNO =
  /(?<!%)\b(?:[A-F]\d{1,2}|D\d{1,3}|R\d{1,2}|R-T\d+-\d+)\b|\b[Dd]ecis(?:ao|ão) (?:do dono )?\d+/;

/**
 * Os literais de texto de um fonte JS, sem comentario nem regex literal. O regex
 * literal e pulado porque uma crase ou aspa dentro dele abriria uma string falsa
 * que engole o resto da linha - medido no `destrutivo.js`.
 */
function literais(fonte) {
  const achados = [];
  const re = new RegExp([
    '\\/\\*[\\s\\S]*?\\*\\/', '\\/\\/[^\\n]*',
    '(?<=(?:^|[(,=:[!&|?{};]|\\breturn)\\s*)' +
      '\\/(?:[^/\\\\\\n[]|\\\\.|\\[(?:[^\\]\\\\\\n]|\\\\.)*\\])+\\/[a-z]*',
    "'(?:[^'\\\\\\n]|\\\\.)*'", '"(?:[^"\\\\\\n]|\\\\.)*"', '`(?:[^`\\\\]|\\\\.)*`'
  ].join('|'), 'gm');
  let m;
  while ((m = re.exec(fonte)) !== null) if (m[0][0] !== '/') achados.push(m[0]);
  return achados;
}

test('publicacao: o texto que vai a publico nao cita codigo de registro que nao vai', () => {
  // o instrumento: acha na string; ignora no comentario e no regex literal
  // e o hexadecimal de URL codificada (%C3%A7 e um c cedilha, nao o codigo C3)
  const amostra = literais("x('(F16) idioma'); // D35\n/* C9 */ y(\"decisao 12\");\n" +
    "if (/[`']/.test(c)) z('D14'); // `B7`\nw('%C3%A7');");
  assert.deepStrictEqual(amostra.filter((p) => CODIGO_INTERNO.test(p)),
    ["'(F16) idioma'", '"decisao 12"', "'D14'"]);

  const s = sanit.superficiePublicavel(RAIZ);
  assert.ok(s !== null, 'git nao respondeu');
  const achados = [];
  let lidos = 0;
  for (const rel of s) {
    if (rel.indexOf('test/') === 0) continue;
    const ext = path.extname(rel);
    let pedacos;
    if (ext === '.js') pedacos = literais(ler(rel));
    else if (ext === '.md' || ext === '.json') pedacos = ler(rel).split('\n');
    else continue;
    lidos++;
    for (const p of pedacos) {
      const c = p.match(CODIGO_INTERNO);
      if (c) achados.push(rel + ': ' + c[0]);
    }
  }
  assert.ok(lidos > 50, 'a varredura leu so ' + lidos + ' arquivos');
  assert.deepStrictEqual(achados, [], 'codigo que quem le nao tem onde procurar');
});

test('publicacao: o pacote segue privado para o npm - publicar aqui e outro caminho', () => {
  assert.strictEqual(json('package.json').private, true,
    'este plugin se instala por marketplace do Claude Code, nunca por npm publish');
});
