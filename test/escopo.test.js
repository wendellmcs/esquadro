'use strict';
const test = require('node:test');
const assert = require('node:assert');
const escopo = require('../scripts/lib/escopo.js');

const TEXTO = [
  '# Escopo',
  '',
  '**Objetivo:** ligar a trava de escopo',
  '',
  '## Dentro',
  '- scripts/portao-escopo.js',
  '- `test/portao-escopo.test.js`',
  '- scripts/lib/**',
  '',
  '## Fora de escopo',
  '- refatorar io.js',
  '- qualquer coisa em Projeto Vizinho/'
].join('\n');

test('escopo: parse le objetivo, dentro e fora', () => {
  const e = escopo.parse(TEXTO);
  assert.strictEqual(e.objetivo, 'ligar a trava de escopo');
  assert.deepStrictEqual(e.dentro, ['scripts/portao-escopo.js', 'test/portao-escopo.test.js', 'scripts/lib/**']);
  assert.strictEqual(e.fora.length, 2);
});

test('escopo: marcador de lista e crase sao removidos', () => {
  const e = escopo.parse(TEXTO);
  assert.ok(!e.dentro.some((d) => d.includes('`')));
  assert.ok(!e.dentro.some((d) => d.startsWith('-')));
});

test('escopo: dentro casa caminho exato e glob', () => {
  const e = escopo.parse(TEXTO);
  assert.strictEqual(escopo.dentro('scripts/portao-escopo.js', e), true);
  assert.strictEqual(escopo.dentro('scripts/lib/glob.js', e), true);
  assert.strictEqual(escopo.dentro('scripts/outro.js', e), false);
});

test('escopo: texto vazio da escopo vazio, e escopo vazio nao autoriza nada', () => {
  const e = escopo.parse('');
  assert.deepStrictEqual(e.dentro, []);
  assert.strictEqual(escopo.dentro('qualquer.js', e), false);
});

test('escopo: secao nova encerra a anterior', () => {
  const e = escopo.parse('## Dentro\n- a.js\n## Notas\n- b.js');
  assert.deepStrictEqual(e.dentro, ['a.js']);
});

test('escopo: todos os motivos sao ASCII puro (R5)', () => {
  const esc = escopo.parse(TEXTO);
  const motivos = [
    escopo.motivoSemEscopo('src/a.js', 'padrao'),
    escopo.motivoFora('src/a.js', 'aaa', esc),
    escopo.motivoIntocavel('segredo.env'),
    escopo.motivoOutraFrente('src/a.js')
  ];
  for (const m of motivos) {
    assert.ok(/^[\x20-\x7E\n]+$/.test(m), 'motivo fora de ASCII: ' + m.slice(0, 40));
  }
});

test('escopo: motivoSemEscopo ensina o formato e cita o arquivo', () => {
  const m = escopo.motivoSemEscopo('src/a.js', 'padrao');
  assert.ok(m.includes('src/a.js'));
  assert.ok(m.includes('Fora de escopo'));
  assert.ok(m.includes('.claude/esquadro/escopo.md'));
});

test('escopo D34: conteudoDepois entende Write e Edit, e devolve null no desconhecido', () => {
  // Write: tool_input.content e o "depois" inteiro, direto.
  assert.strictEqual(escopo.conteudoDepois('velho', { content: 'novo' }), 'novo');
  // Edit: simula a substituicao de old_string por new_string sobre o atual.
  assert.strictEqual(
    escopo.conteudoDepois('abc def abc', { old_string: 'abc', new_string: 'XYZ' }),
    'XYZ def abc'
  );
  // Edit com replace_all: true troca todas as ocorrencias.
  assert.strictEqual(
    escopo.conteudoDepois('abc def abc', { old_string: 'abc', new_string: 'XYZ', replace_all: true }),
    'XYZ def XYZ'
  );
  // old_string que nao casa no texto atual: desconhecido.
  assert.strictEqual(escopo.conteudoDepois('abc', { old_string: 'nao existe', new_string: 'X' }), null);
  // nem content, nem old_string: desconhecido.
  assert.strictEqual(escopo.conteudoDepois('abc', {}), null);
  // old_string vazio: desconhecido (evita "casar" com indexOf('') === 0 sempre).
  assert.strictEqual(escopo.conteudoDepois('abc', { old_string: '' }), null);
});

test('escopo D34: ampliou distingue crescer de encolher', () => {
  const antes = escopo.parse('## Dentro\n- src/**\n- test/**\n');
  const cresceu = escopo.parse('## Dentro\n- src/**\n- test/**\n- docs/**\n');
  const encolheu = escopo.parse('## Dentro\n- src/**\n');
  const mesmaLista = escopo.parse('## Dentro\n- test/**\n- src/**\n');
  assert.strictEqual(escopo.ampliou(antes, cresceu), true);
  assert.strictEqual(escopo.ampliou(antes, encolheu), false);
  assert.strictEqual(escopo.ampliou(antes, mesmaLista), false);
  // "depois" desconhecido (null) conta como ampliacao - a favor da visibilidade.
  assert.strictEqual(escopo.ampliou(antes, null), true);
  assert.strictEqual(escopo.ampliou(null, cresceu), true);
});

test('escopo D36: a SAIDA e ASCII pura mesmo com entrada acentuada', () => {
  const esc = escopo.parse('## Dentro\n- src/** (só os módulos novos)\n');
  const motivos = [
    escopo.motivoSemEscopo('docs/relatório.md', 'padrao'),
    escopo.motivoFora('docs/relatório.md', 'padrao', esc),
    escopo.motivoIntocavel('docs/relatório.md'),
    escopo.motivoOutraFrente('docs/relatório.md'),
    // F8: marcha tambem vem de fora (resolverMarcha devolve o nome da chave que
    // casou no projeto.json) e tambem precisa ser sanitizada, nao so alvo/dentro.
    escopo.motivoSemEscopo('src/a.js', 'padrão'),
    escopo.motivoFora('src/a.js', 'padrão', esc)
  ];
  for (const m of motivos) {
    assert.ok(/^[\x20-\x7E\n]*$/.test(m), 'motivo fora de ASCII: ' + m);
  }
});

test('escopo D36: a mensagem nao promete que "Fora de escopo" bloqueia', () => {
  const m = escopo.motivoSemEscopo('src/a.js', 'padrao');
  assert.ok(!m.includes('e a parte que funciona'));
  assert.ok(m.includes('nao bloqueia'));
});
