'use strict';
// Familia A — "a fiacao nao tem prova". Sete achados (R-T15-01, R-T22-05, R-T23-01,
// R-T24-01, R-T25-01, R-T26-01, R-T27-02) diziam a mesma coisa: desfazer a ligacao
// entre o script de entrada e a lib deixa a suite IDENTICA. Aqui cada script de
// entrada e exercido COMO PROCESSO, e cada skill tem o frontmatter conferido —
// que e exatamente o que o `claude plugin validate --strict` NAO ve (R-T15-01).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const auditoria = require('../scripts/lib/auditoria.js');

function temp(nome) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-fiacao-' + nome + '-'));
}

/** Roda um script de entrada como processo, com estado de sessao isolado. */
function rodar(script, dir, entrada) {
  const sessoes = path.join(dir, '_sessoes');
  return spawnSync(process.execPath, [path.join(RAIZ, 'scripts', script)], {
    cwd: dir,
    encoding: 'utf8',
    input: entrada === undefined ? undefined : JSON.stringify(entrada),
    env: Object.assign({}, process.env, { ESQUADRO_TMP: sessoes })
  });
}

function lerSessao(dir, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '_sessoes', 'esquadro', id + '.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function escrever(dir, rel, conteudo) {
  const alvo = path.join(dir, rel);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, conteudo, 'utf8');
}

// ---------------------------------------------------------------- A1: a fiacao

