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

// F3-20: o estado que nao se grava nao pode calar o aviso. A marca jaAvisou nascia true e so virava
// false se o alterar RODASSE: com o estado fora do ar, o aviso sumia calado. Duplicar e melhor que calar.
test('fiacao: tabela ilegivel com o estado da sessao fora do ar - o aviso sai mesmo assim (F3-20)', () => {
  const plugin = pluginComTabela('{ "quando": ');
  const dir = temp('tabela-sem-estado');
  try {
    comPlataforma(dir, PLATAFORMA_WIN);
    // ESQUADRO_TMP dentro de um ARQUIVO: nenhuma pasta de estado pode ser criada
    const arquivo = path.join(dir, 'e-um-arquivo');
    fs.writeFileSync(arquivo, 'x', 'utf8');
    const r = spawnSync(process.execPath, [path.join(plugin, 'scripts', 'portao-destrutivo.js')], {
      cwd: dir, encoding: 'utf8',
      input: JSON.stringify({ session_id: 'sem-estado', cwd: dir, tool_name: 'PowerShell', tool_input: { command: 'npm test' } }),
      env: Object.assign({}, process.env, { ESQUADRO_TMP: path.join(arquivo, 'dentro') })
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const a = avisoPermitido(r);
    assert.ok(a, 'o estado fora do ar calou o aviso: ' + JSON.stringify(r.stdout));
    assert.ok(a.usuario.includes('shell-win32.json'), a.usuario);
    assert.ok(!motivoNegado(r), 'nada se nega por arquivo estragado');
  } finally {
    fs.rmSync(plugin, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

// D442/5 (S-35, S-68): `"sugerirAprender": "false"` nao desliga (so o booleano decide, D388/D415) e o aviso so
// saia na primeira escrita. Agora a abertura diz, em ASCII; com o booleano certo, calada.
test('D442/5: abertura avisa chave de liga/desliga com valor torto; com booleano, nao', () => {
  const dir = temp('liga-desliga');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), JSON.stringify({ sugerirAprender: 'false', vigia: 1 }));
    const r = rodar('abertura.js', dir, { session_id: 'ld1', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('sugerirAprender tem de ser true ou false'), r.stdout);
    assert.ok(r.stdout.includes('vigia tem de ser true ou false'), r.stdout);
    assert.ok(r.stdout.includes('"false" entre aspas NAO desliga'), r.stdout);
    assert.ok(/^[\x20-\x7E\n]*$/.test(r.stdout.slice(r.stdout.indexOf('ATENCAO - valor'))), 'aviso fora de ASCII');
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), JSON.stringify({ sugerirAprender: false }));
    const ok = rodar('abertura.js', dir, { session_id: 'ld2', cwd: dir, source: 'startup' });
    assert.ok(!/tem de ser true ou false/.test(ok.stdout), ok.stdout);
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

// ------------------------------- qualidade de resposta: a abertura imprime o bloco

const qualidade = require('../scripts/lib/qualidade.js');
const projetoLib = require('../scripts/lib/projeto.js');

const REGRA_Q = 'ao editar -> rodar git status antes';
const TITULO_Q = '# esquadro - qualidade';
const ORIGENS_Q = ['startup', 'resume', 'clear', 'compact'];

/** projeto.json valido (o do proprio init) + uma regra; `extra` entra na raiz do projeto.json. */
function projetoComRegras(dir, extra) {
  const projeto = Object.assign(
    projetoLib.montar({}, { modeloDeAmeaca: 'interno', quemDecide: 'o dono' }), extra || {});
  escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), JSON.stringify(projeto));
  escrever(dir, path.join('.claude', 'esquadro', 'regras.md'), '# Regras\n\n- ' + REGRA_Q + '\n');
}

/** Abertura com a entrada crua no stdin (o `rodar` do arquivo a embrulha em JSON.stringify). */
function abrirComStdinCru(dir, bruto) {
  return spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'abertura.js')], {
    cwd: dir,
    encoding: 'utf8',
    input: bruto,
    env: Object.assign({}, process.env, { ESQUADRO_TMP: path.join(dir, '_sessoes') })
  });
}

const paralelismo = require('../scripts/lib/paralelismo.js');
const TITULO_P = '# esquadro - trabalho em paralelo';

