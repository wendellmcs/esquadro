'use strict';
// Entrega C. A skill `economia` e texto, e texto nao tem como ser exercido como
// processo - mas o CONTRATO dela tem. O teste que importa aqui e o da colisao:
// "evidencia vira o numero que prova", lido ao pe da letra, produz resposta curta
// SEM bloco de saida, e a trava de fecho barra exatamente isso. Uma skill que
// ensinasse o proprio agente a ser bloqueado teria custado uma rodada por turno.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const evidencia = require('../scripts/lib/evidencia.js');
const rubrica = require('../scripts/lib/rubrica.js');
const regraLib = require('../scripts/lib/regra.js');

const RAIZ = path.join(__dirname, '..');
const ARQ = path.join(RAIZ, 'skills', 'economia', 'SKILL.md');
const TEXTO = fs.readFileSync(ARQ, 'utf8');

/** Os exemplos que a skill ensina vivem em cerca de QUATRO crases, porque o
 *  exemplo de fecho carrega, ele proprio, um bloco de tres crases dentro. */
function exemplos(texto) {
  const re = /^````exemplo[ \t]*\r?\n([\s\S]*?)^````[ \t]*$/gm;
  const achados = [];
  let m;
  while ((m = re.exec(texto)) !== null) achados.push(m[1]);
  return achados;
}

