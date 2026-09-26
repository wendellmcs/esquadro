'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../scripts/lib/config.js');

const BOM = String.fromCharCode(65279);

function comProjeto(conteudo, fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-config-'));
  try {
    const pasta = path.join(cwd, '.claude', 'esquadro');
    fs.mkdirSync(pasta, { recursive: true });
    if (conteudo !== null) {
      fs.writeFileSync(path.join(pasta, 'projeto.json'), conteudo, 'utf8');
    }
    fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('config: projeto.json com BOM carrega o objeto (D-A)', () => {
  const json = JSON.stringify({ nome: 'esquadro', intocaveis: ['docs/plano-v1.md'] });
  comProjeto(BOM + json, (cwd) => {
    const bytes = fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'projeto.json'));
    assert.strictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'arquivo de teste realmente tem BOM');
    const obj = config.carregarProjeto(cwd);
    assert.ok(obj, 'carregarProjeto nao devolveu null com BOM');
    assert.strictEqual(obj.nome, 'esquadro');
    assert.deepStrictEqual(obj.intocaveis, ['docs/plano-v1.md']);
  });
});

test('config: projeto.json sem BOM carrega o mesmo objeto (controle)', () => {
  const json = JSON.stringify({ nome: 'esquadro', intocaveis: ['docs/plano-v1.md'] });
  comProjeto(json, (cwd) => {
    const bytes = fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'projeto.json'));
    assert.notStrictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'controle: este arquivo NAO tem BOM');
    const obj = config.carregarProjeto(cwd);
    assert.ok(obj);
    assert.strictEqual(obj.nome, 'esquadro');
    assert.deepStrictEqual(obj.intocaveis, ['docs/plano-v1.md']);
  });
});

test('config: arquivo ausente devolve null', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-config-'));
  try {
    assert.strictEqual(config.carregarProjeto(cwd), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('config: json de verdade corrompido devolve null', () => {
  comProjeto('{"a":', (cwd) => {
    assert.strictEqual(config.carregarProjeto(cwd), null);
  });
});

test('config: cwd falsy devolve null', () => {
  assert.strictEqual(config.carregarProjeto(null), null);
  assert.strictEqual(config.carregarProjeto(undefined), null);
  assert.strictEqual(config.carregarProjeto(''), null);
});

// --- D124: carregarDesign nascia sem semBom, e a irmã dela 8 linhas acima ja tinha. ---

function comDesign(conteudo, fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-design-'));
  try {
    const pasta = path.join(cwd, '.claude', 'esquadro');
    fs.mkdirSync(pasta, { recursive: true });
    if (conteudo !== null) {
      fs.writeFileSync(path.join(pasta, 'design.json'), conteudo, 'utf8');
    }
    fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('config: design.json com BOM carrega o objeto (D124)', () => {
  const json = JSON.stringify({ cores: ['#ff6600'], antiReferencias: ['gradiente'] });
  comDesign(BOM + json, (cwd) => {
    const bytes = fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'design.json'));
    assert.strictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'arquivo de teste realmente tem BOM');
    const obj = config.carregarDesign(cwd);
    assert.ok(obj, 'null aqui DESLIGA o modulo de design em silencio, e nada avisa');
    assert.deepStrictEqual(obj.cores, ['#ff6600']);
  });
});

test('config: design.json sem BOM carrega o mesmo objeto (controle)', () => {
  const json = JSON.stringify({ cores: ['#ff6600'], antiReferencias: ['gradiente'] });
  comDesign(json, (cwd) => {
    const bytes = fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'design.json'));
    assert.notStrictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'controle: este arquivo NAO tem BOM');
    const obj = config.carregarDesign(cwd);
    assert.ok(obj);
    assert.deepStrictEqual(obj.cores, ['#ff6600']);
  });
});

test('config: design.json ausente devolve null - o modulo e opcional', () => {
  comDesign(null, (cwd) => {
    assert.strictEqual(config.carregarDesign(cwd), null);
  });
  assert.strictEqual(config.carregarDesign(null), null);
});
