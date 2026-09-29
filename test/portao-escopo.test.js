'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

function rodar(entrada, tmp) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'portao-escopo.js')], {
    input: JSON.stringify(entrada),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { ESQUADRO_TMP: tmp })
  });
  let json = null;
  if (r.stdout && r.stdout.trim()) { try { json = JSON.parse(r.stdout); } catch (e) { json = null; } }
  return { status: r.status, json: json, stderr: r.stderr };
}

function negou(r) {
  return !!(r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision === 'deny');
}

/**
 * D37: liberacao POR DECISAO, nao por inercia. Um portao que estourou tambem
 * devolve "nao negou" - a diferenca esta no exit code e no rastro que blindar()
 * deixa no stderr.
 */
function liberou(r) {
  assert.strictEqual(r.status, 0, 'o portao tem de sair com 0 (R6). stderr: ' + r.stderr);
  assert.ok(!/portao falhou/.test(r.stderr || ''),
    'o portao caiu e liberou por inercia, nao por decisao: ' + r.stderr);
  assert.strictEqual(negou(r), false);
}

function montarProjeto(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  const projeto = Object.assign({
    versaoConfig: 1,
    marchaPadrao: 'padrao',
    intocaveis: ['segredos/**'],
    marchas: { aaa: ['**/auth/**'], padrao: ['src/**'], rapida: ['docs/**', '**/*.md'] }
  }, extra || {});
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'), JSON.stringify(projeto), 'utf8');
  return dir;
}

function escrever(dir, rel, conteudo) {
  const alvo = path.join(dir, rel);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, conteudo, 'utf8');
  return alvo;
}

function entrada(dir, arquivo, tmpSessao) {
  return {
    session_id: 's1', cwd: dir, hook_event_name: 'PreToolUse',
    tool_name: 'Write', tool_input: { file_path: path.join(dir, arquivo) }
  };
}