test('economia: a skill passa na rubrica de boa skill', () => {
  const r = rubrica.conferir(TEXTO);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

test('economia: nenhuma regra da skill crava fato volatil', () => {
  const r = regraLib.validarArquivo(TEXTO);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
  assert.ok(r.total >= 4, 'a skill tem de ensinar regra em forma de gatilho: achei ' + r.total);
});

test('economia: os exemplos existem e sao extraiveis', () => {
  assert.ok(exemplos(TEXTO).length >= 3, 'esperava ao menos 3 exemplos marcados');
});

/**
 * O teste central. Se algum dia alguem encurtar um exemplo tirando o bloco de
 * saida, a suite reprova aqui - e nao em producao, uma rodada por vez.
 */
test('economia: NENHUM exemplo que a skill ensina e barrado pela trava de fecho', () => {
  for (const ex of exemplos(TEXTO)) {
    assert.strictEqual(evidencia.deveBloquear(ex), false,
      'este exemplo seria bloqueado:\n' + ex);
  }
});

/**
 * Licao do defeito 1 da Etapa 11: um teste verde que nao exercita nada e pior
 * do que teste nenhum. Se nenhum exemplo afirmasse sucesso, o teste acima
 * passaria por vacuidade para sempre. Aqui se exige que ao menos um exemplo
 * esteja no caminho perigoso - alegar sucesso - e ainda assim passar.
 */
test('economia: ao menos um exemplo alega sucesso E carrega bloco - senao o teste acima e vazio', () => {
  const analises = exemplos(TEXTO).map(function (e) { return evidencia.analisar(e); });
  assert.ok(analises.some(function (a) { return a.alegaSucesso && a.temBloco; }),
    'nenhum exemplo exercita o caminho que a trava de fecho vigia');
  assert.ok(analises.some(function (a) { return a.declaraNaoRodou; }),
    'falta o exemplo que declara o que NAO rodou');
});

/** Controle negativo: prova que o instrumento acima sabe reprovar. */
test('economia: o mesmo texto sem o bloco SERIA barrado - o instrumento nao e cego', () => {
  const comBloco = exemplos(TEXTO).filter(function (e) {
    return evidencia.analisar(e).alegaSucesso && evidencia.analisar(e).temBloco;
  })[0];
  assert.ok(comBloco, 'sem exemplo de sucesso nao ha o que controlar');
  const semBloco = comBloco.replace(/```[\s\S]*?```/g, '').replace(/n[aã]o rodei[^.]*\./gi, '');
  assert.strictEqual(evidencia.deveBloquear(semBloco), true,
    'tirar o bloco tinha de bloquear; se nao bloqueia, o teste central nao prova nada');
});

/**
 * A secao de um `## <titulo>` ate o `## ` seguinte. Decisao 43, medida por
 * mutacao na execucao: olhando o texto inteiro, o aviso da Regra 2 saia
 * inteiro com a suite verde - "trava de fecho" aparece tambem na abertura
 * dos exemplos, e "nao some" no titulo da regra.
 */
function secao(texto, titulo) {
  const i = texto.indexOf('\n## ' + titulo);
  assert.notStrictEqual(i, -1, 'sumiu a secao: ' + titulo);
  const fim = texto.indexOf('\n## ', i + 1);
  return texto.slice(i, fim === -1 ? texto.length : fim);
}

test('economia: a skill avisa, com todas as letras, que o bloco de saida NAO sai', () => {
  const r2 = secao(TEXTO, 'Regra 2');
  assert.ok(/trava de fecho/i.test(r2), 'a colisao tem de estar nomeada na Regra 2');
  assert.ok(/barrad|bloqueia/i.test(r2), 'a Regra 2 tem de dizer que a resposta sem bloco e barrada');
  assert.ok(/manter o bloco/i.test(r2), 'a Regra 2 tem de mandar manter o bloco');
});

/** Decisao 5 da spec: a economia REFORMULA o ritual, nao remove nada dele. */
test('economia: as tres obrigacoes do ritual continuam no texto', () => {
  assert.ok(/evid[êe]ncia/i.test(TEXTO), 'sumiu a exigencia de evidencia');
  assert.ok(/tr[êe]s op[çc][õo]es/i.test(TEXTO), 'sumiu a exigencia de tres opcoes');
  assert.ok(/recomendada/i.test(TEXTO), 'sumiu a marcacao da recomendada');
  assert.ok(/registrad|registro/i.test(TEXTO), 'sumiu o registro da decisao');
});

/**
 * As opcoes do exemplo de decisao: cada uma vai do seu `a. `, `b. ` ou `c. `
 * no inicio da linha ate a seguinte. Decisao 43, medida por mutacao: olhando o
 * exemplo inteiro, a opcao a. perdia o custo - ou o proprio rotulo, porque
 * "a." casava dentro de "hora." - com a suite verde.
 */
function opcoes(exemplo) {
  return exemplo.split(/^(?=[a-z]\. )/m).filter(function (p) { return /^[a-z]\. /.test(p); });
}

test('economia: o exemplo de decisao traz as tres opcoes e a recomendada marcada', () => {
  const decisao = exemplos(TEXTO).filter(function (e) { return /recomendada/i.test(e); })[0];
  assert.ok(decisao, 'falta o exemplo de decisao');
  const ops = opcoes(decisao);
  assert.deepStrictEqual(ops.map(function (o) { return o.slice(0, 2); }), ['a.', 'b.', 'c.'],
    'o exemplo tem de trazer as opcoes a., b. e c., cada uma no inicio da linha');
  for (const o of ops) {
    assert.ok(/custo/i.test(o), 'opcao sem custo declarado nao serve de exemplo: ' + o.slice(0, 40));
  }
});

/**
 * Sem isto a skill nasce orfa: ninguem a invoca, e o ritual segue no tamanho
 * velho. O ritual tem DUAS metades - a decisao e o pronto - e uma mencao solta
 * cobre so uma delas. Medido por mutacao: exigir "a palavra aparece" deixava
 * apagar metade da fiacao com a suite verde.
 */
test('economia: o manual aponta para a economia nas DUAS metades do ritual', () => {
  const manual = fs.readFileSync(path.join(RAIZ, 'skills', 'padrao', 'SKILL.md'), 'utf8');

  /** A secao em que a ancora vive: do `## ` anterior ate o `## ` seguinte.
   *  Criterio estrutural de proposito - medir por distancia em caracteres
   *  faria o teste ser recalibrado toda vez que a secao crescesse. */
  function secaoDe(ancora) {
    const i = manual.indexOf(ancora);
    assert.notStrictEqual(i, -1, 'sumiu a ancora do ritual: ' + ancora);
    const antes = manual.slice(0, i).lastIndexOf('\n## ');
    const depois = manual.indexOf('\n## ', i);
    return manual.slice(antes === -1 ? 0 : antes, depois === -1 ? manual.length : depois);
  }

  assert.ok(/economia/i.test(secaoDe('Decisão tomada vai para')),
    'a secao da decisao nao aponta para a economia');
  assert.ok(/economia/i.test(secaoDe('Evidência fresca')),
    'a secao do pronto nao aponta para a economia');
});
