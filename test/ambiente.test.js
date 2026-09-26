'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ambiente = require('../scripts/lib/ambiente.js');
const instrucoes = require('../scripts/lib/instrucoes.js');
const rubrica = require('../scripts/lib/rubrica.js');

function montar(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-amb-'));
  for (const [rel, txt] of Object.entries(arquivos)) {
    const alvo = path.join(dir, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, txt, 'utf8');
  }
  return dir;
}

test('ambiente: projeto cru nao detecta nada, e nao estoura', () => {
  const dir = montar({ 'a.js': '' });
  try {
    const r = ambiente.detectar(dir);
    assert.deepStrictEqual(r.skills, []);
    assert.deepStrictEqual(r.plugins, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ambiente: acha skills, agentes e hooks ja configurados no projeto', () => {
  const dir = montar({
    '.claude/skills/padrao-aaa/SKILL.md': '---\nname: padrao-aaa\n---\ntexto',
    '.claude/agents/arquiteto.md': '---\nname: arquiteto\n---',
    '.claude/settings.json': JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'x' }] }] } })
  });
  try {
    const r = ambiente.detectar(dir);
    assert.ok(r.skills.includes('padrao-aaa'));
    assert.ok(r.agentes.includes('arquiteto'));
    assert.ok(r.hooks.includes('SessionStart'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ambiente: plugin instalado vira candidato a DELEGACAO, nao a duplicacao', () => {
  const dir = montar({
    '.claude/settings.json': JSON.stringify({ enabledPlugins: { 'superpowers@x': true, 'context7@y': true } })
  });
  try {
    const r = ambiente.detectar(dir);
    assert.ok(r.plugins.some((p) => p.indexOf('superpowers') === 0));
    assert.ok(r.delegaveis.length > 0, 'superpowers e context7 sao delegaveis conhecidos');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ambiente: settings.json corrompido nao derruba a deteccao', () => {
  const dir = montar({ '.claude/settings.json': '{ isso nao e json' });
  try {
    assert.deepStrictEqual(ambiente.detectar(dir).hooks, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('instrucoes: conta item de lista e item numerado nas fontes canonicas', () => {
  const dir = montar({
    'CLAUDE.md': '# t\n\n- regra um\n- regra dois\n1. regra tres\n\nparagrafo solto nao conta.\n',
    '.claude/esquadro/regras.md': '- ao editar -> rodar git status\n'
  });
  try {
    const r = instrucoes.contar(dir, { fontesCanonicas: ['CLAUDE.md'] });
    assert.strictEqual(r.total, 4);
    assert.ok(r.metodo.length > 0, 'o metodo tem de sair junto: numero sem metodo nao e medida');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('instrucoes: marca estouro quando cruza o teto', () => {
  const linhas = [];
  for (let i = 0; i < 250; i++) linhas.push('- regra ' + i);
  const dir = montar({ 'CLAUDE.md': linhas.join('\n') });
  try {
    const r = instrucoes.contar(dir, { fontesCanonicas: ['CLAUDE.md'] });
    assert.strictEqual(r.estourou, true);
    assert.ok(r.total >= 250);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('instrucoes: diz QUAL arquivo pesa mais, nao so o total', () => {
  const dir = montar({
    'CLAUDE.md': '- a\n- b\n- c\n',
    'AGENTS.md': '- d\n'
  });
  try {
    const r = instrucoes.contar(dir, { fontesCanonicas: ['CLAUDE.md', 'AGENTS.md'] });
    assert.strictEqual(r.porArquivo[0].arquivo, 'CLAUDE.md');
    assert.strictEqual(r.porArquivo[0].n, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Ronda 1 do 8c.5: `LIMITES.tetoDeInstrucoes || 200` engolia o zero - o defeito que a
// varredura.js ja corrigiu (`limite || LIMITE_PADRAO`). Zero e teto de verdade.
test('instrucoes: teto e aviso em zero valem zero; so o ausente cai no padrao', () => {
  const antes = { teto: ambiente.LIMITES.tetoDeInstrucoes, avisar: ambiente.LIMITES.avisarA };
  const dir = montar({ 'CLAUDE.md': '- uma regra\n' });
  try {
    ambiente.LIMITES.tetoDeInstrucoes = 0;
    ambiente.LIMITES.avisarA = 0;
    let r = instrucoes.contar(dir, { fontesCanonicas: ['CLAUDE.md'] });
    assert.strictEqual(r.teto, 0, 'teto zero virou ' + r.teto);
    assert.strictEqual(r.avisarA, 0, 'aviso zero virou ' + r.avisarA);
    assert.strictEqual(r.estourou, true, 'uma instrucao estoura um teto de zero');
    delete ambiente.LIMITES.tetoDeInstrucoes;
    delete ambiente.LIMITES.avisarA;
    r = instrucoes.contar(dir, { fontesCanonicas: ['CLAUDE.md'] });
    assert.deepStrictEqual([r.teto, r.avisarA], [200, 150], 'sem o campo, vale o padrao');
  } finally {
    ambiente.LIMITES.tetoDeInstrucoes = antes.teto;
    ambiente.LIMITES.avisarA = antes.avisar;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rubrica: descricao que nao diz QUANDO usar e recusada (criterio 3)', () => {
  const ruim = '---\nname: x\ndescription: Faz revisao de codigo.\n---\ntexto';
  const bom = '---\nname: x\ndescription: Use quando for revisar codigo antes de dar por pronto.\n---\n## O que NAO promete\n- nada\n';
  assert.strictEqual(rubrica.conferir(ruim).ok, false);
  assert.strictEqual(rubrica.conferir(bom).ok, true, JSON.stringify(rubrica.conferir(bom).erros));
});

test('rubrica: skill sem secao do que NAO promete e recusada (criterio 6)', () => {
  const r = rubrica.conferir('---\nname: x\ndescription: Use quando precisar de x.\n---\n# t\n## Regras\n- a -> b\n');
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.toLowerCase().includes('promete')));
});

test('rubrica: proibicao solta em lista de regras e recusada (criterio 1)', () => {
  const texto = '---\nname: x\ndescription: Use quando x.\n---\n## Regras\n- nunca faca hardening\n## O que NAO promete\n- nada\n';
  const r = rubrica.conferir(texto);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('gatilho')));
});
