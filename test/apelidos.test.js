'use strict';
const test = require('node:test');
const assert = require('node:assert');
const apelidos = require('../scripts/lib/apelidos.js');
const agentesLib = require('../scripts/lib/agentes.js');

const MAPA_DOIS = { agentes: {
  escada: ['busca', 'arquiteto'],
  degraus: [{ agente: 'busca', apelido: 'barato' }, { agente: 'arquiteto', apelido: 'caro' }]
} };

function lidos(lista) { return { existe: true, agentes: lista }; }
function ag(nome, model) {
  return { arquivo: nome + '.md', nome: nome, model: model, temFrontmatter: true };
}

// -------------------------------------------------- nao verificavel (foco 1)

test('apelidos: sem a pasta .claude/agents a conferencia se declara NAO verificavel', () => {
  const r = apelidos.conferir(MAPA_DOIS, { existe: false, agentes: [] });
  assert.strictEqual(r.verificavel, false);
  assert.ok(r.motivo.includes('.claude/agents'), r.motivo);
  assert.deepStrictEqual(r.divergencias, []);
});

test('apelidos: pasta VAZIA e verificavel - e diferente de nao conseguir olhar', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([]));
  assert.strictEqual(r.verificavel, true, 'pasta vazia nao pode virar "nao verificavel"');
  assert.strictEqual(r.motivo, null);
  assert.deepStrictEqual(r.semArquivo.map((x) => x.agente), ['busca', 'arquiteto']);
});

test('apelidos: sem apelidos gravados a conferencia se declara NAO verificavel', () => {
  const r = apelidos.conferir({ agentes: { escada: ['busca'] } }, lidos([ag('busca', 'barato')]));
  assert.strictEqual(r.verificavel, false);
  assert.ok(r.motivo.includes('apelidos'), r.motivo);
});

test('apelidos: projeto.json ausente por completo nao estoura', () => {
  const r = apelidos.conferir(null, lidos([ag('busca', 'barato')]));
  assert.strictEqual(r.verificavel, false);
});

// ------------------------------------------------------------ a divergencia

test('apelidos: mapa e arquivos casados nao acusam nada', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', 'barato'), ag('arquiteto', 'caro')]));
  assert.strictEqual(r.verificavel, true);
  assert.deepStrictEqual(r.divergencias, []);
  assert.deepStrictEqual(r.naoDeclarados, []);
  assert.deepStrictEqual(r.semArquivo, []);
  assert.deepStrictEqual(r.foraDoMapa, []);
});

test('apelidos: model: diferente do apelido gravado e a divergencia, e diz os DOIS lados', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', 'caro'), ag('arquiteto', 'caro')]));
  assert.strictEqual(r.divergencias.length, 1, JSON.stringify(r.divergencias));
  assert.strictEqual(r.divergencias[0].agente, 'busca');
  assert.strictEqual(r.divergencias[0].declarado, 'caro');
  assert.strictEqual(r.divergencias[0].gravado, 'barato');
});

// Foco de revisao 4: ausente e vazio sao a MESMA resposta, e nenhuma e divergir.
test('apelidos: agente sem model: NAO e divergencia - e nao declarado', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', null), ag('arquiteto', 'caro')]));
  assert.deepStrictEqual(r.divergencias, [], 'nao declarado virou achado falso');
  assert.strictEqual(r.naoDeclarados.length, 1);
  assert.strictEqual(r.naoDeclarados[0].agente, 'busca');
});

test('apelidos: model: vazio cai no mesmo balde do ausente', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', ''), ag('arquiteto', 'caro')]));
  assert.deepStrictEqual(r.divergencias, []);
  assert.strictEqual(r.naoDeclarados.length, 1);
});

test('apelidos: agente no disco que a escada nao menciona fica fora do mapa, nao divergente', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([
    ag('busca', 'barato'), ag('arquiteto', 'caro'), ag('intruso', 'seja-la-o-que-for')
  ]));
  assert.deepStrictEqual(r.divergencias, []);
  assert.deepStrictEqual(r.foraDoMapa.map((x) => x.agente), ['intruso']);
});

test('apelidos: degrau gravado sem arquivo no disco e balde proprio', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', 'barato')]));
  assert.deepStrictEqual(r.divergencias, []);
  assert.deepStrictEqual(r.semArquivo.map((x) => x.agente), ['arquiteto']);
});

// ----------------------------------------------------------- a mensagem

test('apelidos: o motivo cita os dois lados e as duas direcoes de conserto', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', 'caro'), ag('arquiteto', 'caro')]));
  const m = apelidos.motivo(r);
  assert.ok(m.includes('busca'), m);
  assert.ok(m.includes('caro') && m.includes('barato'), m);
  assert.ok(/a\)/.test(m) && /b\)/.test(m), 'tem de oferecer as DUAS direcoes: ' + m);
  assert.ok(!/arquiteto/.test(m), 'agente que nao divergiu nao entra na mensagem');
});

