'use strict';
const test = require('node:test');
const assert = require('node:assert');
const shell = require('../scripts/lib/shell.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

// D244/defeito 4 (D241 secao 2.4): no Windows a ferramenta Bash do harness e Git Bash, onde
// `&&`, `head`, `tail` e `/tmp` existem. A tabela descreve o PowerShell, nao o Git Bash.
test('D244/defeito 4: ferramenta Bash no Windows nao leva a tabela do PowerShell', () => {
  assert.deepStrictEqual(shell.conferir('ls | head -3 && tail x > /tmp/a 2>/dev/null', WIN, 'Bash'), []);
  assert.deepStrictEqual(shell.conferir('ls | head -3', WIN, 'PowerShell').map((p) => p.achado), ['head']);
  // sem ferramenta (chamada antiga): o comportamento de antes
  assert.deepStrictEqual(shell.conferir('ls | head -3', WIN).map((p) => p.achado), ['head']);
});

// D244/achado 13: o corpo de um here-string do PowerShell e texto, nao comando.
test('D244/achado 13: corpo de here-string do PowerShell nao e lido como comando', () => {
  assert.deepStrictEqual(shell.conferir("$js = @'\nconst x = 'head';\nfoo && bar\n'@\nnode -e $js", WIN, 'PowerShell'), []);
  assert.deepStrictEqual(shell.conferir('$t = @"\r\nuse tail aqui\r\n"@\r\nWrite-Output $t', WIN, 'PowerShell'), []);
  // o que esta FORA do here-string continua lido
  assert.deepStrictEqual(shell.conferir("@'\nx\n'@ | Out-Null; ls | head", WIN, 'PowerShell').map((p) => p.achado), ['head']);
});

function hookDestrutivo(ferramenta, comando) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-shell-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-shell-tmp-'));
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'),
    JSON.stringify({ versaoConfig: 1, plataforma: WIN }), 'utf8');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'portao-destrutivo.js')], {
    input: JSON.stringify({ session_id: 'sh', cwd: dir, hook_event_name: 'PreToolUse', tool_name: ferramenta,
      tool_input: { command: comando } }),
    encoding: 'utf8', env: Object.assign({}, process.env, { ESQUADRO_TMP: tmp })
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (e) { json = null; }
  return !!(json && json.hookSpecificOutput && json.hookSpecificOutput.permissionDecision === 'deny');
}

test('D244/defeito 4: pelo hook, Bash passa com && e PowerShell e barrado', { skip: process.platform !== 'win32' }, () => {
  assert.strictEqual(hookDestrutivo('Bash', 'git status && git log -1'), false);
  assert.strictEqual(hookDestrutivo('PowerShell', 'git status && git log -1'), true);
  // controle negativo: o portao DESTRUTIVO continua valendo na ferramenta Bash
  assert.strictEqual(hookDestrutivo('Bash', 'rm -rf build'), true);
});
