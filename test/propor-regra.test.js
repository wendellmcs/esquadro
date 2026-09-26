'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'propor-regra.js');

function rodar(args, cwd) {
  const r = spawnSync(process.execPath, [SCRIPT].concat(args), { cwd: cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function projeto() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-aprende-'));
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), '# Regras\n\n- ao editar -> rodar git status antes\n', 'utf8');
  return dir;
}

test('propor: sem --gravar, NAO escreve nada (D11)', () => {
  const dir = projeto();
  try {
    const antes = fs.readFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), 'utf8');
    const r = rodar(['--gatilho', 'ao fechar tarefa', '--acao', 'colar a saida da rodada'], dir);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(fs.readFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), 'utf8'), antes);
    assert.ok(r.stdout.includes('nao gravei') || r.stdout.includes('NAO gravei'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('propor: com --gravar, acrescenta ao fim sem apagar o que havia', () => {
  const dir = projeto();
  try {
    rodar(['--gatilho', 'ao fechar tarefa', '--acao', 'colar a saida da rodada', '--gravar'], dir);
    const depois = fs.readFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), 'utf8');
    assert.ok(depois.includes('ao editar -> rodar git status antes'), 'nao pode apagar o que ja existia');
    assert.ok(depois.includes('ao fechar tarefa -> colar a saida da rodada'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('propor: regra invalida e recusada e sai com codigo 1', () => {
  const dir = projeto();
  try {
    const r = rodar(['--gatilho', 'ao subir', '--acao', 'usar a versao 2.1.220', '--gravar'], dir);
    assert.strictEqual(r.status, 1);
    assert.ok(r.stdout.includes('volatil'));
    assert.ok(!fs.readFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), 'utf8').includes('2.1.220'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('propor: gatilho vazio e recusado', () => {
  const dir = projeto();
  try {
    assert.strictEqual(rodar(['--acao', 'fazer algo'], dir).status, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('propor: regra duplicada nao e gravada duas vezes', () => {
  const dir = projeto();
  try {
    rodar(['--gatilho', 'ao editar', '--acao', 'rodar git status antes', '--gravar'], dir);
    const texto = fs.readFileSync(path.join(dir, '.claude', 'esquadro', 'regras.md'), 'utf8');
    const ocorrencias = texto.split('ao editar -> rodar git status antes').length - 1;
    assert.strictEqual(ocorrencias, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