// D451 (0.6.2): o bloco de paralelismo sai antes do de qualidade, e os dois so eles quando nao ha projeto.
test('fiacao: sem projeto.json a abertura imprime o bloco de paralelismo e o de qualidade, e so eles, nas 4 origens', () => {
  for (const origem of ORIGENS_Q) {
    const dir = temp('qualidade-sem-projeto');
    try {
      const r = rodar('abertura.js', dir, { session_id: 'q1-' + origem, cwd: dir, source: origem });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.strictEqual(r.stdout, paralelismo.BLOCO + '\n' + qualidade.BLOCO, origem + ': ' + JSON.stringify(r.stdout));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('fiacao: paralelismo false some so com o bloco de paralelismo; regras e qualidade seguem', () => {
  const dir = temp('paralelismo-desligar');
  try {
    projetoComRegras(dir, { paralelismo: false });
    const r = rodar('abertura.js', dir, { session_id: 'p1', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(TITULO_P), 'o false nao desligou: ' + r.stdout);
    assert.ok(r.stdout.includes(REGRA_Q) && r.stdout.includes(TITULO_Q), r.stdout);
    projetoComRegras(dir);
    const l = rodar('abertura.js', dir, { session_id: 'p2', cwd: dir, source: 'startup' });
    const iR = l.stdout.indexOf(REGRA_Q);
    const iP = l.stdout.indexOf(TITULO_P);
    const iQ = l.stdout.indexOf(TITULO_Q);
    assert.ok(iR !== -1 && iR < iP && iP < iQ, 'ordem: regras, paralelismo, qualidade: ' + l.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: o bloco de qualidade sai DEPOIS das regras do projeto', () => {
  const dir = temp('qualidade-ordem');
  try {
    projetoComRegras(dir);
    const r = rodar('abertura.js', dir, { session_id: 'q2', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    const regra = r.stdout.indexOf(REGRA_Q);
    const bloco = r.stdout.indexOf(TITULO_Q);
    assert.ok(regra !== -1, 'as regras tinham de sair: ' + r.stdout);
    assert.ok(bloco !== -1, 'o bloco tinha de sair: ' + r.stdout);
    assert.ok(regra < bloco, 'as regras vem antes do bloco: ' + r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: qualidadeDeResposta false some com o bloco, e ligado e desligado + o bloco, byte a byte', () => {
  const dir = temp('qualidade-desligar');
  try {
    // Com plano de OUTRA sessao, a abertura tem texto depois das regras: o "resto" a comparar.
    escrever(dir, path.join('.claude', 'esquadro', 'plano-ativo.json'),
      JSON.stringify({ arquivo: 'docs/plano-v9.md', sessionId: 'sessao-do-outro', tarefa: null }));
    for (const origem of ORIGENS_Q) {
      projetoComRegras(dir, { [qualidade.CHAVE]: false });
      const desligado = rodar('abertura.js', dir, { session_id: 'q3d-' + origem, cwd: dir, source: origem });
      assert.strictEqual(desligado.status, 0, desligado.stderr);
      assert.ok(!desligado.stdout.includes(TITULO_Q), origem + ': o false nao desligou: ' + desligado.stdout);
      assert.ok(desligado.stdout.includes(REGRA_Q), origem + ': as regras tinham de sair: ' + desligado.stdout);
      assert.ok(desligado.stdout.includes('outra sessao detem o plano ativo'), origem + ': ' + desligado.stdout);

      projetoComRegras(dir);
      const ligado = rodar('abertura.js', dir, { session_id: 'q3l-' + origem, cwd: dir, source: origem });
      assert.strictEqual(ligado.status, 0, ligado.stderr);

      // i = fim do texto que a reinjecao monta (as regras e, em resume/clear/compact, o ESTADO): e onde o bloco
      // entra. O que vem depois (o aviso do plano de outra sessao) tem de sair igual.
      const i = desligado.stdout.indexOf('\n# esquadro - ATENCAO');
      assert.ok(i > desligado.stdout.indexOf(REGRA_Q), origem + ': nao achei o fim do texto montado: ' + desligado.stdout);
      assert.strictEqual(ligado.stdout,
        desligado.stdout.slice(0, i) + '\n' + qualidade.BLOCO + desligado.stdout.slice(i), origem);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: qualidadeDeResposta com tipo errado ("nao") segue ligado: o bloco sai', () => {
  const dir = temp('qualidade-tipo');
  try {
    projetoComRegras(dir, { [qualidade.CHAVE]: 'nao' });
    const r = rodar('abertura.js', dir, { session_id: 'q4', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(qualidade.BLOCO), r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: projeto.json com JSON quebrado: a abertura sai com 0 e o bloco de qualidade sai', () => {
  const dir = temp('qualidade-json-quebrado');
  try {
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), '{isso nao fecha');
    const r = rodar('abertura.js', dir, { session_id: 'q5', cwd: dir, source: 'startup' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(qualidade.BLOCO), r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: sessao numa subpasta herda o false do projeto acima (e sem o false, o bloco sai)', () => {
  const dir = temp('qualidade-subpasta');
  try {
    fs.mkdirSync(path.join(dir, 'sub', 'fundo'), { recursive: true });
    const sub = path.join(dir, 'sub', 'fundo');

    projetoComRegras(dir, { [qualidade.CHAVE]: false });
    const desligado = rodar('abertura.js', dir, { session_id: 'q6d', cwd: sub, source: 'startup' });
    assert.strictEqual(desligado.status, 0, desligado.stderr);
    assert.ok(desligado.stdout.includes(REGRA_Q), 'a subpasta tinha de achar o projeto acima: ' + desligado.stdout);
    assert.ok(!desligado.stdout.includes(TITULO_Q), 'o false do projeto acima nao valeu: ' + desligado.stdout);

    // controle positivo: a mesma subpasta, projeto sem a chave, o bloco sai
    projetoComRegras(dir);
    const ligado = rodar('abertura.js', dir, { session_id: 'q6l', cwd: sub, source: 'startup' });
    assert.strictEqual(ligado.status, 0, ligado.stderr);
    assert.ok(ligado.stdout.includes(qualidade.BLOCO), ligado.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fiacao: abertura com stdin vazio ou JSON invalido sai com 0 e imprime os blocos de paralelismo e de qualidade', () => {
  for (const [nome, bruto] of [['vazio', ''], ['invalido', '{isso nao e json']]) {
    const dir = temp('qualidade-stdin-' + nome);
    try {
      const r = abrirComStdinCru(dir, bruto);
      assert.strictEqual(r.status, 0, nome + ': ' + r.stderr);
      assert.strictEqual(r.stdout, paralelismo.BLOCO + '\n' + qualidade.BLOCO, nome + ': ' + JSON.stringify(r.stdout));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
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

// ------------------------------- T10-2/T10-3/T10-5 (D357): o marcador conta decisao do dono e commit

const respostas = (obj) => ({ questions: [{ question: 'q' }], answers: obj });

test('T10-2: o marcador escuta o AskUserQuestion (hooks.json)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(RAIZ, 'hooks', 'hooks.json'), 'utf8'));
  const grupo = (hooks.hooks.PostToolUse || []).filter(function (g) {
    return JSON.stringify(g.hooks || []).indexOf('marcar-trabalho.js') !== -1;
  })[0];
  assert.ok(grupo, 'o marcar-trabalho.js saiu do PostToolUse');
  assert.ok(String(grupo.matcher).split('|').indexOf('AskUserQuestion') !== -1,
    'o marcador nao escuta o AskUserQuestion: ' + grupo.matcher);
});

test('T10-2: cada resposta nao vazia do AskUserQuestion soma uma decisao do dono, e perguntar nao e trabalho', () => {
  const dir = temp('decisao');
  try {
    const r1 = rodar('marcar-trabalho.js', dir, { session_id: 'd1', cwd: dir, tool_name: 'AskUserQuestion',
      tool_response: respostas({ 'Qual caminho?': 'a', 'Outra?': 'b', 'Vazia?': '' }) });
    assert.strictEqual(r1.status, 0, r1.stderr);
    const s1 = lerSessao(dir, 'd1');
    assert.strictEqual(s1.decisoesDoDono, 2, 'so as respostas nao vazias contam: ' + JSON.stringify(s1));
    assert.strictEqual(s1.trabalhoReal, undefined, 'perguntar nao e trabalho a provar');
    assert.strictEqual(s1.turnosComTrabalho, undefined, 'perguntar nao conta turno com trabalho');
    assert.strictEqual(s1.buscouNesteTurno, undefined, 'perguntar nao libera criar arquivo');
    // soma na sessao, e a caixa do nome nao muda nada
    rodar('marcar-trabalho.js', dir, { session_id: 'd1', cwd: dir, tool_name: 'askuserquestion',
      tool_response: respostas({ 'Mais uma?': 'c' }) });
    assert.strictEqual(lerSessao(dir, 'd1').decisoesDoDono, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-2: AskUserQuestion sem tool_response, ou sem answers, conta zero e nao estoura', () => {
  const dir = temp('decisao-vazia');
  try {
    const entradas = [
      { tool_name: 'AskUserQuestion' },
      { tool_name: 'AskUserQuestion', tool_response: 'texto solto' },
      { tool_name: 'AskUserQuestion', tool_response: { questions: [] } },
      { tool_name: 'AskUserQuestion', tool_response: { answers: ['a', 'b'] } },
      { tool_name: 'AskUserQuestion', tool_response: { answers: null } }
    ];
    entradas.forEach(function (extra, i) {
      const r = rodar('marcar-trabalho.js', dir, Object.assign({ session_id: 'dv', cwd: dir }, extra));
      assert.strictEqual(r.status, 0, 'entrada ' + i + ': ' + r.stderr);
    });
    const s = lerSessao(dir, 'dv');
    assert.strictEqual(s.decisoesDoDono || 0, 0, JSON.stringify(s));
    assert.strictEqual(s.trabalhoReal, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-3: commit que passou (gitOperation.commit.sha) soma um, em Bash e em PowerShell', () => {
  const dir = temp('commit');
  try {
    const op = { gitOperation: { commit: { sha: '776f7b8', kind: 'committed', branch: 'master' } } };
    for (const f of ['Bash', 'PowerShell']) {
      const id = 'c-' + f;
      const r = rodar('marcar-trabalho.js', dir, { session_id: id, cwd: dir, tool_name: f,
        tool_input: { command: 'git commit -m x' }, tool_response: op });
      assert.strictEqual(r.status, 0, r.stderr);
      const s = lerSessao(dir, id);
      assert.strictEqual(s.commitsFeitos, 1, f + ' nao contou o commit: ' + JSON.stringify(s));
      assert.strictEqual(s.trabalhoReal, true, 'controle: commit segue sendo trabalho real');
    }
    // soma na mesma sessao
    rodar('marcar-trabalho.js', dir, { session_id: 'c-Bash', cwd: dir, tool_name: 'Bash',
      tool_response: op });
    assert.strictEqual(lerSessao(dir, 'c-Bash').commitsFeitos, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-3: sem gitOperation.commit.sha nao conta - e o texto do comando nunca decide', () => {
  const dir = temp('commit-falso');
  try {
    const casos = [
      { tool_input: { command: 'echo "git commit"' } },
      { tool_input: { command: 'git commit -m x' } },
      { tool_input: { command: 'git commit -m x' }, tool_response: {} },
      { tool_input: { command: 'git commit -m x' }, tool_response: { gitOperation: {} } },
      { tool_input: { command: 'git commit -m x' }, tool_response: { gitOperation: { commit: {} } } },
      { tool_input: { command: 'git commit -m x' }, tool_response: { gitOperation: { commit: null } } },
      { tool_input: { command: 'git commit -m x' }, tool_response: 'texto solto' }
    ];
    casos.forEach(function (extra, i) {
      const r = rodar('marcar-trabalho.js', dir, Object.assign({ session_id: 'cf', cwd: dir, tool_name: 'Bash' }, extra));
      assert.strictEqual(r.status, 0, 'caso ' + i + ': ' + r.stderr);
    });
    const s = lerSessao(dir, 'cf');
    assert.strictEqual(s.commitsFeitos || 0, 0, JSON.stringify(s));
    assert.strictEqual(s.trabalhoReal, true, 'controle: o Bash segue sendo trabalho real');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-2/3: os dois contadores sobrevivem ao fecho', () => {
  const dir = temp('contadores-fecho');
  try {
    rodar('marcar-trabalho.js', dir, { session_id: 'cs', cwd: dir, tool_name: 'AskUserQuestion',
      tool_response: respostas({ 'a?': 'x', 'b?': 'y' }) });
    rodar('marcar-trabalho.js', dir, { session_id: 'cs', cwd: dir, tool_name: 'Bash',
      tool_response: { gitOperation: { commit: { sha: 'abc1234' } } } });
    const f = rodar('portao-fecho.js', dir, { session_id: 'cs', cwd: dir, hook_event_name: 'Stop',
      last_assistant_message: 'Anotado.' });
    assert.strictEqual(f.status, 0, f.stderr);
    const s = lerSessao(dir, 'cs');
    assert.strictEqual(s.trabalhoReal, undefined, 'controle: o fecho zerou o turno');
    assert.strictEqual(s.decisoesDoDono, 2, 'a decisao do dono morreu no fecho: ' + JSON.stringify(s));
    assert.strictEqual(s.commitsFeitos, 1, 'o commit morreu no fecho: ' + JSON.stringify(s));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-5: sem /esquadro:init (sem projeto.json) os dois gatilhos disparam com o limiar padrao', () => {
  for (const [nome, quando] of [
    ['decisoes', { tool_name: 'AskUserQuestion', tool_response: respostas({ 'a?': '1', 'b?': '2', 'c?': '3' }) }],
    ['commits', { tool_name: 'Bash', tool_response: { gitOperation: { commit: { sha: 'abc1234' } } } }]
  ]) {
    const dir = temp('sem-init-' + nome);
    try {
      assert.ok(!fs.existsSync(path.join(dir, '.claude')), 'controle: a pasta nao tem .claude');
      const id = 'si-' + nome;
      const vezes = nome === 'commits' ? 3 : 1;
      for (let i = 0; i < vezes; i++) rodar('marcar-trabalho.js', dir, Object.assign({ session_id: id, cwd: dir }, quando));
      rodar('marcar-trabalho.js', dir, { session_id: id, cwd: dir, tool_name: 'Write', tool_input: { file_path: 'a.js' } });
      const f = rodar('portao-fecho.js', dir, { session_id: id, cwd: dir, hook_event_name: 'Stop',
        last_assistant_message: 'Anotado.' });
      assert.strictEqual(f.status, 0, f.stderr);
      const j = JSON.parse(f.stdout);
      const dito = nome === 'commits' ? '3 commits nesta sessao (limiar 3)' : '3 decisoes do dono respondidas (limiar 3)';
      assert.ok(j.systemMessage.indexOf(dito) !== -1, nome + ': ' + f.stdout);
      assert.ok(j.hookSpecificOutput.additionalContext.indexOf(dito) !== -1, nome + ': ' + f.stdout);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

// ------------------------------- T10-4 (D357): perguntar pela saude do contexto dispara na hora

function abrirComPrompt(dir, id, prompt) {
  const r = rodar('abrir-turno.js', dir, { session_id: id, cwd: dir, hook_event_name: 'UserPromptSubmit', prompt: prompt });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test('T10-4: perguntar se o contexto/memoria esta bom devolve additionalContext mandando trocar de chat', () => {
  const dir = temp('pergunta-saude');
  try {
    const positivos = [
      'o contexto está bom?', 'o contexto esta bom?', 'como está a memória?', 'como esta a memoria?',
      'contexto ta cheio?', 'o contexto está cheio?', 'sua memória está ok?', 'esse contexto ainda aguenta?',
      'is the context ok?', 'how is your context?', 'how is your memory?', 'is your context getting full?',
      'how is the context window doing?', 'Contexto está bom??'
    ];
    positivos.forEach(function (p, i) {
      const j = abrirComPrompt(dir, 'ps' + i, p);
      assert.ok(j && j.hookSpecificOutput, 'nao disparou para: ' + p);
      assert.strictEqual(j.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
      const t = j.hookSpecificOutput.additionalContext;
      assert.ok(t.indexOf('/esquadro:handoff') !== -1, 'sem o handoff: ' + t);
      assert.ok(/chat/.test(t) && /mesma resposta/.test(t) && /bloco de codigo/.test(t), 'texto incompleto: ' + t);
      assert.ok(/^[\x20-\x7E\n]+$/.test(t), 'additionalContext tem de ser ASCII: ' + JSON.stringify(t));
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-4: pedido que so cita contexto/memoria sem perguntar pelo estado NAO dispara', () => {
  const dir = temp('pergunta-saude-neg');
  try {
    const negativos = [
      'adicione contexto ao README', 'memory leak no módulo de pagamentos', 'corrija o memory leak',
      'explique o que é context switching', 'mostre a memória usada pelo processo node',
      'implemente o contexto do React para o tema', 'qual o contexto desse erro no stack trace?',
      'add a memory cache to the loader', 'the context menu is broken', 'rode os testes', '',
      'write a memory-safe parser'
    ];
    negativos.forEach(function (p, i) {
      const j = abrirComPrompt(dir, 'pn' + i, p);
      assert.strictEqual(j, null, 'disparou sem dever para: ' + JSON.stringify(p) + ' -> ' + JSON.stringify(j));
    });
    // prompt ausente ou nao-texto nao estoura
    const r = rodar('abrir-turno.js', dir, { session_id: 'pn-x', cwd: dir, prompt: { x: 1 } });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-4: dispara toda vez que a pergunta vier, e continua zerando as marcas do turno', () => {
  const dir = temp('pergunta-saude-sempre');
  try {
    const sessoes = path.join(dir, '_sessoes', 'esquadro');
    fs.mkdirSync(sessoes, { recursive: true });
    fs.writeFileSync(path.join(sessoes, 'pq.json'), JSON.stringify({
      trabalhoReal: true, bloqueouNesteTurno: true, buscouNesteTurno: true, contadores: { comando_destrutivo: 4 }
    }), 'utf8');
    for (let i = 0; i < 2; i++) {
      const j = abrirComPrompt(dir, 'pq', 'o contexto está bom?');
      assert.ok(j && j.hookSpecificOutput, 'pergunta ' + (i + 1) + ' nao disparou');
    }
    const s = lerSessao(dir, 'pq');
    assert.strictEqual(s.trabalhoReal, undefined);
    assert.strictEqual(s.bloqueouNesteTurno, undefined);
    assert.strictEqual(s.buscouNesteTurno, undefined);
    assert.strictEqual(s.contadores.comando_destrutivo, 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('T10-4/T10-5: a pergunta funciona sem /esquadro:init (pasta sem .claude)', () => {
  const dir = temp('pergunta-sem-init');
  try {
    assert.ok(!fs.existsSync(path.join(dir, '.claude')));
    const j = abrirComPrompt(dir, 'psi', 'is the context ok?');
    assert.ok(j && j.hookSpecificOutput && j.hookSpecificOutput.additionalContext.indexOf('/esquadro:handoff') !== -1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------- Bloco A1 (D426): corrigir o agente sugere virar regra (/esquadro:aprender)

test('A1: prompt que corrige o agente devolve additionalContext oferecendo /esquadro:aprender, sem gravar nada', () => {
  const dir = temp('correcao');
  try {
    assert.ok(!fs.existsSync(path.join(dir, '.claude')), 'controle: a pasta nao tem .claude (vale sem init)');
    const j = abrirComPrompt(dir, 'co1', 'eu já te disse para não usar sed -i');
    assert.ok(j && j.hookSpecificOutput, 'nao disparou');
    assert.strictEqual(j.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    const t = j.hookSpecificOutput.additionalContext;
    assert.ok(t.indexOf('/esquadro:aprender') !== -1 && /uma linha/.test(t) && /relato de bug/.test(t), t);
    assert.ok(/^[\x20-\x7E\n]+$/.test(t), 'additionalContext tem de ser ASCII: ' + JSON.stringify(t));
    assert.ok(!fs.existsSync(path.join(dir, '.claude')), 'o gancho nao pode criar nada no projeto');
    // relato de bug e resposta a pergunta seguem calados (e nao gastam a janela da sugestao)
    assert.strictEqual(abrirComPrompt(dir, 'co2', 'o botão para de funcionar'), null);
    assert.strictEqual(abrirComPrompt(dir, 'co3', 'não, pode seguir'), null);
    assert.strictEqual(lerSessao(dir, 'co2').esperaAprender, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('A1: no maximo 1 sugestao a cada 5 turnos por sessao - todo prompt conta como turno', () => {
  const dir = temp('correcao-limite');
  try {
    const quando = [];
    // turno: [prompt, deveSugerir]. Sugeriu no 1: o 2 ao 5 ficam calados; o 6 pode; o 7 ao 10 calados; o 11 pode.
    const roteiro = [
      ['já te disse isso', true],          // 1: sugere
      ['nunca mais faça isso', false],     // 2: janela
      ['adicione um teste', false],        // 3: nao e correcao, mas conta como turno
      ['você errou', false],               // 4
      ['pare de inventar teste', false],   // 5: ainda dentro dos 5 turnos
      ['não foi isso que eu pedi', true],  // 6: janela passou, sugere de novo
      ['rode os testes', false],           // 7
      ['rode os testes de novo', false],   // 8
      ['segue', false],                    // 9
      ['segue', false],                    // 10
      ['eu já te falei', true],            // 11: 5 turnos depois do 6
      ['eu já te falei', false]            // 12: janela de novo
    ];
    roteiro.forEach(function (par, i) {
      const j = abrirComPrompt(dir, 'col', par[0]);
      quando.push(j ? i + 1 : 0);
      assert.strictEqual(!!j, par[1], 'turno ' + (i + 1) + ' (' + par[0] + '): ' + JSON.stringify(j));
    });
    assert.deepStrictEqual(quando.filter(Boolean), [1, 6, 11]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('A1: a janela da sugestao sobrevive ao fecho do turno (e campo da sessao, nao do turno)', () => {
  const dir = temp('correcao-fecho');
  try {
    assert.ok(abrirComPrompt(dir, 'cof', 'já te disse'), 'nao disparou');
    const f = rodar('portao-fecho.js', dir, { session_id: 'cof', cwd: dir, hook_event_name: 'Stop',
      last_assistant_message: 'Anotado.' });
    assert.strictEqual(f.status, 0, f.stderr);
    assert.ok(lerSessao(dir, 'cof').esperaAprender > 0, 'o fecho apagou a janela: ' + JSON.stringify(lerSessao(dir, 'cof')));
    assert.strictEqual(abrirComPrompt(dir, 'cof', 'você errou'), null, 'sugeriu dentro da janela');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('A1: sugerirAprender: false desliga; ausente ou outro valor segue ligado', () => {
  const dir = temp('correcao-chave');
  try {
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({ sugerirAprender: false }));
    assert.strictEqual(abrirComPrompt(dir, 'cc1', 'já te disse'), null, 'disparou com a chave desligada');
    assert.strictEqual(lerSessao(dir, 'cc1').esperaAprender, undefined, 'desligado nao abre janela');
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({}));
    assert.ok(abrirComPrompt(dir, 'cc2', 'já te disse'), 'sem a chave tem de estar ligado');
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({ sugerirAprender: 'nao' }));
    assert.ok(abrirComPrompt(dir, 'cc3', 'já te disse'), 'so false desliga');
    // projeto.json ilegivel: ligado (falha aberta), nao estoura
    escrever(dir, '.claude/esquadro/projeto.json', '{ quebrado');
    assert.ok(abrirComPrompt(dir, 'cc4', 'já te disse'), 'projeto.json ilegivel tem de seguir ligado');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('A1: saude e correcao no mesmo prompt viram UM additionalContext com os dois textos; a janela so segura a correcao', () => {
  const dir = temp('correcao-e-saude');
  try {
    const j = abrirComPrompt(dir, 'cs', 'o contexto está bom? eu já te disse para colar o prompt');
    const t = j.hookSpecificOutput.additionalContext;
    assert.ok(t.indexOf('/esquadro:handoff') !== -1 && t.indexOf('/esquadro:aprender') !== -1, t);
    // dentro da janela a pergunta de saude segue respondendo sozinha, sem o texto da correcao
    const k = abrirComPrompt(dir, 'cs', 'o contexto está bom? você errou');
    const u = k.hookSpecificOutput.additionalContext;
    assert.ok(u.indexOf('/esquadro:handoff') !== -1 && u.indexOf('/esquadro:aprender') === -1, u);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------- Bloco A2 (D426): a auditoria roda sozinha na abertura, de N em N dias

/** Projeto com a fonte canonica estourando o teto de 200 itens (205), para a auditoria ter o que avisar. */
function projetoComPesoEstourado(dir, extra) {
  const itens = [];
  for (let i = 0; i < 205; i++) itens.push('- item ' + i);
  escrever(dir, 'DOC.md', itens.join('\n') + '\n');
  escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify(Object.assign({ fontesCanonicas: ['DOC.md'] }, extra || {})));
}

function abrirA2(dir, id) {
  return rodar('abertura.js', dir, { session_id: id, cwd: dir, source: 'startup' });
}

const MARCA_A2 = path.join('.claude', 'esquadro', 'auditoria.json');

test('A2: a abertura avisa o peso estourado quando a auditoria esta vencida, e a 2a abertura dentro do prazo fica calada', () => {
  const dir = temp('a2-vencida');
  try {
    projetoComPesoEstourado(dir);
    assert.ok(!fs.existsSync(path.join(dir, MARCA_A2)), 'controle: sem marca no comeco');
    const r1 = abrirA2(dir, 'a2-1');
    assert.strictEqual(r1.status, 0, r1.stderr);
    assert.ok(/esquadro: auditoria automatica \(a cada 7 dias\):/.test(r1.stdout), r1.stdout);
    assert.ok(/peso de instrucao 205 acima do teto 200/.test(r1.stdout), r1.stdout);
    assert.ok(/\/esquadro:auditar/.test(r1.stdout) && r1.stdout.indexOf('"auditarNaAbertura": false') !== -1, r1.stdout);
    assert.ok(/qualidade de resposta/.test(r1.stdout), 'o resto da abertura sumiu: ' + r1.stdout);
    const marca = JSON.parse(fs.readFileSync(path.join(dir, MARCA_A2), 'utf8'));
    assert.ok(Math.abs(Date.now() - Date.parse(marca.ultima)) < 60000, JSON.stringify(marca));
    const r2 = abrirA2(dir, 'a2-2');
    assert.strictEqual(r2.status, 0, r2.stderr);
    assert.strictEqual(r2.stdout.indexOf('auditoria automatica'), -1, 'avisou dentro do prazo: ' + r2.stdout);
    assert.ok(/qualidade de resposta/.test(r2.stdout), 'o resto da abertura sumiu');
    // marca de 8 dias atras: vence de novo
    fs.writeFileSync(path.join(dir, MARCA_A2), JSON.stringify({ ultima: new Date(Date.now() - 8 * 86400000).toISOString() }));
    assert.ok(/auditoria automatica/.test(abrirA2(dir, 'a2-3').stdout), 'marca velha nao reabriu a auditoria');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('A2: abertura com tudo dentro do teto fica calada e mesmo assim grava a marca', () => {
  const dir = temp('a2-ok');
  try {
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({}));
    const r = abrirA2(dir, 'a2ok');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.indexOf('auditoria automatica'), -1, r.stdout);
    assert.ok(fs.existsSync(path.join(dir, MARCA_A2)), 'nao gravou a marca');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('A2: auditarNaAbertura: false desliga (sem aviso, sem marca); sem projeto.json nao audita nem cria .claude', () => {
  const dir = temp('a2-off');
  const sem = temp('a2-sem');
  try {
    projetoComPesoEstourado(dir, { auditarNaAbertura: false });
    const r = abrirA2(dir, 'a2off');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.indexOf('auditoria automatica'), -1, r.stdout);
    assert.ok(!fs.existsSync(path.join(dir, MARCA_A2)), 'desligado nao grava marca');
    const s = abrirA2(sem, 'a2sem');
    assert.strictEqual(s.status, 0, s.stderr);
    assert.strictEqual(s.stdout.indexOf('auditoria automatica'), -1, s.stdout);
    assert.ok(!fs.existsSync(path.join(sem, '.claude')), 'a abertura criou .claude num projeto sem configuracao');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sem, { recursive: true, force: true });
  }
});

test('A2: auditoria que lanca nao derruba a abertura - o resto do stdout sai, 1 linha de aviso, marca gravada', () => {
  const dir = temp('a2-lanca');
  try {
    // fonte canonica que nao e texto: path.resolve lanca TypeError dentro de instrucoes.contar, so na auditoria
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({ fontesCanonicas: [123] }));
    const r = abrirA2(dir, 'a2lanca');
    assert.strictEqual(r.status, 0, r.stderr);
    const linhas = r.stdout.split('\n').filter(function (l) { return l.indexOf('auditoria automatica falhou') !== -1; });
    assert.strictEqual(linhas.length, 1, r.stdout);
    assert.ok(/rode \/esquadro:auditar/.test(linhas[0]), linhas[0]);
    assert.ok(/qualidade de resposta/.test(r.stdout), 'o resto da abertura sumiu: ' + r.stdout);
    assert.ok(fs.existsSync(path.join(dir, MARCA_A2)), 'falha nao gravou a marca (repetiria a cada abertura)');
    assert.strictEqual(abrirA2(dir, 'a2lanca2').stdout.indexOf('auditoria automatica'), -1, 'repetiu a falha dentro do prazo');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ----------------------------------------------- S8 (D426): abertura em copia do plugin

/** Copia scripts/ e modelos/ para <pasta temporaria>/<nome>; `nome` pode ter `$` e crase (caminho de instalacao esquisito). */
function pluginCopia(nome) {
  const base = path.join(temp('plugin-copia'), nome);
  fs.cpSync(path.join(RAIZ, 'scripts'), path.join(base, 'scripts'), { recursive: true });
  fs.cpSync(path.join(RAIZ, 'modelos'), path.join(base, 'modelos'), { recursive: true });
  return base;
}

function limparCopia(base) { fs.rmSync(path.dirname(base), { recursive: true, force: true }); }

function projetoComPlanoDeOutro(dir) {
  escrever(dir, path.join('.claude', 'esquadro', 'plano-ativo.json'),
    JSON.stringify({ arquivo: 'docs/plano-v9.md', sessionId: 'sessao-do-outro', tarefa: null }));
}

/** O comando `node ... --proxima-decisao` que a abertura entrega ao agente: tudo entre `node ` e ` --proxima-decisao`. */
function comandoDoPlano(stdout) {
  const m = /^ {2}node (.+) --proxima-decisao/m.exec(stdout);
  assert.ok(m, 'faltou o comando do numero de decisao: ' + stdout);
  return m[1];
}

test('S8 L2-abe-1: o caminho de plano.js que a abertura entrega ao agente vai entre aspas que o shell nao reinterpreta', () => {
  const esquisito = pluginCopia('a$b`c');
  const normal = pluginCopia('instalacao normal');
  const dir = temp('abe1');
  try {
    projetoComPlanoDeOutro(dir);
    const e = rodarNoPlugin(esquisito, 'abertura.js', dir, { session_id: 'abe1e', cwd: dir, source: 'startup' });
    // `$b` e a crase dentro de aspas duplas o shell expandiria/executaria: aspas simples nao
    assert.strictEqual(comandoDoPlano(e.stdout), "'" + path.join(esquisito, 'scripts', 'plano.js') + "'", e.stdout);
    // controle: caminho comum segue entre aspas duplas, como sempre (o caso normal nao muda)
    const n = rodarNoPlugin(normal, 'abertura.js', dir, { session_id: 'abe1n', cwd: dir, source: 'startup' });
    assert.strictEqual(comandoDoPlano(n.stdout), '"' + path.join(normal, 'scripts', 'plano.js') + '"', n.stdout);
  } finally {
    limparCopia(esquisito); limparCopia(normal);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('S8 A2-3: falha do require da auditoria nao calada: 1 linha diz que nao rodou, e o resto da abertura sai', () => {
  const plugin = pluginCopia('plugin');
  const dir = temp('a23');
  try {
    fs.writeFileSync(path.join(plugin, 'scripts', 'lib', 'auditoria-periodica.js'), 'module.exports = {{ ;\n', 'utf8');
    projetoComRegras(dir);
    projetoComPlanoDeOutro(dir);
    const r = rodarNoPlugin(plugin, 'abertura.js', dir, { session_id: 'a23', cwd: dir, source: 'startup' });
    const linhas = r.stdout.split('\n').filter(function (l) { return l.indexOf('auditoria automatica nao rodou') !== -1; });
    assert.strictEqual(linhas.length, 1, r.stdout);
    assert.ok(/SyntaxError/.test(linhas[0]), 'a linha diz a causa: ' + linhas[0]);
    assert.ok(r.stdout.includes(qualidade.BLOCO), 'o resto da abertura sumiu: ' + r.stdout);
    assert.ok(/outra sessao detem o plano ativo/i.test(r.stdout), 'o plano (depois da auditoria) sumiu: ' + r.stdout);
    // controle: com a auditoria sem defeito (plugin inteiro) essa linha nao sai
    const ok = rodar('abertura.js', dir, { session_id: 'a23ok', cwd: dir, source: 'startup' });
    assert.ok(!/nao rodou/.test(ok.stdout), 'aviso indevido com a auditoria sem defeito: ' + ok.stdout);
  } finally { limparCopia(plugin); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('S8 A2-4: o aviso de projeto.json ilegivel sai uma vez so, mesmo se a reinjecao mudar a frase dela', () => {
  const plugin = pluginCopia('plugin');
  const dir = temp('a24');
  try {
    const arq = path.join(plugin, 'scripts', 'lib', 'reinjecao.js');
    const original = fs.readFileSync(arq, 'utf8');
    const reescrito = original.replace('existe mas nao se le (', 'ficou ilegivel (');
    assert.notStrictEqual(reescrito, original, 'a frase da reinjecao mudou de lugar: ajuste o teste');
    fs.writeFileSync(arq, reescrito, 'utf8');
    const avisos = function (stdout) { return (stdout.match(/projeto\.json (existe mas nao se le|ficou ilegivel)/g) || []).length; };
    escrever(dir, path.join('.claude', 'esquadro', 'projeto.json'), '{isso nao fecha');

    // com regras: a reinjecao ja avisou (com a frase reescrita); a abertura nao dobra
    escrever(dir, path.join('.claude', 'esquadro', 'regras.md'), '# Regras\n\n- ' + REGRA_Q + '\n');
    const com = rodarNoPlugin(plugin, 'abertura.js', dir, { session_id: 'a24c', cwd: dir, source: 'startup' });
    assert.ok(/ficou ilegivel/.test(com.stdout), 'controle: a reinjecao tinha de avisar: ' + com.stdout);
    assert.strictEqual(avisos(com.stdout), 1, com.stdout);

    // controle positivo: regras.md sem nenhuma regra -> a reinjecao nao avisa, a abertura avisa (nunca calado)
    escrever(dir, path.join('.claude', 'esquadro', 'regras.md'), '# Regras\n\nsem itens aqui\n');
    const vazio = rodarNoPlugin(plugin, 'abertura.js', dir, { session_id: 'a24v', cwd: dir, source: 'startup' });
    assert.strictEqual(avisos(vazio.stdout), 1, vazio.stdout);
    assert.ok(/DESLIGADOS/.test(vazio.stdout), vazio.stdout);

    // e sem regras.md nenhum
    fs.rmSync(path.join(dir, '.claude', 'esquadro', 'regras.md'));
    const sem = rodarNoPlugin(plugin, 'abertura.js', dir, { session_id: 'a24s', cwd: dir, source: 'startup' });
    assert.strictEqual(avisos(sem.stdout), 1, sem.stdout);
  } finally { limparCopia(plugin); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------ Bloco V (D426/D437): a novidade do vigia na abertura

/** Abertura com a pasta do vigia injetada por ESQUADRO_VIGIA (o `rodar` comum nao passa env extra). */
function abrirVigia(dir, id, pastaVigia) {
  return spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'abertura.js')], {
    cwd: dir,
    encoding: 'utf8',
    input: JSON.stringify({ session_id: id, cwd: dir, source: 'startup' }),
    env: Object.assign({}, process.env, { ESQUADRO_TMP: path.join(dir, '_sessoes'), ESQUADRO_VIGIA: pastaVigia })
  });
}

test('V: com "vigia": true a abertura mostra a novidade da semana uma vez, e o resto da abertura segue', () => {
  const dir = temp('vigia-liga');
  const pastaVigia = temp('vigia-pasta');
  try {
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({ vigia: true }));
    escrever(pastaVigia, 'novidades.md', 'semana: 2026-10-05\n\n- Cart\u00e3o novo da semana\n');
    const r1 = abrirVigia(dir, 'v1', pastaVigia);
    assert.strictEqual(r1.status, 0, r1.stderr);
    assert.ok(r1.stdout.indexOf('novidade da semana de 2026-10-05') !== -1, r1.stdout);
    assert.ok(r1.stdout.indexOf('- Cartao novo da semana') !== -1, r1.stdout);
    assert.ok(/qualidade de resposta/.test(r1.stdout), 'o resto da abertura sumiu: ' + r1.stdout);
    assert.ok(fs.existsSync(path.join(pastaVigia, 'visto.json')), 'nao marcou como vista');
    const r2 = abrirVigia(dir, 'v2', pastaVigia);
    assert.strictEqual(r2.status, 0, r2.stderr);
    assert.strictEqual(r2.stdout.indexOf('novidade da semana de'), -1, 'mostrou a mesma semana duas vezes: ' + r2.stdout);
    assert.ok(/qualidade de resposta/.test(r2.stdout), 'o resto da abertura sumiu');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(pastaVigia, { recursive: true, force: true });
  }
});

test('V: sem a chave (ou com vigia: false) a abertura nao fala do vigia e nao cria a pasta', () => {
  const dir = temp('vigia-desliga');
  const base = temp('vigia-base');
  const pastaVigia = path.join(base, 'ainda-nao-existe');
  try {
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({}));
    const r = abrirVigia(dir, 'v-off', pastaVigia);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.indexOf('vigia'), -1, r.stdout);
    assert.ok(!fs.existsSync(pastaVigia), 'a abertura criou a pasta do vigia sem opt-in');
    escrever(dir, '.claude/esquadro/projeto.json', JSON.stringify({ vigia: false }));
    const f = abrirVigia(dir, 'v-false', pastaVigia);
    assert.strictEqual(f.stdout.indexOf('vigia'), -1, f.stdout);
    assert.ok(!fs.existsSync(pastaVigia));
    // sem projeto.json nenhum: o mesmo
    const sem = temp('vigia-sem-projeto');
    try {
      const s = abrirVigia(sem, 'v-sem', pastaVigia);
      assert.strictEqual(s.stdout.indexOf('vigia'), -1, s.stdout);
      assert.ok(!fs.existsSync(pastaVigia));
    } finally { fs.rmSync(sem, { recursive: true, force: true }); }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(base, { recursive: true, force: true });
  }
});