test('fiacao: auditar.js enxerga uma skill real e devolve as seis chaves (R-T27-02)', () => {
  const dir = temp('auditar');
  try {
    escrever(dir, path.join('.claude', 'skills', 'zelador', 'SKILL.md'),
      '---\nname: zelador\ndescription: varre a casa\n---\n\n- um item de instrucao\n- outro item\n');

    const r = rodar('auditar.js', dir);
    assert.strictEqual(r.status, 0, r.stderr);

    const saida = JSON.parse(r.stdout);
    for (const chave of ['peso', 'skills', 'sobreposicoes', 'contradicoes', 'foraDaRubrica', 'delegaveis']) {
      assert.ok(Object.prototype.hasOwnProperty.call(saida, chave), 'faltou a chave ' + chave);
    }
    // lerSkills() achou a skill, e instrucoes.contar() contou os itens dela.
    assert.deepStrictEqual(saida.skills, ['zelador'], r.stdout);
    assert.strictEqual(saida.peso.total, 2, 'os dois itens de lista da SKILL.md');
    // rubrica.conferir() rodou de verdade: skill de brinquedo nao passa na rubrica.
    assert.strictEqual(saida.foraDaRubrica.length, 1, r.stdout);
    assert.strictEqual(saida.foraDaRubrica[0].skill, 'zelador');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: normalizar, termos e VAZIAS sao exercidos (R-T27-02)', () => {
  // normalizar: caixa some, acento some, pontuacao vira separador.
  assert.deepStrictEqual(auditoria.normalizar('ao concluir a REVISAO, cedo!'),
    ['ao', 'concluir', 'a', 'revisao', 'cedo']);
  assert.deepStrictEqual(auditoria.normalizar('REVISÃO'), ['revisao'], 'acento tem de cair');

  // termos: descarta palavra de 3 letras ou menos, e descarta as VAZIAS.
  const t = auditoria.termos('quando o usuario pedir revisao do codigo');
  assert.ok(t.has('revisao') && t.has('codigo'), Array.from(t).join(','));
  assert.ok(!t.has('quando'), '"quando" esta em VAZIAS');
  assert.ok(!t.has('usuario'), '"usuario" esta em VAZIAS');
  assert.ok(!t.has('do'), 'palavra curta nao entra');

  assert.ok(auditoria.VAZIAS.has('quando') && auditoria.VAZIAS.has('projeto'));
});

test('fiacao: portao-agente conta todo despacho, mesmo quando permite (R-T24-01)', () => {
  const dir = temp('agente-ok');
  try {
    const r = rodar('portao-agente.js', dir,
      { session_id: 'fa1', cwd: dir, tool_name: 'Task', tool_input: { subagent_type: 'arquiteto' } });
    assert.strictEqual(r.status, 0, r.stderr);

    const s = lerSessao(dir, 'fa1');
    assert.ok(s, 'o portao tinha de ter gravado estado de sessao');
    assert.strictEqual(s.contadores.agentes_despachados, 1, JSON.stringify(s));
    // sem projeto.json nao ha escada, entao nao pode ter negado
    assert.strictEqual(s.contadores.agente_caro_em_marcha_rapida, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: portao-agente nega o agente do topo em escopo so de marcha rapida (R-T24-01)', () => {
  const dir = temp('agente-nega');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), JSON.stringify({
      marchaPadrao: 'padrao',
      marchas: { rapida: ['**/*.md'] },
      agentes: { escada: ['busca-rapida', 'tarefas-simples', 'desenvolvedor', 'arquiteto', 'especialista'] }
    }));
    escrever(dir, path.join('.claude', 'esquadro', 'escopo.md'),
      '**objetivo:** corrigir um typo\n\n## dentro\n\n- docs/nota.md\n\n## fora\n\n- tudo o mais\n');

    const r = rodar('portao-agente.js', dir,
      { session_id: 'fa2', cwd: dir, tool_name: 'Task', tool_input: { subagent_type: 'especialista' } });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(/roteamento por custo/i.test(r.stdout), r.stdout);
    assert.ok(r.stdout.includes('especialista'), r.stdout);

    const s = lerSessao(dir, 'fa2');
    assert.strictEqual(s.contadores.agente_caro_em_marcha_rapida, 1, JSON.stringify(s));
    assert.strictEqual(s.contadores.agentes_despachados, 1, 'conta o despacho tambem quando nega');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: abrir-turno zera as marcas do turno e PRESERVA os contadores (R-T26-01, D123)', () => {
  const dir = temp('abrir-turno');
  try {
    const sessoes = path.join(dir, '_sessoes', 'esquadro');
    fs.mkdirSync(sessoes, { recursive: true });
    fs.writeFileSync(path.join(sessoes, 'fa3.json'), JSON.stringify({
      trabalhoReal: true,
      bloqueouNesteTurno: true,
      buscouNesteTurno: true,
      contadores: { comando_destrutivo: 4 },
      gitAbertura: ['src/a.js']
    }), 'utf8');

    const r = rodar('abrir-turno.js', dir, { session_id: 'fa3', cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);

    const s = lerSessao(dir, 'fa3');
    assert.strictEqual(s.trabalhoReal, undefined, 'a marca do turno tinha de sumir');
    assert.strictEqual(s.bloqueouNesteTurno, undefined, 'a marca do turno tinha de sumir');
    // ronda 1 do 8b: a busca tambem e do turno - senao o turno que so leu libera criar no seguinte
    assert.strictEqual(s.buscouNesteTurno, undefined, 'a marca de busca tinha de sumir');
    // D123: o balde de contador nao pode ser zerado aqui, senao o ledger da D14 perde o dado.
    assert.strictEqual(s.contadores.comando_destrutivo, 4, 'o contador tinha de sobreviver');
    assert.deepStrictEqual(s.gitAbertura, ['src/a.js'], 'a foto do git tinha de sobreviver');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: gerar-skill sem projeto.json manda rodar o init, em vez de estourar (R-T25-01)', () => {
  const dir = temp('gerar-skill');
  try {
    const r = rodar('gerar-skill.js', dir);
    assert.notStrictEqual(r.status, 0, 'sem configuracao ele tem de recusar');
    const saida = r.stdout + r.stderr;
    assert.ok(/esquadro:init/.test(saida), saida);
    assert.ok(/projeto\.json/.test(saida), saida);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------- A2: o que o --strict nao ve

test('fiacao: toda skill do plugin tem frontmatter valido (R-T15-01, R-T22-05)', () => {
  // O `claude plugin validate --strict` passa mesmo com a linha `name:` removida de
  // uma SKILL.md — medido com controle positivo na T15. Esta e a prova que falta.
  const dirSkills = path.join(RAIZ, 'skills');
  const nomes = fs.readdirSync(dirSkills).filter(function (n) {
    return fs.statSync(path.join(dirSkills, n)).isDirectory();
  });
  assert.ok(nomes.length >= 1, 'o plugin tem de ter pelo menos uma skill');

  for (const nome of nomes) {
    const arquivo = path.join(dirSkills, nome, 'SKILL.md');
    assert.ok(fs.existsSync(arquivo), nome + ': falta SKILL.md');

    const texto = fs.readFileSync(arquivo, 'utf8');
    const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    assert.ok(m, nome + ': SKILL.md sem frontmatter delimitado por ---');

    const campos = m[1];
    const mNome = campos.match(/^name:\s*(.+)$/m);
    assert.ok(mNome, nome + ': frontmatter sem campo name');
    assert.strictEqual(mNome[1].trim(), nome, nome + ': o name do frontmatter nao bate com a pasta');

    const mDesc = campos.match(/^description:\s*(.+)$/m);
    assert.ok(mDesc, nome + ': frontmatter sem campo description');
    assert.ok(mDesc[1].trim().length > 0, nome + ': description vazia');
  }
});

// ------------------------- A3: os dois que a medicao da D130 achou ABERTOS
// A D130 secao 3 desmentiu o agrupamento: o rotulo "familia A" cobria sete
// achados, mas dois deles apontavam para codigo que nenhum dos outros toca.
// Desfazer a fiacao destes dois deixava a suite em 369 | 369 | fail 0 —
// identica. Estes cinco testes sao a prova que faltava.
const destrutivoLib = require('../scripts/lib/destrutivo.js');

const PLATAFORMA_WIN = { so: 'win32', shell: 'powershell' };

function comPlataforma(dir, plataforma) {
  escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'),
    JSON.stringify({ plataforma: plataforma }));
}

/** O motivo que o portao devolveu ao negar, ou null se ele permitiu. */
function motivoNegado(r) {
  try {
    return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
  } catch (e) {
    return null;
  }
}

test('fiacao: portao-destrutivo nega idioma de shell errado e conta a tentativa (R-T23-01)', () => {
  const dir = temp('shell-nega');
  try {
    // `head` e inofensivo: se ESTE comando e negado, quem negou foi shell.conferir.
    assert.strictEqual(destrutivoLib.classificar('head -5 notas.txt', null).destrutivo, false,
      'o comando de controle nao pode ser destrutivo, senao o teste nao prova nada');

    comPlataforma(dir, PLATAFORMA_WIN);
    const r = rodar('portao-destrutivo.js', dir,
      // D244/defeito 4: a tabela do win32 descreve o PowerShell; a ferramenta Bash e Git Bash.
      { session_id: 'fa4', cwd: dir, tool_name: 'PowerShell', tool_input: { command: 'head -5 notas.txt' } });
    assert.strictEqual(r.status, 0, r.stderr);

    const motivo = motivoNegado(r);
    assert.ok(motivo, 'o portao tinha de ter negado; stdout: ' + JSON.stringify(r.stdout));
    assert.ok(/idioma de shell errado/i.test(motivo), motivo);
    // a sugestao vem da tabela em modelos/shell-win32.json, nao de texto solto
    assert.ok(motivo.includes('Get-Content arq -TotalCount N'), 'faltou a sugestao da tabela: ' + motivo);

    const s = lerSessao(dir, 'fa4');
    assert.ok(s, 'o portao tinha de ter gravado estado de sessao');
    assert.strictEqual(s.contadores.shell_idioma_errado, 1, JSON.stringify(s));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: o MESMO comando passa quando a plataforma nao e a da tabela (R-T23-01)', () => {
  // Controle: prova que a negacao acima veio da tabela carregada pela plataforma
  // declarada (F16), e nao de alguma outra regra do portao casando `head` por acaso.
  const dir = temp('shell-passa');
  try {
    comPlataforma(dir, { so: 'linux', shell: 'bash' });
    const r = rodar('portao-destrutivo.js', dir,
      { session_id: 'fa5', cwd: dir, tool_name: 'Bash', tool_input: { command: 'head -5 notas.txt' } });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, '', 'fora da plataforma da tabela o portao tem de permitir calado');
    assert.strictEqual(lerSessao(dir, 'fa5'), null, 'permitir nao enche balde de contador');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: o portao de shell responde ANTES do de comando destrutivo (R-T23-01)', () => {
  // `rm -rf build` e as DUAS coisas ao mesmo tempo. A ordem dos dois portoes
  // nunca teve cobertura (D130 secao 6): trocar shell.conferir por [] fazia o
  // portao destrutivo responder no lugar, e a suite nao percebia a troca.
  const dir = temp('ordem');
  try {
    assert.strictEqual(destrutivoLib.classificar('rm -rf build', null).destrutivo, true,
      'o comando de controle tem de ser destrutivo, senao este teste nao prova ordem');

    comPlataforma(dir, PLATAFORMA_WIN);
    const r = rodar('portao-destrutivo.js', dir,
      { session_id: 'fa6', cwd: dir, tool_name: 'PowerShell', tool_input: { command: 'rm -rf build' } });
    assert.strictEqual(r.status, 0, r.stderr);

    const motivo = motivoNegado(r);
    assert.ok(motivo, 'o portao tinha de ter negado; stdout: ' + JSON.stringify(r.stdout));
    assert.ok(/idioma de shell errado/i.test(motivo), 'respondeu o portao errado: ' + motivo);
    assert.ok(motivo.includes('Remove-Item -Recurse -Force'), motivo);

    const s = lerSessao(dir, 'fa6');
    assert.strictEqual(s.contadores.shell_idioma_errado, 1, JSON.stringify(s));
    assert.strictEqual(s.contadores.comando_destrutivo, undefined,
      'o balde do destrutivo nao pode encher quando quem negou foi o portao de shell');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: abertura avisa quando OUTRA sessao detem o plano ativo (R-T25-01, F17)', () => {
  const dir = temp('plano-outro');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'plano-ativo.json'),
      JSON.stringify({ arquivo: 'docs/plano-v9.md', sessionId: 'sessao-do-outro', tarefa: null }));

    const r = rodar('abertura.js', dir, { session_id: 'fa7', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(/outra sessao detem o plano ativo/i.test(r.stdout), JSON.stringify(r.stdout));
    // os dois campos saem do arquivo lido, nao de texto fixo do aviso
    assert.ok(r.stdout.includes('docs/plano-v9.md'), 'faltou o arquivo do plano-ativo.json: ' + r.stdout);
    assert.ok(r.stdout.includes('sessao-do-outro'), 'faltou o dono do plano-ativo.json: ' + r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: abertura NAO avisa quando o plano ativo e da propria sessao (R-T25-01)', () => {
  // Controle: o aviso e sobre DONO, nao sobre existir plano ativo.
  const dir = temp('plano-meu');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'plano-ativo.json'),
      JSON.stringify({ arquivo: 'docs/plano-v9.md', sessionId: 'fa8', tarefa: null }));

    const r = rodar('abertura.js', dir, { session_id: 'fa8', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!/outra sessao detem/i.test(r.stdout), 'aviso indevido: ' + JSON.stringify(r.stdout));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------- ronda 1 do Passo 8b: ler tambem e procurar

test('fiacao: o marcador escuta toda ferramenta de leitura que a busca conta (ronda 1 do 8b)', () => {
  // A busca contava `read`, e o PostToolUse nunca chamava o marcador para o Read:
  // quem leu o arquivo vizinho era negado ao criar o novo, como se nao tivesse procurado.
  const busca = require('../scripts/lib/busca.js');
  const hooks = JSON.parse(fs.readFileSync(path.join(RAIZ, 'hooks', 'hooks.json'), 'utf8'));
  const grupo = (hooks.hooks.PostToolUse || []).filter(function (g) {
    return JSON.stringify(g.hooks || []).indexOf('marcar-trabalho.js') !== -1;
  })[0];
  assert.ok(grupo, 'o marcar-trabalho.js saiu do PostToolUse');
  const escuta = String(grupo.matcher || '').split('|');
  for (const f of ['Read', 'Grep', 'Glob']) {
    assert.strictEqual(busca.ehBusca(f, {}), true, f + ' deixou de contar como busca');
    assert.ok(escuta.indexOf(f) !== -1,
      f + ' conta como busca, mas o marcador nunca ve a chamada: ' + grupo.matcher);
  }
});

test('fiacao: ler e procurar liberam criar, e nao viram trabalho a provar (ronda 1 do 8b)', () => {
  const dir = temp('so-leitura');
  try {
    const alvo = { file_path: path.join(dir, 'a.js') };
    for (const f of ['Read', 'Grep', 'Glob']) {
      const r = rodar('marcar-trabalho.js', dir,
        { session_id: 'fl-' + f, cwd: dir, tool_name: f, tool_input: alvo });
      assert.strictEqual(r.status, 0, r.stderr);
      const s = lerSessao(dir, 'fl-' + f);
      assert.strictEqual(s.buscouNesteTurno, true, f + ' nao liberou criar arquivo novo');
      assert.strictEqual(s.trabalhoReal, undefined,
        f + ' virou trabalho real: o turno que so leu passaria a dever evidencia no fecho');
      assert.strictEqual(s.arquivosTocados, undefined, f + ' contou o arquivo lido como tocado');
    }
    // controle: editar continua sendo trabalho
    rodar('marcar-trabalho.js', dir,
      { session_id: 'fl-Edit', cwd: dir, tool_name: 'Edit', tool_input: alvo });
    assert.strictEqual(lerSessao(dir, 'fl-Edit').trabalhoReal, true,
      'controle: Edit tem de ligar trabalhoReal');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: a caixa do nome nao muda o que e leitura (ronda 2 do 8b)', () => {
  // A busca ignora a caixa do nome da ferramenta, e o marcador comparava `Read` exato:
  // com `read`, a busca liberava criar e o turno ainda virava trabalho a provar. O
  // matcher do hook so entrega o nome com maiuscula hoje; os dois nao podem divergir.
  const dir = temp('caixa');
  try {
    const alvo = { file_path: path.join(dir, 'a.js') };
    for (const f of ['read', 'GREP', 'gLoB']) {
      const r = rodar('marcar-trabalho.js', dir,
        { session_id: 'fc-' + f, cwd: dir, tool_name: f, tool_input: alvo });
      assert.strictEqual(r.status, 0, r.stderr);
      const s = lerSessao(dir, 'fc-' + f);
      assert.strictEqual(s.buscouNesteTurno, true, 'controle: a busca conta ' + f + ' com qualquer caixa');
      assert.strictEqual(s.trabalhoReal, undefined, f + ' virou trabalho real so pela caixa do nome');
      assert.strictEqual(s.arquivosTocados, undefined, f + ' contou o arquivo lido como tocado');
    }
    // controle: editar com o nome em minuscula continua sendo trabalho
    rodar('marcar-trabalho.js', dir,
      { session_id: 'fc-edit', cwd: dir, tool_name: 'edit', tool_input: alvo });
    assert.strictEqual(lerSessao(dir, 'fc-edit').trabalhoReal, true,
      'controle: edit tem de ligar trabalhoReal');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