function comTmp(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-esc-'));
  try { fn(base); } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

test('portao-escopo: marcha rapida nao exige escopo', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    const r = rodar(entrada(dir, 'docs/nota.md'), tmp);
    liberou(r);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: marcha padrao sem escopo.md e negada', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    const r = rodar(entrada(dir, 'src/a.js'), tmp);
    assert.strictEqual(negou(r), true);
    assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.includes('escopo.md'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: arquivo dentro do escopo declarado passa', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/a.js\n## Fora de escopo\n- o resto');
    const r = rodar(entrada(dir, 'src/a.js'), tmp);
    liberou(r);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: arquivo FORA do escopo declarado e negado (C8)', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/a.js\n## Fora de escopo\n- o resto');
    const r = rodar(entrada(dir, 'src/b.js'), tmp);
    assert.strictEqual(negou(r), true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: intocavel e negado mesmo estando no escopo (C10)', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- segredos/**\n');
    const r = rodar(entrada(dir, 'segredos/chave.env'), tmp);
    assert.strictEqual(negou(r), true);
    assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.includes('intocavel'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D35: o escopo.md passa pelo passe livre (fixture que discrimina)', () => {
  comTmp((tmp) => {
    // Fixture em que SO o passe livre pode liberar o escopo.md: marcha padrao
    // exige escopo ('**' casa tudo) e nao ha 'rapida' nem passe livre de sobra
    // para o teste passar por outro caminho que nao o que ele diz cobrir.
    const dir = montarProjeto({ marchas: { aaa: [], padrao: ['**'], rapida: [] } });
    const r = rodar(entrada(dir, '.claude/esquadro/escopo.md'), tmp);
    liberou(r);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D35: projeto.json NAO tem passe livre - cai na regra normal', () => {
  comTmp((tmp) => {
    const dir = montarProjeto({ marchas: { aaa: [], padrao: ['**'], rapida: [] } });
    const r = rodar(entrada(dir, '.claude/esquadro/projeto.json'), tmp);
    assert.strictEqual(negou(r), true);
    // F9: 'escopo.md' aparece em QUALQUER motivoSemEscopo, para qualquer alvo - nao
    // discrimina nada. 'projeto.json' e o alvo de verdade interpolado na mensagem.
    assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.includes('projeto.json'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D35: contadores.json NAO tem passe livre', () => {
  comTmp((tmp) => {
    const dir = montarProjeto({ marchas: { aaa: [], padrao: ['**'], rapida: [] } });
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/a.js\n');
    const r = rodar(entrada(dir, '.claude/esquadro/contadores.json'), tmp);
    assert.strictEqual(negou(r), true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: reescrever escopo.md que ja existe conta ampliacao (desenho §5)', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/a.js\n');
    rodar(entrada(dir, '.claude/esquadro/escopo.md'), tmp);
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    const estado = require('../scripts/lib/estado.js');
    assert.strictEqual(estado.ler('s1').contadores.escopo_ampliado, 1);
    delete process.env.ESQUADRO_TMP;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D34: criar escopo.md do zero ja conta ampliacao', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    // sem escopo.md no disco: a CRIACAO e que tem de ser contada, nao so a reescrita.
    const r = rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopo.md'), content: '## Dentro\n- **\n' }
    }, tmp);
    liberou(r);
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    const estado = require('../scripts/lib/estado.js');
    assert.strictEqual(estado.ler('s1').contadores.escopo_ampliado, 1);
    delete process.env.ESQUADRO_TMP;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D34: encolher o escopo NAO conta ampliacao', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/**\n- test/**\n');

    // F10: semeia um contador de outra trava ANTES do cenario, para o estado da
    // sessao existir de verdade. Sem isto, "contadores ausente" podia significar
    // tanto "nao ampliou" quanto "o estado nunca foi escrito" - a asserção provava
    // a coisa errada por acidente.
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    require('../scripts/lib/estado.js').incrementar('s1', 'sem_escopo');
    delete process.env.ESQUADRO_TMP;

    const r = rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopo.md'), content: '## Dentro\n- src/**\n' }
    }, tmp);
    liberou(r);
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    const estado = require('../scripts/lib/estado.js');
    const s = estado.ler('s1');
    assert.ok(s.contadores, 'o estado precisa existir de verdade (foi semeado antes do cenario)');
    assert.strictEqual(s.contadores.escopo_ampliado, undefined, 'encolher nao pode contar como ampliacao');
    delete process.env.ESQUADRO_TMP;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D38: escopo.md com caixa trocada nao escapa do passe livre', () => {
  comTmp((tmp) => {
    // config canonica do plano (default de montarProjeto): rapida inclui '**/*.md',
    // que e onde a burla de 1 caractere funciona (Escopo.md cairia em marcha rapida
    // e sairia sem negacao, sem aviso e sem contagem, se a comparacao fosse sensivel a caixa).
    const dir = montarProjeto();
    const r = rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'Escopo.md'), content: '## Dentro\n- **\n' }
    }, tmp);
    liberou(r);
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    const estado = require('../scripts/lib/estado.js');
    assert.strictEqual(estado.ler('s1').contadores.escopo_ampliado, 1,
      'a burla de caixa tem de ser contada, nunca invisivel');
    delete process.env.ESQUADRO_TMP;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: projeto sem projeto.json libera e avisa uma vez so', () => {
  comTmp((tmp) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-cru-'));
    const primeiro = rodar(entrada(dir, 'src/a.js'), tmp);
    const segundo = rodar(entrada(dir, 'src/b.js'), tmp);
    assert.strictEqual(negou(primeiro), false);
    assert.ok(primeiro.json && primeiro.json.systemMessage.includes('/esquadro:init'));
    assert.strictEqual(segundo.json, null, 'nao repete o aviso');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo: arquivo fora do projeto nao e assunto do portao', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    const r = rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(os.tmpdir(), 'longe.txt') }
    }, tmp);
    liberou(r);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('portao-escopo D37: entrada hostil faz o portao LIBERAR, nunca travar (R6)', () => {
  comTmp((tmp) => {
    // cwd numerico faz path.resolve estourar dentro do callback assincrono:
    // e exatamente o caminho que blindar() precisa cobrir.
    const hostil = rodar({
      session_id: 's1', cwd: 42, tool_name: 'Write',
      tool_input: { file_path: 'src/a.js' }
    }, tmp);
    assert.strictEqual(hostil.status, 0, 'R6: portao que falha nao pode travar a sessao');
    assert.strictEqual(negou(hostil), false, 'R6: portao que falha tem de LIBERAR');
    // F7: prova que a entrada REALMENTE estourou (nao so que o resultado parece "liberou").
    // Sem isto, se a entrada um dia parar de ser hostil, o teste continua verde sem
    // exercitar o caminho de falha nenhuma vez - exatamente o que este projeto existe para pegar.
    assert.ok(/portao falhou/.test(hostil.stderr || ''),
      'a entrada precisa ser mesmo hostil: sem estouro, este teste nao prova o R6');
  });
});

// D244/defeito 7 (D241 secao 2.7): a secao "Fora" era lida e nenhum portao a consultava.
test('D244/defeito 7: arquivo declarado Fora e negado mesmo casando Dentro', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md',
      '# Escopo\r\n**Objetivo:** x\r\n## Dentro\r\n- src/**\r\n## Fora de escopo\r\n- src/legado/** (nao mexer)\r\n');
    escrever(dir, 'src/legado/x.js', 'velho');
    escrever(dir, 'src/novo.js', 'velho');
    const r = rodar(entrada(dir, 'src/legado/x.js'), tmp);
    assert.ok(negou(r), 'src/legado/x.js foi declarado Fora e passou');
    assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.includes('src/legado/**'));
    liberou(rodar(entrada(dir, 'src/novo.js'), tmp));
  });
});

