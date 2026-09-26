'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'uso.js');

test('uso: projeto sem contadores diz que ainda nao ha dado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-uso-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(r.status, 0);
    assert.ok(r.stdout.toLowerCase().includes('nenhum'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('uso: lista os disparos em ordem decrescente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-uso-'));
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.claude', 'esquadro', 'contadores.json'),
      JSON.stringify({ fora_do_escopo: 40, fecho_sem_evidencia: 7, comando_destrutivo: 2 }),
      'utf8'
    );
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    const linhas = r.stdout.split('\n').filter((l) => l.includes('|'));
    assert.ok(linhas[0].includes('fora_do_escopo'), r.stdout);
    assert.ok(r.stdout.includes('49'), 'devia somar o total');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
