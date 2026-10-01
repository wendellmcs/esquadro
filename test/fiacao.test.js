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

test('fiacao: auditar.js enxerga uma skill real e devolve exatamente as chaves do relatorio (R-T27-02)', () => {
  const dir = temp('auditar');
  try {
    escrever(dir, path.join('.claude', 'skills', 'zelador', 'SKILL.md'),
      '---\nname: zelador\ndescription: varre a casa\n---\n\n- um item de instrucao\n- outro item\n');

    const r = rodar('auditar.js', dir);
    assert.strictEqual(r.status, 0, r.stderr);

    const saida = JSON.parse(r.stdout);
    // 0.3.5 (D291 §4): o nome dizia "seis" com sete chaves, e o teste so conferia presenca - chave
    // nova ou sumida passava calada. Agora e o conjunto exato.
    assert.deepStrictEqual(Object.keys(saida).sort(),
      ['contradicoes', 'delegaveis', 'foraDaRubrica', 'memoria', 'peso', 'regras', 'skills', 'sobreposicoes'],
      'as chaves do relatorio mudaram: ' + Object.keys(saida).join(', '));
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

test('fiacao: portao-agente usa o escopo da frente vinculada, nao o escopo.md geral (escopo por frente)', () => {
  const dir = temp('agente-frente');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), JSON.stringify({
      marchaPadrao: 'padrao',
      marchas: { rapida: ['**/*.md'], padrao: ['src/**'] },
      agentes: { escada: ['busca-rapida', 'tarefas-simples', 'desenvolvedor', 'arquiteto', 'especialista'] }
    }));
    // o escopo.md geral so tem caminho de marcha rapida: despachar 'especialista' seria negado por ele.
    escrever(dir, path.join('.claude', 'esquadro', 'escopo.md'),
      '**objetivo:** geral\n\n## dentro\n\n- docs/nota.md\n');
    // a frente vinculada tem um caminho de marcha padrao: o topo da escada passa a ser permitido.
    escrever(dir, path.join('.claude', 'esquadro', 'escopos', 'omni.md'),
      '**objetivo:** onda\n\n## dentro\n\n- src/a.js\n');
    const sessoes = path.join(dir, '_sessoes', 'esquadro');
    fs.mkdirSync(sessoes, { recursive: true });
    fs.writeFileSync(path.join(sessoes, 'fa9.json'), JSON.stringify({ frente: 'omni' }), 'utf8');

    const r = rodar('portao-agente.js', dir,
      { session_id: 'fa9', cwd: dir, tool_name: 'Task', tool_input: { subagent_type: 'especialista' } });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, '',
      'a frente vinculada tem caminho de marcha padrao: nao pode negar o topo da escada; stdout: ' + r.stdout);

    const s = lerSessao(dir, 'fa9');
    assert.strictEqual(s.contadores.agente_caro_em_marcha_rapida, undefined,
      'usou o escopo.md geral (so rapida) em vez da frente vinculada (tem padrao)');
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

// ---- 0.3.4/item 2 (D286): o `cd` solto e negado, com balde proprio e depois das outras conferencias

const PLATAFORMA_LINUX = { so: 'linux', shell: 'bash' };

function chamar(dir, id, ferramenta, comando) {
  const r = rodar('portao-destrutivo.js', dir,
    { session_id: id, cwd: dir, tool_name: ferramenta, tool_input: { command: comando } });
  assert.strictEqual(r.status, 0, r.stderr);
  return r;
}

test('fiacao: portao nega o cd solto no Bash, ensina o subshell e conta no balde cd_solto (D286)', () => {
  const dir = temp('cd-bash');
  try {
    comPlataforma(dir, PLATAFORMA_LINUX);
    const r = chamar(dir, 'cd1', 'Bash', 'cd sub && git status');
    const motivo = motivoNegado(r);
    assert.ok(motivo, 'o portao tinha de ter negado; stdout: ' + JSON.stringify(r.stdout));
    assert.ok(/cd solto/i.test(motivo), motivo);
    assert.ok(motivo.includes('( cd '), 'faltou a forma certa (subshell): ' + motivo);
    assert.ok(motivo.includes('cd sub && git status'), 'faltou o comando negado: ' + motivo);

    const s = lerSessao(dir, 'cd1');
    assert.ok(s, 'o portao tinha de ter gravado estado de sessao');
    assert.strictEqual(s.contadores.cd_solto, 1, JSON.stringify(s));
    assert.strictEqual(s.contadores.shell_idioma_errado, undefined, 'cd solto nao e idioma errado: ' + JSON.stringify(s));
    assert.strictEqual(s.contadores.comando_destrutivo, undefined, JSON.stringify(s));

    chamar(dir, 'cd1', 'Bash', 'echo a; pushd sub');
    assert.strictEqual(lerSessao(dir, 'cd1').contadores.cd_solto, 2, 'a segunda negacao tem de somar no mesmo balde');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: portao nega o cd solto no PowerShell e ensina Push-Location com Pop-Location (D286)', () => {
  const dir = temp('cd-ps');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    // `npm test` nao esta na tabela do idioma: quem nega aqui e o cd solto
    const r = chamar(dir, 'cd2', 'PowerShell', 'Set-Location sub; npm test');
    const motivo = motivoNegado(r);
    assert.ok(motivo, 'o portao tinha de ter negado; stdout: ' + JSON.stringify(r.stdout));
    assert.ok(/cd solto/i.test(motivo), motivo);
    assert.ok(motivo.includes('Push-Location -LiteralPath') && motivo.includes('Pop-Location'), motivo);
    assert.ok(!motivo.includes('( cd '), 'o PowerShell nao recebe o subshell do Bash: ' + motivo);
    assert.strictEqual(lerSessao(dir, 'cd2').contadores.cd_solto, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: o cd solto e negado em qualquer plataforma declarada, e sem plataforma nenhuma (D286)', () => {
  // A trava nao e a tabela do win32: a pasta persiste nos dois.
  for (const plataforma of [PLATAFORMA_LINUX, { so: 'darwin', shell: 'zsh' }, PLATAFORMA_WIN, null]) {
    const dir = temp('cd-plataforma');
    try {
      if (plataforma) comPlataforma(dir, plataforma);
      const r = chamar(dir, 'cd3', 'Bash', 'cd sub && git status');
      assert.ok(motivoNegado(r), JSON.stringify(plataforma) + ' -> ' + JSON.stringify(r.stdout));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('fiacao: chamada sem tool_name - a plataforma declarada escolhe o idioma do cd solto (D286)', () => {
  const dir = temp('cd-sem-ferramenta');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const ps = motivoNegado(chamar(dir, 'cd8', undefined, 'Set-Location sub; npm test'));
    assert.ok(ps && ps.includes('Push-Location -LiteralPath'), 'win32/powershell tinha de ler como PowerShell: ' + ps);
    comPlataforma(dir, PLATAFORMA_LINUX);
    const sh = motivoNegado(chamar(dir, 'cd9', undefined, 'cd sub && npm test'));
    assert.ok(sh && sh.includes('( cd '), 'linux/bash tinha de ler como Bash: ' + sh);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: o subshell e o PowerShell com Pop-Location passam calados e sem encher balde (D286)', () => {
  const dir = temp('cd-passa');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const b = chamar(dir, 'cd4', 'Bash', '( cd sub && git status )');
    assert.strictEqual(b.stdout, '', 'o subshell tem de passar calado: ' + b.stdout);
    const p = chamar(dir, 'cd4', 'PowerShell',
      "Push-Location -LiteralPath 'sub' -ErrorAction Stop; try { npm test } finally { Pop-Location }");
    assert.strictEqual(p.stdout, '', 'a forma medida tem de passar calada: ' + p.stdout);
    assert.strictEqual(lerSessao(dir, 'cd4'), null, 'permitir nao enche balde de contador');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: o comandosLiberados continua liberando o cd solto, e o cd_solto nao conta (D286)', () => {
  const dir = temp('cd-liberado');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'),
      JSON.stringify({ plataforma: PLATAFORMA_LINUX, comandosLiberados: ['^cd sub && git status$'] }));
    const r = chamar(dir, 'cd5', 'Bash', 'cd sub && git status');
    assert.strictEqual(r.stdout, '', 'o escape declarado tinha de liberar: ' + r.stdout);
    assert.strictEqual(lerSessao(dir, 'cd5'), null, 'liberado nao enche balde');
    // controle: o escape e por padrao - outro cd solto continua negado
    assert.ok(motivoNegado(chamar(dir, 'cd5', 'Bash', 'cd outra && git status')), 'o escape nao podia liberar tudo');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: travas.destrutivo false desliga tambem o cd solto, como o README e o init dizem (D295)', () => {
  const dir = temp('cd-trava');
  try {
    // controle: com a trava ligada o mesmo comando e negado como cd solto
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'),
      JSON.stringify({ plataforma: PLATAFORMA_LINUX, travas: { destrutivo: true } }));
    const ligada = motivoNegado(chamar(dir, 'cd8', 'Bash', 'cd sub && git status'));
    assert.ok(ligada && /cd solto/i.test(ligada), 'controle: a trava ligada tinha de negar o cd solto: ' + ligada);

    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'),
      JSON.stringify({ plataforma: PLATAFORMA_LINUX, travas: { destrutivo: false } }));
    const r = chamar(dir, 'cd9', 'Bash', 'cd sub && git status');
    assert.strictEqual(r.stdout, '', 'D295: a chave desliga o cd solto junto: ' + r.stdout);
    assert.strictEqual(lerSessao(dir, 'cd9'), null, 'desligado nao enche balde');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: idioma errado e comando destrutivo respondem ANTES do cd solto, no balde de sempre (D286)', () => {
  const dir = temp('cd-ordem');
  try {
    // idioma: `head` no PowerShell 5.1, junto de um cd solto
    comPlataforma(dir, PLATAFORMA_WIN);
    const i = chamar(dir, 'cd6', 'PowerShell', 'Set-Location sub; head -5 notas.txt');
    const mi = motivoNegado(i);
    assert.ok(mi && /idioma de shell errado/i.test(mi), 'respondeu o portao errado: ' + mi);
    let s = lerSessao(dir, 'cd6');
    assert.strictEqual(s.contadores.shell_idioma_errado, 1, JSON.stringify(s));
    assert.strictEqual(s.contadores.cd_solto, undefined, 'o balde do cd solto nao pode encher: ' + JSON.stringify(s));

    // destrutivo: `rm -rf build` na ferramenta Bash, junto de um cd solto
    comPlataforma(dir, PLATAFORMA_LINUX);
    assert.strictEqual(destrutivoLib.classificar('cd sub && rm -rf build', null).destrutivo, true,
      'o comando de controle tem de ser destrutivo');
    const d = chamar(dir, 'cd7', 'Bash', 'cd sub && rm -rf build');
    const md = motivoNegado(d);
    assert.ok(md && !/cd solto/i.test(md), 'respondeu o portao errado: ' + md);
    s = lerSessao(dir, 'cd7');
    assert.strictEqual(s.contadores.comando_destrutivo, 1, JSON.stringify(s));
    assert.strictEqual(s.contadores.cd_solto, undefined, 'o balde do cd solto nao pode encher: ' + JSON.stringify(s));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- 0.3.5/T2 (D294): tabela do PowerShell ou regra dela que nao se le -> o comando PASSA e sai
// aviso, uma vez por sessao. A tabela ruim vem de uma COPIA do plugin (scripts/ e modelos/) numa
// pasta temporaria: o modelos/shell-win32.json do repositorio nao se toca.

/** Copia scripts/ e modelos/ para uma pasta nova, com a tabela do win32 trocada por `conteudo`. */
function pluginComTabela(conteudo) {
  const base = temp('plugin-tabela');
  fs.cpSync(path.join(RAIZ, 'scripts'), path.join(base, 'scripts'), { recursive: true });
  fs.cpSync(path.join(RAIZ, 'modelos'), path.join(base, 'modelos'), { recursive: true });
  if (conteudo === null) fs.rmSync(path.join(base, 'modelos', 'shell-win32.json'));
  else fs.writeFileSync(path.join(base, 'modelos', 'shell-win32.json'), conteudo, 'utf8');
  return base;
}

function rodarNoPlugin(plugin, script, dir, entrada) {
  const r = spawnSync(process.execPath, [path.join(plugin, 'scripts', script)], {
    cwd: dir, encoding: 'utf8', input: JSON.stringify(entrada),
    env: Object.assign({}, process.env, { ESQUADRO_TMP: path.join(dir, '_sessoes') })
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r;
}

function chamarNoPlugin(plugin, dir, id, ferramenta, comando) {
  return rodarNoPlugin(plugin, 'portao-destrutivo.js', dir,
    { session_id: id, cwd: dir, tool_name: ferramenta, tool_input: { command: comando } });
}

/** O aviso que o portao devolveu ao PERMITIR com aviso, ou null (calado ou negado). */
function avisoPermitido(r) {
  let j = null;
  try { j = JSON.parse(r.stdout); } catch (e) { return null; }
  const h = j && j.hookSpecificOutput;
  if (!h || h.permissionDecision !== undefined || !j.systemMessage) return null;
  return { usuario: j.systemMessage, agente: h.additionalContext, evento: h.hookEventName };
}

test('fiacao: tabela do PowerShell ilegivel - o comando passa com aviso, UMA vez por sessao, e o fecho nao o traz de volta (D294)', () => {
  const plugin = pluginComTabela('{ "quando": ');
  const dir = temp('tabela-ilegivel');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const r1 = chamarNoPlugin(plugin, dir, 'tb1', 'PowerShell', 'npm test');
    const a = avisoPermitido(r1);
    assert.ok(a, 'tinha de permitir COM aviso (systemMessage, sem permissionDecision): ' + JSON.stringify(r1.stdout));
    assert.strictEqual(a.evento, 'PreToolUse');
    assert.ok(a.usuario.includes('shell-win32.json') && /SyntaxError/.test(a.usuario), a.usuario);
    assert.ok(/desligada/i.test(a.usuario), a.usuario);
    assert.ok(a.agente && a.agente.includes('shell-win32.json'), 'o agente tambem tem de saber: ' + a.agente);
    assert.ok(!motivoNegado(r1), 'nada se nega por arquivo estragado');

    const s1 = lerSessao(dir, 'tb1');
    assert.strictEqual(s1.contadores.shell_tabela_quebrada, 1, JSON.stringify(s1));
    assert.strictEqual(s1.avisouTabelaShell, true, JSON.stringify(s1));

    // o 2o comando da mesma sessao passa calado e o balde nao sobe
    const r2 = chamarNoPlugin(plugin, dir, 'tb1', 'PowerShell', 'npm run build');
    assert.strictEqual(r2.stdout, '', 'o aviso e de uma vez por sessao: ' + r2.stdout);
    assert.strictEqual(lerSessao(dir, 'tb1').contadores.shell_tabela_quebrada, 1);

    // o fecho do turno zera o contador do turno, mas a marca de "ja avisei" e da SESSAO.
    // Sem trabalho marcado o fecho nao regrava o estado e a marca sobrevivia de graca (sessao 3).
    rodarNoPlugin(plugin, 'marcar-trabalho.js', dir, { session_id: 'tb1', cwd: dir, tool_name: 'Write' });
    rodarNoPlugin(plugin, 'portao-fecho.js', dir,
      { session_id: 'tb1', cwd: dir, hook_event_name: 'Stop', last_assistant_message: 'Anotado.' });
    assert.strictEqual(lerSessao(dir, 'tb1').avisouTabelaShell, true, 'o fecho perdeu a marca da sessao');
    const r3 = chamarNoPlugin(plugin, dir, 'tb1', 'PowerShell', 'npm test');
    assert.strictEqual(r3.stdout, '', 'o aviso voltou depois do fecho: ' + r3.stdout);
    // outra sessao avisa de novo
    assert.ok(avisoPermitido(chamarNoPlugin(plugin, dir, 'tb2', 'PowerShell', 'npm test')), 'sessao nova tem de avisar');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test('fiacao: seis comandos ao mesmo tempo na mesma sessao avisam UMA vez so (D294)', async () => {
  const { spawn } = require('node:child_process');
  const plugin = pluginComTabela('{ "quando": ');
  const dir = temp('tabela-paralelo');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const entrada = JSON.stringify({ session_id: 'tb11', cwd: dir, tool_name: 'PowerShell', tool_input: { command: 'npm test' } });
    const saidas = await Promise.all(Array.from({ length: 6 }, () => new Promise((resolve) => {
      const f = spawn(process.execPath, [path.join(plugin, 'scripts', 'portao-destrutivo.js')], {
        cwd: dir, env: Object.assign({}, process.env, { ESQUADRO_TMP: path.join(dir, '_sessoes') })
      });
      let out = '';
      f.stdout.on('data', (d) => { out += d; });
      f.on('close', () => resolve(out));
      f.stdin.end(entrada);
    })));
    assert.strictEqual(saidas.filter((o) => o !== '').length, 1, JSON.stringify(saidas));
    assert.strictEqual(lerSessao(dir, 'tb11').contadores.shell_tabela_quebrada, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test('fiacao: tabela do PowerShell que falta (ENOENT) tambem passa com aviso (D294)', () => {
  const plugin = pluginComTabela(null);
  const dir = temp('tabela-ausente');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const a = avisoPermitido(chamarNoPlugin(plugin, dir, 'tb3', 'PowerShell', 'head -5 notas.txt'));
    assert.ok(a, 'sem tabela o `head` passa, e com aviso');
    assert.ok(a.usuario.includes('ENOENT'), a.usuario);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test('fiacao: regra invalida passa com aviso que cita o achado dela; as outras regras seguem negando (D294)', () => {
  const tabela = JSON.parse(fs.readFileSync(path.join(RAIZ, 'modelos', 'shell-win32.json'), 'utf8'));
  tabela.regras.push({ padrao: '(aberto', achado: 'regra-quebrada', sugestao: 'x', motivo: 'y' });
  const plugin = pluginComTabela(JSON.stringify(tabela));
  const dir = temp('tabela-regra');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const a = avisoPermitido(chamarNoPlugin(plugin, dir, 'tb4', 'PowerShell', 'npm test'));
    assert.ok(a, 'tinha de avisar');
    assert.ok(a.usuario.includes('regra-quebrada'), a.usuario);
    assert.ok(!/nao se leu/.test(a.usuario), 'o arquivo se leu: so a regra quebrou: ' + a.usuario);
    assert.strictEqual(lerSessao(dir, 'tb4').contadores.shell_tabela_quebrada, 1);

    // controle: a tabela valida por inteiro nega, e quem nega e a tabela (balde de idioma)
    const n = chamarNoPlugin(plugin, dir, 'tb5', 'PowerShell', 'head -5 notas.txt');
    assert.ok(/idioma de shell errado/i.test(motivoNegado(n) || ''), n.stdout);
    assert.strictEqual(lerSessao(dir, 'tb5').contadores.shell_idioma_errado, 1);
    assert.strictEqual(lerSessao(dir, 'tb5').contadores.shell_tabela_quebrada, undefined,
      'negou, nao avisou: o balde do aviso nao sobe');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test('fiacao: o aviso da tabela so existe onde a tabela valeria; tabela legivel passa calada (D294)', () => {
  const plugin = pluginComTabela('{ "quando": ');
  const dir = temp('tabela-controle');
  try {
    // projeto linux: a tabela do win32 nao vale, nao ha o que avisar
    comPlataforma(dir, PLATAFORMA_LINUX);
    const l = chamarNoPlugin(plugin, dir, 'tb6', 'Bash', 'npm test');
    assert.strictEqual(l.stdout, '', l.stdout);
    assert.strictEqual(lerSessao(dir, 'tb6'), null, 'nao enche balde nem marca a sessao');
    // win32 na ferramenta Bash (Git Bash): a tabela tambem nao vale
    comPlataforma(dir, PLATAFORMA_WIN);
    assert.strictEqual(chamarNoPlugin(plugin, dir, 'tb7', 'Bash', 'npm test').stdout, '');
    assert.strictEqual(lerSessao(dir, 'tb7'), null);
    // o escape declarado do dono (travas.destrutivo === false) continua desligando o portao inteiro
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'),
      JSON.stringify({ plataforma: PLATAFORMA_WIN, travas: { destrutivo: false } }));
    assert.strictEqual(chamarNoPlugin(plugin, dir, 'tb8', 'PowerShell', 'npm test').stdout, '');
    assert.strictEqual(lerSessao(dir, 'tb8'), null);
    // controle positivo: a mesma pasta, ligada, avisa (o calado acima nao e portao quebrado)
    comPlataforma(dir, PLATAFORMA_WIN);
    assert.ok(avisoPermitido(chamarNoPlugin(plugin, dir, 'tb9', 'PowerShell', 'npm test')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

test('fiacao: com a tabela real legivel o portao no win32 passa calado e sem estado (D294)', () => {
  const dir = temp('tabela-real');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    const r = chamar(dir, 'tb10', 'PowerShell', 'npm test');
    assert.strictEqual(r.stdout, '', r.stdout);
    assert.strictEqual(lerSessao(dir, 'tb10'), null);
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

test('fiacao: abertura cita a frente vinculada e o objetivo dela (escopo por frente)', () => {
  const dir = temp('abertura-frente');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'escopos', 'omni.md'),
      '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n');
    const sessoes = path.join(dir, '_sessoes', 'esquadro');
    fs.mkdirSync(sessoes, { recursive: true });
    fs.writeFileSync(path.join(sessoes, 'ab1.json'), JSON.stringify({ frente: 'omni' }), 'utf8');

    const r = rodar('abertura.js', dir, { session_id: 'ab1', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(/vinculada a frente omni/.test(r.stdout), r.stdout);
    assert.ok(r.stdout.includes('.claude/esquadro/escopos/omni.md'), r.stdout);
    assert.ok(r.stdout.includes('fechar a onda 8'), r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: abertura sem vinculo lista as frentes existentes e diz como se vincular', () => {
  const dir = temp('abertura-lista');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'escopos', 'omni.md'),
      '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n');
    escrever(dir, path.join('.claude', 'esquadro', 'escopos', 'tecnica.md'),
      '**Objetivo:** medir a oscilacao\n## Dentro\n- src/b.js\n');

    const r = rodar('abertura.js', dir, { session_id: 'ab2', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('omni'), r.stdout);
    assert.ok(r.stdout.includes('fechar a onda 8'), r.stdout);
    assert.ok(r.stdout.includes('tecnica'), r.stdout);
    assert.ok(r.stdout.includes('medir a oscilacao'), r.stdout);
    assert.ok(/vincula/.test(r.stdout), r.stdout);
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