test('D244/defeito 7: Fora vale tambem em marcha rapida', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/a.js\n## Fora de escopo\n- docs/ata.md\n');
    escrever(dir, 'docs/ata.md', 'velho');
    assert.ok(negou(rodar(entrada(dir, 'docs/ata.md'), tmp)));
  });
});

test('D244/defeito 7: a abertura avisa que o escopo e herdado, com objetivo e data', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '# Escopo\n**Objetivo:** fechar a tarefa antiga\n## Dentro\n- src/a.js\n');
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'abertura.js')], {
      input: JSON.stringify({ session_id: 'her', cwd: dir, source: 'startup' }),
      encoding: 'utf8', env: Object.assign({}, process.env, { ESQUADRO_TMP: tmp })
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /escopo herdado/);
    assert.match(r.stdout, /fechar a tarefa antiga/);
    assert.match(r.stdout, /\d{4}-\d{2}-\d{2}/);
  });
});

test('D244/defeito 7: sem escopo.md, a abertura nao fala de heranca', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'abertura.js')], {
      input: JSON.stringify({ session_id: 'her2', cwd: dir, source: 'startup' }),
      encoding: 'utf8', env: Object.assign({}, process.env, { ESQUADRO_TMP: tmp })
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /escopo herdado/);
  });
});

// ---------------------------------------------------- escopo por frente

function lerEstado(tmp, sessionId) {
  process.env.ESQUADRO_TMP = tmp;
  delete require.cache[require.resolve('../scripts/lib/estado.js')];
  const estado = require('../scripts/lib/estado.js');
  const s = estado.ler(sessionId);
  delete process.env.ESQUADRO_TMP;
  return s;
}

