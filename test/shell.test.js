'use strict';
const test = require('node:test');
const assert = require('node:assert');
const shell = require('../scripts/lib/shell.js');

const WIN = { so: 'win32', shell: 'powershell' };
const LINUX = { so: 'linux', shell: 'bash' };

test('shell: em Linux nao aponta nada', () => {
  assert.strictEqual(shell.conferir('rm -rf /tmp/x && echo ok 2>/dev/null', LINUX).length, 0);
});

test('shell: /tmp em Windows e apontado com o equivalente', () => {
  const p = shell.conferir('echo oi > /tmp/a.txt', WIN);
  assert.strictEqual(p.length, 1);
  assert.ok(p[0].sugestao.includes('TEMP'), JSON.stringify(p[0]));
});

test('shell: 2>/dev/null em Windows e apontado', () => {
  const p = shell.conferir('node x.js 2>/dev/null', WIN);
  assert.ok(p.some((x) => x.sugestao.includes('$null')));
});

test('shell: && em PowerShell 5.1 e apontado', () => {
  const p = shell.conferir('npm test && npm run build', { so: 'win32', shell: 'powershell' });
  assert.ok(p.some((x) => x.achado === '&&'));
});

test('shell: comando unix inexistente no PowerShell e apontado', () => {
  for (const cmd of ['which node', 'touch a.txt', 'head -n 5 a.txt', 'tail -n 5 a.txt']) {
    assert.ok(shell.conferir(cmd, WIN).length > 0, 'devia apontar: ' + cmd);
  }
});

test('shell: heredoc em PowerShell e apontado', () => {
  assert.ok(shell.conferir("cat <<'EOF'\na\nEOF", WIN).length > 0);
});

test('shell: comando PowerShell legitimo passa limpo', () => {
  assert.strictEqual(shell.conferir('Get-ChildItem -Recurse | Select-Object -First 5', WIN).length, 0);
  assert.strictEqual(shell.conferir('npm test; if ($?) { npm run build }', WIN).length, 0);
});

test('shell: a palavra dentro de string literal nao e apontada', () => {
  assert.strictEqual(shell.conferir('Write-Output "o caminho /tmp e do Linux"', WIN).length, 0);
});

test('shell: na segunda tentativa o motivo manda TROCAR DE IDIOMA', () => {
  const p = shell.conferir('rm -rf build', WIN);
  const primeiro = shell.motivo('rm -rf build', p, 1);
  const segundo = shell.motivo('rm -fr build', p, 2);
  assert.ok(!primeiro.includes('TROQUE DE IDIOMA'));
  assert.ok(segundo.includes('TROQUE DE IDIOMA'), segundo);
  assert.ok(/^[\x20-\x7E\n]+$/.test(segundo), 'motivo tem de ser ASCII (R5)');
});

test('shell: motivo mostra achado e substituto lado a lado', () => {
  const p = shell.conferir('echo oi > /tmp/a.txt', WIN);
  const m = shell.motivo('echo oi > /tmp/a.txt', p, 1);
  assert.ok(m.includes('/tmp'));
  assert.ok(m.includes('TEMP'));
});
