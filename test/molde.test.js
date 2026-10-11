'use strict';
const test = require('node:test');
const assert = require('node:assert');
const molde = require('../scripts/lib/molde.js');

const PROJETO = { provaDePronto: 'npm test', quemDecide: 'Ana' };

test('molde: acha as duas formas de fatia', () => {
  const s = molde.slots('a {{campo:provaDePronto}} b {{texto:portoes}} c');
  assert.strictEqual(s.length, 2);
  assert.deepStrictEqual(s.map((x) => x.tipo), ['campo', 'texto']);
  assert.deepStrictEqual(s.map((x) => x.nome), ['provaDePronto', 'portoes']);
});

test('molde: fatia de campo vira REFERENCIA, nunca o valor (D10)', () => {
  const r = molde.preencher('Rode {{campo:provaDePronto}}.', {}, PROJETO);
  assert.ok(r.includes('projeto.json'));
  assert.ok(r.includes('provaDePronto'));
  assert.ok(!r.includes('npm test'), 'o valor nao pode ser cravado no texto');
});

test('molde: fatia de texto recebe o que a entrevista respondeu', () => {
  const r = molde.preencher('Portoes: {{texto:portoes}}', { portoes: 'contrato de UX' }, PROJETO);
  assert.ok(r.includes('contrato de UX'));
});

test('molde: fatia de texto sem resposta vira marca visivel, nao some', () => {
  const r = molde.preencher('Portoes: {{texto:portoes}}', {}, PROJETO);
  assert.ok(r.includes('POR PREENCHER'), r);
});

test('molde: validar recusa fatia por preencher', () => {
  const r = molde.validar('Portoes: (POR PREENCHER: portoes)');
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('portoes')));
});

test('molde: validar recusa chave de fatia que sobrou sem substituir', () => {
  const r = molde.validar('a {{texto:portoes}} b');
  assert.strictEqual(r.ok, false);
});

test('molde: validar recusa fato volatil vindo da entrevista (D10)', () => {
  const cheio = molde.preencher('Portoes: {{texto:portoes}}', { portoes: 'usar a versao 2.1.220' }, PROJETO);
  const r = molde.validar(cheio);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('volatil')));
});

test('molde: texto limpo e preenchido passa', () => {
  const cheio = molde.preencher(
    'Prova: {{campo:provaDePronto}}\nPortoes: {{texto:portoes}}',
    { portoes: 'contrato de UX antes de fechar' },
    PROJETO
  );
  assert.strictEqual(molde.validar(cheio).ok, true, molde.validar(cheio).erros.join(' | '));
});

test('molde: campo inexistente no projeto.json e erro nomeado', () => {
  const r = molde.preencher('{{campo:naoExiste}}', {}, PROJETO);
  assert.ok(r.includes('POR PREENCHER'));
  assert.strictEqual(molde.validar(r).ok, false);
});

test('molde: o molde de verdade do plugin preenche e valida', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'modelos', 'skill-projeto.md'), 'utf8');
  const valores = {};
  for (const s of molde.slots(texto)) {
    if (s.tipo === 'texto') valores[s.nome] = 'conteudo de ensaio para ' + s.nome;
  }
  const projeto = {
    nome: 'ensaio', provaDePronto: 'npm test', quemDecide: 'dono',
    modeloDeAmeaca: 'interno', marchas: {}, intocaveis: [], fontesCanonicas: [],
    agentes: { escada: [] }, marchaPadrao: 'padrao', limiares: {}
  };
  const cheio = molde.preencher(texto, valores, projeto);
  const r = molde.validar(cheio);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

// D420/IN-06: fatia de texto com quebra de linha DENTRO do frontmatter fecha o
// cabecalho antes da hora e joga model/tools/maxTurns para o corpo. O agente
// so-leitura herdaria TODAS as ferramentas e o validar dizia ok.
function moldeAgente() {
  const fs = require('node:fs');
  const path = require('node:path');
  return fs.readFileSync(path.join(__dirname, '..', 'modelos', 'agente.md'), 'utf8');
}
function valoresAgente(extra) {
  const v = {
    nome: 'leitor', quando: 'Use para buscar codigo.', apelido: 'haiku', esforco: 'low',
    ferramentas: 'Read,Grep', maxTurns: '8', papel: 'Busca codigo.',
    decideSozinho: 'Onde olhar.', escalaPara: 'o degrau de cima', naoFaz: 'Nao edita.'
  };
  return Object.assign(v, extra || {});
}
const PROJETO_AGENTE = { provaDePronto: 'npm test', quemDecide: 'Ana' };