test('escopo por frente: Write em escopos/omni.md libera sem escopo previo e grava a frente no estado', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    const r = rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopos', 'omni.md'), content: '## Dentro\n- src/a.js\n' }
    }, tmp);
    liberou(r);
    assert.strictEqual(lerEstado(tmp, 's1').frente, 'omni');

    escrever(dir, '.claude/esquadro/escopos/omni.md', '## Dentro\n- src/a.js\n');
    liberou(rodar(entrada(dir, 'src/a.js'), tmp));
    const fora = rodar(entrada(dir, 'src/b.js'), tmp);
    assert.strictEqual(negou(fora), true);
    assert.ok(fora.json.hookSpecificOutput.permissionDecisionReason.includes('.claude/esquadro/escopos/omni.md'),
      fora.json.hookSpecificOutput.permissionDecisionReason);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('escopo por frente: ampliar o Dentro do arquivo da frente conta escopo_ampliado, encolher nao', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopos/omni.md', '## Dentro\n- src/a.js\n');
    liberou(rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopos', 'omni.md'), content: '## Dentro\n- src/a.js\n- src/b.js\n' }
    }, tmp));
    assert.strictEqual(lerEstado(tmp, 's1').contadores.escopo_ampliado, 1);

    // controle: encolher o Dentro nao pode contar como ampliacao (mesmo desenho do escopo.md)
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    require('../scripts/lib/estado.js').incrementar('s2', 'sem_escopo');
    delete process.env.ESQUADRO_TMP;
    escrever(dir, '.claude/esquadro/escopos/outra.md', '## Dentro\n- src/c.js\n- src/d.js\n');
    liberou(rodar({
      session_id: 's2', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopos', 'outra.md'), content: '## Dentro\n- src/c.js\n' }
    }, tmp));
    const s2 = lerEstado(tmp, 's2');
    assert.ok(s2.contadores, 'o estado precisa existir de verdade');
    assert.strictEqual(s2.contadores.escopo_ampliado, undefined, 'encolher nao pode contar como ampliacao');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('escopo por frente: sessao sem vinculo continua regida pelo escopo.md de hoje', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/geral.js\n');
    escrever(dir, '.claude/esquadro/escopos/omni.md', '## Dentro\n- src/a.js\n');
    const semVinculo = rodar({
      session_id: 'sv1', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'a.js') }
    }, tmp);
    assert.strictEqual(negou(semVinculo), true, 'arquivo so listado na frente nao pode passar sem vinculo');
    liberou(rodar({
      session_id: 'sv1', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'geral.js') }
    }, tmp));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('escopo por frente: duas frentes simultaneas nao se liberam uma a outra', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    // os arquivos das duas frentes precisam existir DE VERDADE no disco: o
    // portao so simula a escrita que esta acontecendo agora (a do proprio
    // arquivo de frente), nao o resultado dela - por isso escreve-se antes.
    escrever(dir, '.claude/esquadro/escopos/a.md', '## Dentro\n- src/so-a.js\n');
    escrever(dir, '.claude/esquadro/escopos/b.md', '## Dentro\n- src/so-b.js\n');
    liberou(rodar({
      session_id: 'sA', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopos', 'a.md'), content: '## Dentro\n- src/so-a.js\n' }
    }, tmp));
    liberou(rodar({
      session_id: 'sB', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopos', 'b.md'), content: '## Dentro\n- src/so-b.js\n' }
    }, tmp));
    assert.strictEqual(lerEstado(tmp, 'sA').frente, 'a');
    assert.strictEqual(lerEstado(tmp, 'sB').frente, 'b');

    const aTentaB = rodar({
      session_id: 'sA', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'so-b.js') }
    }, tmp);
    assert.strictEqual(negou(aTentaB), true, 'a sessao A nao pode gravar o que so a frente B libera');
    assert.ok(aTentaB.json.hookSpecificOutput.permissionDecisionReason.includes('.claude/esquadro/escopos/a.md'),
      aTentaB.json.hookSpecificOutput.permissionDecisionReason);
    const bTentaA = rodar({
      session_id: 'sB', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'so-a.js') }
    }, tmp);
    assert.strictEqual(negou(bTentaA), true, 'a sessao B nao pode gravar o que so a frente A libera');

    liberou(rodar({
      session_id: 'sA', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'so-a.js') }
    }, tmp));
    liberou(rodar({
      session_id: 'sB', cwd: dir, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'so-b.js') }
    }, tmp));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('escopo por frente: frente aposentada (arquivo movido para fora de escopos/) volta a valer o escopo.md', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    escrever(dir, '.claude/esquadro/escopo.md', '## Dentro\n- src/geral.js\n');
    const arquivoFrente = escrever(dir, '.claude/esquadro/escopos/omni.md', '## Dentro\n- src/a.js\n');
    liberou(rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write', tool_input: { file_path: arquivoFrente, content: '## Dentro\n- src/a.js\n' }
    }, tmp));

    assert.strictEqual(negou(rodar(entrada(dir, 'src/geral.js'), tmp)), true, 'a frente vinculada ainda existe');

    fs.rmSync(arquivoFrente);
    liberou(rodar(entrada(dir, 'src/geral.js'), tmp));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('escopo por frente: nome de frente invalido e negado sem gravar vinculo, e conta no balde fora_do_escopo', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    const r = rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'esquadro', 'escopos', 'onda 8.md'), content: '## Dentro\n- src/a.js\n' }
    }, tmp);
    assert.strictEqual(negou(r), true);
    assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.includes('nome de frente invalido'),
      r.json.hookSpecificOutput.permissionDecisionReason);
    const s = lerEstado(tmp, 's1');
    assert.strictEqual(s.frente, undefined, 'nome invalido nao pode gravar vinculo');
    assert.strictEqual(s.contadores.fora_do_escopo, 1, 'sem balde novo: conta no balde existente');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('escopo por frente: a mesma pasta em caixa alta continua liberando e vinculando (D38)', () => {
  comTmp((tmp) => {
    const dir = montarProjeto();
    liberou(rodar({
      session_id: 's1', cwd: dir, tool_name: 'Write',
      tool_input: { file_path: path.join(dir, '.claude', 'Esquadro', 'Escopos', 'omni.md'), content: '## Dentro\n- src/a.js\n' }
    }, tmp));
    assert.strictEqual(lerEstado(tmp, 's1').frente, 'omni');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