test('apelidos: o motivo diz que nada foi bloqueado', () => {
  const r = apelidos.conferir(MAPA_DOIS, lidos([ag('busca', 'caro'), ag('arquiteto', 'caro')]));
  assert.ok(/nada foi bloqueado/i.test(apelidos.motivo(r)));
});

// ------------------------------------------------- a correcao (decisao 15)

test('apelidos: trocar o model: preserva o resto do arquivo BYTE A BYTE', () => {
  const antes = '---\nname: busca\nmodel: caro\ndescription: procura\n---\n\n# busca\n\ncorpo com  espacos  e\ttab\n';
  const r = apelidos.trocarModel(antes, 'barato');
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.texto, antes.replace('model: caro', 'model: barato'));
});

test('apelidos: CRLF continua CRLF depois da troca', () => {
  const antes = '---\r\nname: busca\r\nmodel: caro\r\n---\r\ncorpo\r\n';
  const r = apelidos.trocarModel(antes, 'barato');
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.texto, '---\r\nname: busca\r\nmodel: barato\r\n---\r\ncorpo\r\n');
  assert.strictEqual((r.texto.match(/\r\n/g) || []).length, 5, 'perdeu ou ganhou CR: ' + JSON.stringify(r.texto));
});

test('apelidos: o BOM sobrevive a troca', () => {
  const r = apelidos.trocarModel('\uFEFF---\nmodel: caro\n---\n', 'barato');
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.texto.charCodeAt(0), 0xFEFF, 'o BOM sumiu');
  assert.ok(r.texto.includes('model: barato'));
});

test('apelidos: agente SEM model: ganha a linha dentro do frontmatter', () => {
  const r = apelidos.trocarModel('---\nname: busca\n---\n\ncorpo\n', 'barato');
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.texto, '---\nname: busca\nmodel: barato\n---\n\ncorpo\n');
  // e o proprio leitor da T34 tem de conseguir ler o que acabou de ser escrito
  const f = agentesLib.frontmatter(r.texto);
  assert.strictEqual(f.ok, true);
  assert.strictEqual(f.campos.model, 'barato');
});

test('apelidos: a linha acrescentada usa o terminador do arquivo, nao um fixo', () => {
  const r = apelidos.trocarModel('---\r\nname: busca\r\n---\r\ncorpo\r\n', 'barato');
  assert.strictEqual(r.ok, true, r.motivo);
  assert.ok(r.texto.includes('model: barato\r\n'), 'misturou LF em arquivo CRLF: ' + JSON.stringify(r.texto));
  assert.ok(!/[^\r]\n/.test(r.texto), 'sobrou um LF solto: ' + JSON.stringify(r.texto));
});

test('apelidos: arquivo sem frontmatter e RECUSADO, nunca remendado', () => {
  const r = apelidos.trocarModel('# so um titulo\n', 'barato');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.texto, null);
  assert.ok(r.motivo.includes('frontmatter'), r.motivo);
});

test('apelidos: cerca que abre e nunca fecha e RECUSADA', () => {
  const r = apelidos.trocarModel('---\nname: busca\nmodel: caro\n', 'barato');
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.includes('nunca fecha'), r.motivo);
});

test('apelidos: dois model: no frontmatter param a troca em vez de adivinhar', () => {
  const r = apelidos.trocarModel('---\nmodel: caro\nname: busca\nmodel: outro\n---\n', 'barato');
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.includes('2 linhas'), r.motivo);
});

test('apelidos: model: DEPOIS da cerca de fecho nao e do frontmatter e nao e tocado', () => {
  const antes = '---\nname: busca\nmodel: caro\n---\n\nmodel: isto e prosa do corpo\n';
  const r = apelidos.trocarModel(antes, 'barato');
  assert.strictEqual(r.ok, true, r.motivo);
  assert.ok(r.texto.includes('model: isto e prosa do corpo'), 'mexeu no corpo: ' + r.texto);
  assert.strictEqual((r.texto.match(/model: barato/g) || []).length, 1);
});

// A prova forte: depois de corrigir, a conferencia para de acusar.
test('apelidos: corrigido o arquivo, a conferencia deixa de acusar (ida e volta)', () => {
  const antes = '---\nname: busca\nmodel: caro\n---\n';
  const depois = apelidos.trocarModel(antes, 'barato').texto;
  const lido = agentesLib.frontmatter(depois);
  const r = apelidos.conferir(MAPA_DOIS, lidos([
    { arquivo: 'busca.md', nome: lido.campos.name, model: lido.campos.model, temFrontmatter: true },
    ag('arquiteto', 'caro')
  ]));
  assert.deepStrictEqual(r.divergencias, [], 'a correcao nao corrigiu');
});
