'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const escopo = require('../scripts/lib/escopo.js');

function projetoTmp(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-escopo-frente-'));
  for (const [rel, txt] of Object.entries(arquivos || {})) {
    const alvo = path.join(dir, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, txt, 'utf8');
  }
  return dir;
}

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

// D36 dizia "Fora nao bloqueia", e era verdade entao. D244/defeito 7: agora bloqueia, e a
// mensagem tem de dizer o que o portao faz - nem mais, nem menos.
test('escopo D36/D244: a mensagem diz que "Fora de escopo" bloqueia, porque agora bloqueia', () => {
  const m = escopo.motivoSemEscopo('src/a.js', 'padrao');
  assert.ok(!m.includes('e a parte que funciona'));
  assert.ok(!m.includes('nao bloqueia'));
  assert.ok(m.includes('tambem bloqueia'));
});

test('D244/defeito 2: item com anotacao depois do caminho casa pelo caminho', () => {
  const esc = escopo.parse('## Dentro\n- src/a.js (o motivo)\n- `src/b/**` — outro motivo\n- src/c.js\n' +
    '- src/d.js -- motivo\n- src/e.js # motivo\n- src/f.js - motivo\n');
  assert.deepStrictEqual(esc.dentro, ['src/a.js', 'src/b/**', 'src/c.js', 'src/d.js', 'src/e.js', 'src/f.js']);
  assert.ok(escopo.dentro('src/a.js', esc));
  assert.ok(escopo.dentro('src/b/x.js', esc));
});

test('D244/defeito 2: caminho com espaco e hifen no nome continua inteiro', () => {
  const esc = escopo.parse('## Dentro\r\n- Minha Pasta/extension/**\r\n- src/meu-arquivo.js\r\n- `Pasta X/a b.md` (motivo)\r\n');
  assert.deepStrictEqual(esc.dentro, ['Minha Pasta/extension/**', 'src/meu-arquivo.js', 'Pasta X/a b.md']);
});

// ---------------------------------------------------- escopo por frente

test('escopo: frenteDoAlvo reconhece um arquivo de frente valido', () => {
  const f = escopo.frenteDoAlvo('.claude/esquadro/escopos/omni.md');
  assert.deepStrictEqual(f, { nome: 'omni', valido: true });
});

test('escopo: frenteDoAlvo aceita prefixo e extensao sem diferenciar caixa (D38)', () => {
  const f = escopo.frenteDoAlvo('.claude/Esquadro/Escopos/omni.MD');
  assert.deepStrictEqual(f, { nome: 'omni', valido: true });
});

test('escopo: frenteDoAlvo marca invalido quando o nome tem caractere fora da classe', () => {
  const f = escopo.frenteDoAlvo('.claude/esquadro/escopos/onda 8.md');
  assert.deepStrictEqual(f, { nome: 'onda 8', valido: false });
});

test('escopo: frenteDoAlvo devolve null fora da pasta de frentes, sem nome ou com barra', () => {
  assert.strictEqual(escopo.frenteDoAlvo('.claude/esquadro/escopo.md'), null);
  assert.strictEqual(escopo.frenteDoAlvo('src/a.js'), null);
  assert.strictEqual(escopo.frenteDoAlvo('.claude/esquadro/escopos/.md'), null);
  assert.strictEqual(escopo.frenteDoAlvo('.claude/esquadro/escopos/sub/omni.md'), null);
});

