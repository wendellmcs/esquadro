'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'portao-decisao.js');

/** Projeto temporario com espaco no caminho (o caso normal desta maquina). `projeto` null = sem projeto.json. */
function comProjeto(projeto, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro decisao-'));
  try {
    if (projeto !== null) {
      fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'), JSON.stringify(projeto), 'utf8');
    }
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function hook(dir, entrada) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: dir, encoding: 'utf8',
    input: typeof entrada === 'string' ? entrada : JSON.stringify(Object.assign({
      session_id: 'dec', cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion'
    }, entrada))
  });
  let json = null;
  if (r.stdout && r.stdout.trim()) { try { json = JSON.parse(r.stdout); } catch (e) { json = null; } }
  return { status: r.status, json: json, stdout: r.stdout, stderr: r.stderr };
}

function negou(r) {
  return !!(r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecision === 'deny');
}
function motivo(r) { return r.json.hookSpecificOutput.permissionDecisionReason; }

function liberou(r) {
  assert.strictEqual(r.status, 0, 'o portao tem de sair com 0 (R6). stderr: ' + r.stderr);
  assert.ok(!/portao falhou/.test(r.stderr || ''), 'o portao caiu e liberou por inercia, nao por decisao: ' + r.stderr);
  assert.strictEqual(negou(r), false, 'devia liberar: ' + r.stdout);
}

function pergunta(rotulos, texto) {
  return { question: texto || 'Qual caminho?', header: 'Caminho', multiSelect: false,
    options: rotulos.map((l) => ({ label: l, description: 'consequencia e custo' })) };
}
const TRES = ['Fazer agora (Recomendado)', 'Fazer depois', 'Nao fazer'];
const entrada = (...perguntas) => ({ tool_input: { questions: perguntas } });

test('D387/portao-decisao: 3 opcoes com a recomendada em primeiro passa', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => { liberou(hook(dir, entrada(pergunta(TRES)))); });
});

test('D387/portao-decisao: a marca aceita (Recomendada), (Recom.) e (Recommended), em qualquer caixa', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    for (const marca of ['Fazer (Recomendada)', 'Fazer (Recom.)', 'Fazer (Recommended)', 'Fazer (RECOMENDADO)']) {
      liberou(hook(dir, entrada(pergunta([marca, 'b', 'c']))));
    }
  });
});

test('D387/portao-decisao: 2 opcoes barra, dizendo quantas e o que fazer', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    const r = hook(dir, entrada(pergunta(['A (Recomendado)', 'B'])));
    assert.ok(negou(r), r.stdout);
    assert.match(motivo(r), /pergunta 1 tem 2 opcoes/);
    assert.match(motivo(r), /exatamente 3 opcoes, a recomendada em primeiro com \(Recomendado\) no rotulo/);
    assert.match(motivo(r), /"portaoDecisao": false em \.claude\/esquadro\/projeto\.json/);
    assert.ok(/^[\x20-\x7e\n]*$/.test(motivo(r)), 'o motivo sai em ASCII: ' + motivo(r));
  });
});

test('D387/portao-decisao: 4 opcoes barra', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    const r = hook(dir, entrada(pergunta(['A (Recomendado)', 'B', 'C', 'D'])));
    assert.ok(negou(r), r.stdout);
    assert.match(motivo(r), /pergunta 1 tem 4 opcoes/);
  });
});

test('D387/portao-decisao: 3 opcoes sem a recomendada em primeiro barra (marca na segunda nao vale)', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    const sem = hook(dir, entrada(pergunta(['A', 'B', 'C'])));
    assert.ok(negou(sem), sem.stdout);
    assert.match(motivo(sem), /a 1a opcao da pergunta 1 nao e a recomendada/);
    const segunda = hook(dir, entrada(pergunta(['A', 'B (Recomendado)', 'C'])));
    assert.ok(negou(segunda), segunda.stdout);
  });
});

test('D391/portao-decisao: a marca tambem fora da 1a opcao barra, citando a opcao', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    const duas = hook(dir, entrada(pergunta(['A (Recomendado)', 'B (Recomendado)', 'C'])));
    assert.ok(negou(duas), duas.stdout);
    assert.match(motivo(duas), /a pergunta 1 marca como recomendada tambem a opcao 2/);
    const terceira = hook(dir, entrada(pergunta(['A (Recomendado)', 'B', 'C (recom.)'])));
    assert.ok(negou(terceira), terceira.stdout);
    assert.match(motivo(terceira), /a pergunta 1 marca como recomendada tambem a opcao 3/);
    const todas = hook(dir, entrada(pergunta(['A (Recomendado)', 'B (Recommended)', 'C (Recomendada)'])));
    assert.ok(negou(todas), todas.stdout);
    assert.match(motivo(todas), /tambem a opcao 2, 3/);
  });
});

