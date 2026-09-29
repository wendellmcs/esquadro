'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function comTmp(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-rein-'));
  const antes = process.env.ESQUADRO_TMP;
  process.env.ESQUADRO_TMP = base;
  for (const m of ['../scripts/lib/estado.js', '../scripts/lib/reinjecao.js']) delete require.cache[require.resolve(m)];
  try { fn(require('../scripts/lib/reinjecao.js'), base); }
  finally {
    if (antes === undefined) delete process.env.ESQUADRO_TMP; else process.env.ESQUADRO_TMP = antes;
    fs.rmSync(base, { recursive: true, force: true });
  }
}

function projeto(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  for (const [rel, txt] of Object.entries(extra || {})) {
    const alvo = path.join(dir, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, txt, 'utf8');
  }
  return dir;
}

test('reinjecao: abertura normal traz so as regras, nao o estado', () => {
  comTmp((rein) => {
    const dir = projeto({ '.claude/esquadro/regras.md': '- ao editar -> rodar git status\n' });
    try {
      const t = rein.montar(dir, 's1', 'startup') || '';
      assert.ok(t.includes('git status'));
      assert.ok(!t.includes('ESTADO'), 'startup nao precisa reinjetar estado');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

test('reinjecao: apos compactacao traz o ESCOPO declarado, literal', () => {
  comTmp((rein) => {
    const dir = projeto({
      '.claude/esquadro/regras.md': '- ao editar -> rodar git status\n',
      '.claude/esquadro/escopo.md': '**Objetivo:** ligar a trava\n## Dentro\n- src/a.js\n## Fora de escopo\n- o resto\n'
    });
    try {
      const t = rein.montar(dir, 's1', 'compact');
      assert.ok(t.includes('src/a.js'), t);
      assert.ok(t.includes('ligar a trava'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

test('reinjecao: apos compactacao traz a tarefa aberta do plano', () => {
  comTmp((rein) => {
    const dir = projeto({
      '.claude/esquadro/plano-ativo.json': JSON.stringify({ arquivo: 'p.md', sessionId: 's1' }),
      'p.md': '### Tarefa 4: portao\n- [x] a\n- [ ] b\n'
    });
    try {
      const t = rein.montar(dir, 's1', 'compact');
      assert.ok(t.includes('Tarefa 4'), t);
      assert.ok(t.includes('portao'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

test('reinjecao: projeto sem nada devolve null e nao polui o contexto', () => {
  comTmp((rein) => {
    const dir = projeto({});
    try {
      assert.strictEqual(rein.montar(dir, 's1', 'compact'), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

test('reinjecao: resume tambem reinjeta estado, nao so compact', () => {
  comTmp((rein) => {
    const dir = projeto({ '.claude/esquadro/escopo.md': '## Dentro\n- src/a.js\n' });
    try {
      assert.ok((rein.montar(dir, 's1', 'resume') || '').includes('src/a.js'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ---------------------------------------------------- escopo por frente

function estadoCom(base, sessionId, dados) {
  const sessoes = path.join(base, 'esquadro');
  fs.mkdirSync(sessoes, { recursive: true });
  fs.writeFileSync(path.join(sessoes, sessionId + '.json'), JSON.stringify(dados), 'utf8');
}

test('reinjecao: com vinculo a frente, o bloco ESTADO cita a frente e o arquivo dela', () => {
  comTmp((rein, base) => {
    const dir = projeto({
      '.claude/esquadro/regras.md': '- ao editar -> rodar git status\n',
      '.claude/esquadro/escopo.md': '**Objetivo:** tarefa geral\n## Dentro\n- geral.js\n',
      '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
    });
    try {
      estadoCom(base, 's1', { frente: 'omni' });
      const t = rein.montar(dir, 's1', 'compact');
      assert.ok(t.includes('Frente: omni (.claude/esquadro/escopos/omni.md)'), t);
      assert.ok(t.includes('src/a.js'), t);
      assert.ok(!t.includes('geral.js'), 'vinculado a omni, nao pode citar o escopo.md geral: ' + t);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

test('reinjecao: sem vinculo, a saida e identica a de hoje mesmo com frentes na pasta', () => {
  comTmp((rein, base) => {
    const dir = projeto({
      '.claude/esquadro/regras.md': '- ao editar -> rodar git status\n',
      '.claude/esquadro/escopo.md': '**Objetivo:** tarefa geral\n## Dentro\n- geral.js\n',
      '.claude/esquadro/escopos/omni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
    });
    try {
      const comFrentes = rein.montar(dir, 's1', 'compact');
      fs.rmSync(path.join(dir, '.claude', 'esquadro', 'escopos'), { recursive: true, force: true });
      const semFrentes = rein.montar(dir, 's1', 'compact');
      assert.strictEqual(comFrentes, semFrentes,
        'sem vinculo, a pasta escopos/ nao pode mudar a reinjecao');
      assert.ok(comFrentes.includes('geral.js'), comFrentes);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

test('reinjecao: a linha Frente imprime o nome saneado, nunca o valor cru do estado', () => {
  comTmp((rein, base) => {
    const dir = projeto({
      '.claude/esquadro/regras.md': '- ao editar -> rodar git status\n',
      '.claude/esquadro/escopos/om-ni.md': '**Objetivo:** fechar a onda 8\n## Dentro\n- src/a.js\n'
    });
    try {
      estadoCom(base, 's1', { frente: 'om ni' });
      const t = rein.montar(dir, 's1', 'compact');
      assert.ok(t.includes('Frente: om-ni (.claude/esquadro/escopos/om-ni.md)'), t);
      assert.ok(!t.includes('om ni'), 'valor cru do estado nao pode chegar ao texto: ' + t);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