test('escopo: arquivoEmVigor usa o arquivo da frente quando ele existe no disco', () => {
  const dir = projetoTmp({ '.claude/esquadro/escopos/omni.md': '## Dentro\n- src/a.js\n' });
  try {
    assert.strictEqual(escopo.arquivoEmVigor(dir, 'omni'), '.claude/esquadro/escopos/omni.md');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: arquivoEmVigor cai no escopo.md sem frente, ou com frente aposentada', () => {
  const dir = projetoTmp({});
  try {
    assert.strictEqual(escopo.arquivoEmVigor(dir, null), escopo.ARQUIVO);
    assert.strictEqual(escopo.arquivoEmVigor(dir, ''), escopo.ARQUIVO);
    assert.strictEqual(escopo.arquivoEmVigor(dir, 'omni'), escopo.ARQUIVO, 'frente sem arquivo no disco');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: arquivoEmVigor saneia a frente antes de montar o caminho', () => {
  const dir = projetoTmp({ '.claude/esquadro/escopos/onda-8.md': '## Dentro\n- a.js\n' });
  try {
    assert.strictEqual(escopo.arquivoEmVigor(dir, 'onda 8'), '.claude/esquadro/escopos/onda-8.md');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: carregar(cwd, frente) le o arquivo da frente vinculada', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopo.md': '## Dentro\n- geral.js\n',
    '.claude/esquadro/escopos/omni.md': '## Dentro\n- src/a.js\n'
  });
  try {
    assert.deepStrictEqual(escopo.carregar(dir, 'omni').dentro, ['src/a.js']);
    assert.deepStrictEqual(escopo.carregar(dir, null).dentro, ['geral.js']);
    assert.deepStrictEqual(escopo.carregar(dir).dentro, ['geral.js'], 'compat: sem frente e como hoje');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: as 4 mensagens citam o arquivo passado, no lugar do escopo.md padrao', () => {
  const esc = escopo.parse('## Dentro\n- src/a.js\n');
  const arquivo = '.claude/esquadro/escopos/omni.md';
  assert.ok(escopo.motivoSemEscopo('src/a.js', 'padrao', arquivo).includes(arquivo));
  assert.ok(!escopo.motivoSemEscopo('src/a.js', 'padrao', arquivo).includes(escopo.ARQUIVO));
  assert.ok(escopo.motivoFora('src/a.js', 'padrao', esc, arquivo).includes(arquivo));
  assert.ok(escopo.motivoDeclaradoFora('src/a.js', 'src/**', arquivo).includes(arquivo));
  assert.ok(escopo.motivoOutraFrente('src/a.js', arquivo).includes(arquivo));
});

test('escopo: as 4 mensagens citam o escopo.md quando o arquivo nao e passado (compat)', () => {
  const esc = escopo.parse('## Dentro\n- src/a.js\n');
  assert.ok(escopo.motivoSemEscopo('src/a.js', 'padrao').includes(escopo.ARQUIVO));
  assert.ok(escopo.motivoDeclaradoFora('src/a.js', 'src/**').includes(escopo.ARQUIVO));
  assert.ok(escopo.motivoOutraFrente('src/a.js').includes(escopo.ARQUIVO));
});

test('escopo: motivoNomeDeFrente e curto, ASCII e cita o alvo', () => {
  const m = escopo.motivoNomeDeFrente('.claude/esquadro/escopos/onda 8.md');
  assert.ok(m.includes('.claude/esquadro/escopos/onda 8.md'));
  assert.ok(/^[\x20-\x7E\n]+$/.test(m), 'motivo fora de ASCII: ' + m);
  assert.ok(/letras sem acento/.test(m));
});

test('escopo: avisoHeranca sem escopo.md e sem frente nenhuma devolve null', () => {
  const dir = projetoTmp({});
  try {
    assert.strictEqual(escopo.avisoHeranca(dir, null), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: avisoHeranca com vinculo a frente existente cita nome, arquivo e objetivo', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, 'omni');
    assert.ok(a.includes('omni'), a);
    assert.ok(a.includes('.claude/esquadro/escopos/omni.md'), a);
    assert.ok(a.includes('fechar a onda 8'), a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: avisoHeranca com vinculo a frente aposentada volta a valer o escopo.md', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopo.md': '**Objetivo:** tarefa antiga\n## Dentro\n- src/a.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, 'omni');
    assert.ok(a.includes('escopo herdado'), a);
    assert.ok(a.includes('tarefa antiga'), a);
    assert.ok(!a.includes('vinculada'), a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: avisoHeranca lista as frentes existentes e diz como se vincular', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n',
    '.claude/esquadro/escopos/tecnica.md': '**Objetivo:** medir a oscilacao\n## Dentro\n- src/b.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, null);
    assert.ok(a.includes('omni'), a);
    assert.ok(a.includes('fechar a onda 8'), a);
    assert.ok(a.includes('tecnica'), a);
    assert.ok(a.includes('medir a oscilacao'), a);
    assert.ok(/vincula/.test(a), a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: avisoHeranca sem pasta escopos/ nem frentes e identico ao de hoje', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopo.md': '**Objetivo:** tarefa unica\n## Dentro\n- src/a.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, null);
    assert.ok(a.includes('escopo herdado'), a);
    assert.ok(!/frentes de trabalho/.test(a), a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: a linha do vinculo fecha com o aviso de reescrever o arquivo da frente', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, 'omni');
    assert.ok(a.includes('Se a tarefa mudou, reescreva .claude/esquadro/escopos/omni.md antes de editar.'), a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: com vinculo, a lista de frentes nao repete a frente vinculada', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n',
    '.claude/esquadro/escopos/tecnica.md': '**Objetivo:** medir a oscilacao\n## Dentro\n- src/b.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, 'omni');
    assert.ok(a.includes('  - tecnica: medir a oscilacao'), a);
    assert.ok(!a.includes('  - omni:'), 'a frente vinculada nao entra na lista: ' + a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: com vinculo e sem outra frente, o bloco da lista nao sai', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, 'omni');
    assert.ok(a.includes('vinculada a frente omni'), a);
    assert.ok(!/frentes de trabalho/.test(a), a);
    assert.ok(!/Editar o arquivo da frente vincula/.test(a), a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: pasta chamada x.md dentro de escopos/ nao entra na lista de frentes', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/tecnica.md': '**Objetivo:** medir a oscilacao\n## Dentro\n- src/b.js\n'
  });
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'esquadro', 'escopos', 'pasta.md'));
    const a = escopo.avisoHeranca(dir, null);
    assert.ok(a.includes('  - tecnica:'), a);
    assert.ok(!a.includes('pasta'), 'pasta nao e frente: ' + a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: a linha do vinculo cita o nome saneado da frente, nunca o valor cru do estado', () => {
  const dir = projetoTmp({
    '.claude/esquadro/escopos/om-ni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
  });
  try {
    const a = escopo.avisoHeranca(dir, 'om ni');
    assert.ok(a.includes('vinculada a frente om-ni (.claude/esquadro/escopos/om-ni.md)'), a);
    assert.ok(!a.includes('om ni'), 'valor cru do estado nao pode chegar ao texto: ' + a);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('escopo: nomeSeguro troca o que esta fora da classe de frente por hifen', () => {
  assert.strictEqual(escopo.nomeSeguro('om ni/x'), 'om-ni-x');
  assert.strictEqual(escopo.nomeSeguro('onda_8-a'), 'onda_8-a');
});