test('D389/portao-decisao: sem a marca exata entre parenteses a 1a opcao barra (negacao e palavra solta)', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    for (const rotulo of ['Nao recomendado: apagar tudo', 'Manter (não recomendado)', 'Keep (not recommended)',
      'Manter (não é recomendado)', 'Manter (Não é a recomendada)', 'Manter (nem recomendado)',
      'Manter (sem recomendação)', 'Manter (irrecomendável)', 'Ver recomendações', 'Recomendado: corrigir',
      'Recomendado', 'Fazer [Recomendado]', 'Fazer (Recomendado', 'Fazer (Recomendados)', 'Fazer (Recom)', 'Fazer (Recoms)',
      'Recomeçar do zero', 'Recompilar tudo']) {
      const r = hook(dir, entrada(pergunta([rotulo, 'B (Recomendado)', 'C'])));
      assert.ok(negou(r), rotulo + ': ' + r.stdout);
      assert.match(motivo(r), /a 1a opcao da pergunta 1 nao e a recomendada/);
    }
  });
});

test('D389/portao-decisao: a marca entre parenteses passa em qualquer lugar do rotulo, mesmo com "nao" na acao', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    for (const rotulo of ['Não recomeçar (Recomendado)', 'Nao publicar agora (Recomendado)',
      '(Recomendado) corrigir', 'Fazer (recom.) agora', 'Manter (RECOMMENDED)']) {
      liberou(hook(dir, entrada(pergunta([rotulo, 'b', 'c']))));
    }
  });
});

test('D387/portao-decisao: varias perguntas, uma errada: barra citando so a errada', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    const r = hook(dir, entrada(pergunta(TRES, 'certa'), pergunta(['A (Recomendado)', 'B', 'C', 'D'], 'errada')));
    assert.ok(negou(r), r.stdout);
    assert.match(motivo(r), /pergunta 2 tem 4 opcoes/);
    assert.ok(!/pergunta 1/.test(motivo(r)), 'nao cita a pergunta certa: ' + motivo(r));
  });
});

test('D387/portao-decisao: tool_input sem questions, ou com questions que nao e lista, passa', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    liberou(hook(dir, { tool_input: {} }));
    liberou(hook(dir, {}));
    liberou(hook(dir, { tool_input: { questions: 'texto' } }));
    liberou(hook(dir, { tool_input: { questions: { options: [] } } }));
  });
});

test('D391/portao-decisao: questions como lista vazia barra (nao ha pergunta no padrao)', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    const r = hook(dir, { tool_input: { questions: [] } });
    assert.ok(negou(r), r.stdout);
    assert.match(motivo(r), /nenhuma pergunta/);
  });
});

test('D387/portao-decisao: portaoDecisao false no projeto.json desliga o portao', () => {
  comProjeto({ versaoConfig: 1, portaoDecisao: false }, (dir) => {
    liberou(hook(dir, entrada(pergunta(['A', 'B']))));
  });
});

test('D388/portao-decisao: so o booleano false desliga; "false", true e ausente seguem ligados', () => {
  for (const valor of ['false', true, 0, null]) {
    comProjeto({ versaoConfig: 1, portaoDecisao: valor }, (dir) => {
      assert.ok(negou(hook(dir, entrada(pergunta(['A', 'B'])))), 'portaoDecisao ' + JSON.stringify(valor) + ' deveria seguir ligado');
    });
  }
  comProjeto({ versaoConfig: 1 }, (dir) => { assert.ok(negou(hook(dir, entrada(pergunta(['A', 'B']))))); });
});

test('D388/portao-decisao: sem projeto.json o portao esta ligado', () => {
  comProjeto(null, (dir) => {
    assert.ok(negou(hook(dir, entrada(pergunta(['A', 'B'])))));
    liberou(hook(dir, entrada(pergunta(TRES))));
  });
});

test('D388/portao-decisao: acha o projeto.json subindo de uma subpasta (cwd do hook)', () => {
  comProjeto({ versaoConfig: 1, portaoDecisao: false }, (dir) => {
    const sub = path.join(dir, 'src', 'x');
    fs.mkdirSync(sub, { recursive: true });
    liberou(hook(dir, Object.assign({ cwd: sub }, entrada(pergunta(['A', 'B'])))));
  });
});

test('D387/portao-decisao: entrada quebrada libera (R6), sem estourar', () => {
  comProjeto({ versaoConfig: 1 }, (dir) => {
    liberou(hook(dir, '{ isto nao e json'));
    liberou(hook(dir, ''));
    liberou(hook(dir, 'null'));
    // pergunta que nao e objeto / opcao que nao e objeto: o portao decide sem estourar
    const r = hook(dir, entrada(null));
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!/portao falhou/.test(r.stderr || ''), r.stderr);
    const strings = hook(dir, entrada({ options: ['A (Recomendado)', 'B', 'C'] }));
    liberou(strings);
  });
});