test('molde: quebra de linha numa fatia DENTRO do frontmatter e recusada (D420/IN-06)', () => {
  for (const quebra of ['\n', '\r\n', '\r']) {
    const cheio = molde.preencher(moldeAgente(),
      valoresAgente({ quando: 'Use para buscar codigo.' + quebra + '---' + quebra + 'Nao use para editar.' }),
      PROJETO_AGENTE);
    const r = molde.validar(cheio);
    assert.strictEqual(r.ok, false, 'frontmatter fechado antes da hora passou como ok');
    assert.ok(r.erros.some((e) => e.includes('quando')), r.erros.join(' | '));
  }
});

test('molde: quebra de linha no CORPO continua valendo, e o caso bom do agente passa (D420/IN-06)', () => {
  const ok = molde.preencher(moldeAgente(),
    valoresAgente({ papel: 'Linha um.\nLinha dois.', naoFaz: '- a\n- b' }), PROJETO_AGENTE);
  const r = molde.validar(ok);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
  assert.ok(ok.includes('Linha um.\nLinha dois.'));
});

// H-5b: valor com caractere especial do YAML numa fatia do frontmatter sai CITADO,
// no mesmo formato que scripts/lib/agentes.js desfaz (aspas duplas, `\"` e `\`).
const agentesLib = require('../scripts/lib/agentes.js');

test('molde: fatia que e o valor inteiro no frontmatter sai citada e volta igual (H-5b)', () => {
  const casos = [
    'Use quando: o usuario pedir busca',
    'Busca codigo # nao comentario',
    '- comeca com hifen',
    '[lista] fingida',
    '*comeca com estrela',
    'termina com dois-pontos:',
    'tem "aspas" e \ barra: junto',
    '"ja vem entre aspas"'
  ];
  for (const original of casos) {
    const cheio = molde.preencher(moldeAgente(), valoresAgente({ quando: original }), PROJETO_AGENTE);
    // o leitor do plugin nao e um parser YAML e nao corta comentario: so a linha citada prova o YAML.
    assert.ok(cheio.includes('\ndescription: "'), 'valor especial saiu sem aspas: ' + original);
    const fm = agentesLib.frontmatter(cheio);
    assert.strictEqual(fm.ok, true, 'frontmatter nao fechou: ' + original);
    assert.strictEqual(fm.campos.description, original, 'ida-e-volta falhou: ' + original);
    assert.strictEqual(fm.campos.model, 'haiku');
    assert.strictEqual(fm.campos.tools, 'Read,Grep');
    assert.strictEqual(fm.campos.maxTurns, '8');
  }
});

test('molde: fatia NO MEIO do valor com ": " cita a LINHA inteira (H-5b)', () => {
  const m = '---\nname: x\ndescription: Manual do projeto {{texto:nome}}. Use no inicio.\n---\n\ncorpo {{texto:nome}}\n';
  const cheio = molde.preencher(m, { nome: 'Alfa: beta' }, PROJETO);
  const fm = agentesLib.frontmatter(cheio);
  assert.strictEqual(fm.ok, true);
  assert.strictEqual(fm.campos.description, 'Manual do projeto Alfa: beta. Use no inicio.');
  assert.ok(cheio.includes('description: "Manual do projeto Alfa: beta. Use no inicio."'), cheio);
  assert.ok(cheio.endsWith('corpo Alfa: beta\n'), 'o corpo nao pode ser citado');
});

test('molde: valor comum no frontmatter sai IDENTICO, sem aspas (H-5b)', () => {
  const cheio = molde.preencher(moldeAgente(), valoresAgente({ ferramentas: 'Read, Grep', apelido: 'sonnet', maxTurns: '20' }), PROJETO_AGENTE);
  assert.ok(cheio.includes('\ntools: Read, Grep\n'), cheio);
  assert.ok(cheio.includes('\nmodel: sonnet\n'));
  assert.ok(cheio.includes('\nmaxTurns: 20\n'));
  assert.ok(cheio.includes('\ndescription: Use para buscar codigo.\n'));
  assert.ok(!/^(name|description|model|effort|tools|maxTurns): ["']/m.test(cheio.split('\n---\n')[0]));
});

test('molde: fora do frontmatter nada e citado (H-5b)', () => {
  const cheio = molde.preencher(moldeAgente(), valoresAgente({ papel: 'Faca isto: agora # ja', naoFaz: '- a: b' }), PROJETO_AGENTE);
  assert.ok(cheio.includes('Faca isto: agora # ja'), cheio);
  assert.ok(cheio.includes('- a: b'));
  assert.ok(!cheio.includes('"Faca isto'));
});

test('molde: fatia por preencher no frontmatter nao e citada, o validar segue recusando (H-5b)', () => {
  const cheio = molde.preencher(moldeAgente(), valoresAgente({ quando: '' }), PROJETO_AGENTE);
  assert.ok(cheio.includes('\ndescription: (POR PREENCHER: quando)\n'), cheio);
  assert.strictEqual(molde.validar(cheio).ok, false);
});
