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

// 0.3.4/item 2 (D286): o `cd` solto. A pasta persiste entre chamadas nas ferramentas Bash e
// PowerShell, em qualquer SO - por isso a funcao nao olha a tabela do win32.
const SOLTO_BASH = [
  ['cd e &&', 'cd X && y'],
  ['cd com caminho e &&', 'cd "C:/dev/Meu Projeto" && git status'],
  ['cd depois de ;', 'echo a; cd X'],
  ['cd depois de ||', 'test -d X || cd Y'],
  ['cd na linha de baixo', 'echo a\ncd X\ngit status'],
  ['cd com CRLF', 'echo a\r\ncd X\r\ngit status'],
  ['cd sozinho', 'cd'],
  ['cd -', 'cd -'],
  ['pushd', 'pushd X && y'],
  ['pushd depois de ;', 'echo a; pushd X'],
  ['cd dentro de { }: o grupo nao isola', '{ cd X; y; }'],
  ['cd dentro de then', 'if true; then cd X; fi'],
  ['cd depois de subshell fechado', '( cd A && y ) && cd B'],
  ['cd depois de heredoc fechado', "cat <<'EOF'\ncorpo\nEOF\ncd X"],
  ['cd na mesma linha do heredoc', 'cat <<EOF; cd X\ncorpo\nEOF'],
  ['cd depois de continuacao de linha', 'git status \\\n; cd X'],
  ['cd depois de heredoc com traco', 'cat <<-EOF\n\tcorpo\n\tEOF\ncd X'],
  ['<<EOF entre aspas nao abre heredoc', 'echo "usa <<EOF aqui"\ncd X'],
  ['cd depois do segundo heredoc da linha', 'cat <<A <<B\ncorpo\nA\noutro\nB\ncd X']
];
const LIVRE_BASH = [
  ['subshell', '( cd X && y )'],
  ['subshell sem espaco', '(cd X && y)'],
  ['subshell com pwd', 'x=$(cd X; pwd)'],
  ['substituicao dentro de aspas', 'echo "$(cd X; pwd)"'],
  ['crase', 'x=`cd X; pwd`'],
  ['crase com separador antes do cd', 'x=`echo a; cd X; pwd`'],
  ['continuacao com CRLF faz do cd um argumento', 'echo a \\\r\n cd X'],
  ['subshell multilinha', '(\n  cd X\n  y\n)'],
  ['cd entre aspas duplas', 'echo "cd X && y"'],
  ['cd entre aspas simples', "echo 'cd X && y'"],
  ['bash -c', "bash -c 'cd X && y'"],
  ['corpo de heredoc', "cat <<'EOF'\ncd X\nEOF"],
  ['corpo de heredoc sem aspas no marcador', 'cat <<EOF\ncd X && y\nEOF'],
  ['corpo de heredoc com apostrofo e cd', "cat > a.txt <<'EOF'\nnao e d'agua\ncd X\nEOF\ngit status"],
  ['heredoc com traco', 'cat <<-EOF\n\tcd X\n\tEOF\ngit status'],
  ['dois heredocs', 'cat <<A <<B\ncd X\nA\ncd Y\nB\nls'],
  ['palavra terminada em cd', 'abcd'],
  ['comando terminado em cd', 'echo abcd; abcd X'],
  ['opcao --cd', 'git status --cd'],
  ['opcao -cd', 'tool -cd X'],
  ['cd como argumento', 'echo cd X'],
  ['cd como argumento de ls', 'ls cd'],
  ['cd colado em sufixo', 'cd-x && y'],
  ['cdx', 'cdx X'],
  ['cd no comentario', '# cd X\ngit status'],
  ['cd depois de separador dentro do comentario', '# nota: a && cd X\ngit status'],
  ['cd depois de separador no comentario do fim da linha', 'git status # ok; cd X'],
  ['cd depois de # na linha', 'git status # cd X'],
  ['expansao de chave', 'echo {cd,x}'],
  ['variavel chamada cd', 'echo ${cd}'],
  ['git -C no lugar do cd', 'git -C X status'],
  ['sem cd', 'git status && git log -1']
];

test('shell/cdSolto: acha o cd solto no Bash (D286)', () => {
  for (const [nome, cmd] of SOLTO_BASH) {
    const r = shell.cdSolto(cmd, 'Bash');
    assert.ok(r, 'tinha de achar: ' + nome + ' -> ' + JSON.stringify(cmd));
    assert.strictEqual(r.forma, 'bash', nome);
  }
});

test('shell/cdSolto: nao acha cd onde ele nao persiste nem e comando (Bash)', () => {
  for (const [nome, cmd] of LIVRE_BASH) {
    assert.strictEqual(shell.cdSolto(cmd, 'Bash'), null, 'nao tinha de achar: ' + nome + ' -> ' + JSON.stringify(cmd));
  }
});

test('shell/cdSolto: o achado diz qual palavra foi e qual era a forma', () => {
  assert.strictEqual(shell.cdSolto('echo a; pushd X', 'Bash').achado, 'pushd');
  assert.strictEqual(shell.cdSolto('cd X && y', 'Bash').achado, 'cd');
  assert.strictEqual(shell.cdSolto('Set-Location X; y', 'PowerShell').achado, 'Set-Location');
});

const SOLTO_PS = [
  ['cd', 'cd X; y'],
  ['cd ..', 'cd ..'],
  ['cd..', 'cd..; y'],
  ['Set-Location', 'Set-Location X; y'],
  ['Set-Location -LiteralPath', "Set-Location -LiteralPath 'C:\\a b'; node x.js"],
  ['set-location em minusculas', 'set-location X; y'],
  ['SET-LOCATION em maiusculas', 'SET-LOCATION X; y'],
  ['sl', 'sl X; y'],
  ['chdir', 'chdir X; y'],
  ['Push-Location sem Pop', 'Push-Location X; y'],
  ['pushd sem popd', 'pushd X; y'],
  ['bloco & { } nao isola (medido)', '& { Set-Location X }; y'],
  ['cd entre parenteses nao isola', '(cd X); y'],
  ['cd na linha de baixo', "Write-Output a\ncd X\ngit status"],
  ['cd dentro de if', 'if (Test-Path X) { Set-Location X }'],
  ['Pop-Location sem Push nao desfaz o Set-Location', 'Set-Location X; y; Pop-Location'],
  ['cd depois do here-string', "$t = @'\ncorpo\n'@\ncd X"]
];
const LIVRE_PS = [
  ['Push com try/finally Pop', "Push-Location -LiteralPath 'X' -ErrorAction Stop; try { y } finally { Pop-Location }"],
  ['Push/Pop em minusculas', 'push-location X; try { y } finally { pop-location }'],
  ['pushd e popd', 'pushd X; y; popd'],
  ['Set-Location dentro do bloco empilhado', "Push-Location -LiteralPath 'X' -ErrorAction Stop; try { Set-Location sub; y } finally { Pop-Location }"],
  ['palavra entre aspas', 'Write-Output "Set-Location X"'],
  ['cd entre aspas simples', "Write-Output 'cd X; y'"],
  ['powershell -Command filho', "powershell -NoProfile -Command 'Set-Location X; y'"],
  ['corpo de here-string', "$js = @'\nSet-Location X\ncd Y\n'@\nnode -e $js"],
  ['corpo de here-string com aspas duplas', '$t = @"\r\ncd X\r\n"@\r\nWrite-Output $t'],
  ['comentario', "# Set-Location X\nGet-ChildItem"],
  ['comentario de bloco', 'Get-ChildItem <# cd X #> | Out-Null'],
  ['comentario de bloco com separador', 'Get-ChildItem <# nota; cd X #> | Out-Null'],
  ['comentario de bloco em varias linhas', "<#\nnota\ncd X\n#>\nGet-ChildItem"],
  ['comentario com separador', 'Get-ChildItem # ok; cd X'],
  ['sl como parte do nome', 'Get-Content sl.txt'],
  ['cd como argumento', 'Write-Output cd'],
  ['Push-Location como argumento', 'Get-Help Push-Location'],
  ['abcd', 'abcd; --cd'],
  ['sem cd', 'npm test; if ($?) { npm run build }']
];

test('shell/cdSolto: acha o cd solto no PowerShell, com cada apelido (D286)', () => {
  for (const [nome, cmd] of SOLTO_PS) {
    const r = shell.cdSolto(cmd, 'PowerShell');
    assert.ok(r, 'tinha de achar: ' + nome + ' -> ' + JSON.stringify(cmd));
    assert.strictEqual(r.forma, 'powershell', nome);
  }
});

test('shell/cdSolto: nao acha cd onde a pasta volta ou onde nao e comando (PowerShell)', () => {
  for (const [nome, cmd] of LIVRE_PS) {
    assert.strictEqual(shell.cdSolto(cmd, 'PowerShell'), null, 'nao tinha de achar: ' + nome + ' -> ' + JSON.stringify(cmd));
  }
});

// 0.3.4/item 2 (T4): aspas de cada idioma. Aspa simples nao tem escape (nem no bash nem no
// PowerShell); a dupla escapa com `\` no bash e com crase no PowerShell. A que abre primeiro manda.
test('shell/cdSolto: aspa simples com barra antes de fechar nao esconde o cd (T4)', () => {
  const cmd = "ls 'C:\\a\\'; cd x; ls 'b'";
  for (const ferr of ['PowerShell', 'Bash']) {
    const r = shell.cdSolto(cmd, ferr);
    assert.ok(r, 'tinha de achar em ' + ferr + ': ' + JSON.stringify(cmd));
    assert.strictEqual(r.achado, 'cd', ferr);
  }
});

test('shell/cdSolto: aspa dupla com barra final: PowerShell nega, bash e uma string so (T4)', () => {
  // PowerShell: a barra nao escapa, a aspa fecha e o cd esta solto.
  const ps = shell.cdSolto('ls "C:\\a\\"; cd x; ls "b"', 'PowerShell');
  assert.ok(ps && ps.achado === 'cd', JSON.stringify(ps));
  // bash: `\"` escapa a aspa, a string vai ate a ultima aspa e o cd esta dentro dela.
  assert.strictEqual(shell.cdSolto('echo "a\\"; cd x; echo b"', 'Bash'), null);
  // PowerShell: a crase escapa a aspa, e o cd fica dentro da string.
  assert.strictEqual(shell.cdSolto('echo "a`"; cd x; echo b"', 'PowerShell'), null);
});

test('shell/cdSolto: aspa dupla dentro de simples nao abre string (T4)', () => {
  const cmd = "echo 'a\"'; cd x; echo \"b\"";
  for (const ferr of ['PowerShell', 'Bash']) {
    const r = shell.cdSolto(cmd, ferr);
    assert.ok(r && r.achado === 'cd', ferr + ': ' + JSON.stringify(cmd));
  }
});

test("shell/cdSolto: PowerShell 'it''s' sao dois literais seguidos e o cd depois esta solto (T4)", () => {
  const r = shell.cdSolto("echo 'it''s'; cd x", 'PowerShell');
  assert.ok(r && r.achado === 'cd', JSON.stringify(r));
  // controle: o cd dentro do literal com '' continua escondido
  assert.strictEqual(shell.cdSolto("echo 'it''s; cd x'", 'PowerShell'), null);
});

test('shell/conferir: a tabela do win32 segue igual - o idioma so entra no cdSolto (T4)', () => {
  // Com a semLiterais antiga, `\'` dentro de aspa simples nao fechava: o `&&` ficava escondido.
  assert.deepStrictEqual(shell.conferir("echo 'C:\\a\\' && echo 'b'", WIN), []);
  // controle positivo: sem aspa o mesmo `&&` e achado
  assert.ok(shell.conferir('echo a && echo b', WIN).length > 0);
});

// 0.3.4/item 2 (T4): o Pop-Location so desfaz o que veio ANTES dele.
test('shell/cdSolto: Pop-Location que nao desfaz nada nao livra o cd (T4)', () => {
  // [comando, palavra achada]: o primeiro que nao esta desfeito, na ordem do texto.
  const casos = [
    ['Push-Location a; Pop-Location; cd b', 'cd'],
    ['cd b; Push-Location a; Pop-Location', 'cd'],
    ['Pop-Location; Push-Location a; cd b', 'Push-Location']
  ];
  for (const [cmd, achado] of casos) {
    const r = shell.cdSolto(cmd, 'PowerShell');
    assert.ok(r, 'tinha de achar: ' + JSON.stringify(cmd));
    assert.strictEqual(r.achado, achado, cmd);
  }
  // controle: Push, cd dentro, Pop depois continua livre
  assert.strictEqual(shell.cdSolto('Push-Location a; cd b; Pop-Location', 'PowerShell'), null);
});

// 0.3.4/item 2 (T4, ronda 2): comentario de linha, comentario de bloco e pilha do Push/Pop.
test('shell/cdSolto: apostrofo em comentario nao abre literal e esconde o cd (T4 r2)', () => {
  const b = shell.cdSolto("# it's\ncd x\necho 'y'", 'Bash');
  assert.ok(b && b.achado === 'cd', JSON.stringify(b));
  const p = shell.cdSolto("# it's\ncd x\nWrite-Host 'y'", 'PowerShell');
  assert.ok(p && p.achado === 'cd', JSON.stringify(p));
  for (const ferr of ['Bash', 'PowerShell']) {
    // # dentro de string nao e comentario; # colado em palavra nao e comentario
    assert.ok(shell.cdSolto("echo '#'; cd x", ferr), ferr + ' aspa com #');
    assert.ok(shell.cdSolto('echo a#b; cd x', ferr), ferr + ' a#b');
    // controle: o cd dentro do comentario continua escondido
    assert.strictEqual(shell.cdSolto('# cd x', ferr), null, ferr + ' comentario so');
  }
});

test('shell/cdSolto: <# numa string e #> em outra nao escondem o cd (T4 r2)', () => {
  const r = shell.cdSolto("Write-Host '<#'; cd C:\\outro; Write-Host '#>'", 'PowerShell');
  assert.ok(r && r.achado === 'cd', JSON.stringify(r));
  // controles: comentario de bloco de verdade continua escondendo
  assert.strictEqual(shell.cdSolto('<# cd x #> Get-Date', 'PowerShell'), null);
  const c = shell.cdSolto("Get-Date <# a'b #>; cd x", 'PowerShell');
  assert.ok(c && c.achado === 'cd', JSON.stringify(c));
});

test('shell/cdSolto: o Pop-Location sem pilha nao faz nada (T4 r2)', () => {
  const a = shell.cdSolto('Push-Location a; Pop-Location; cd b; Pop-Location', 'PowerShell');
  assert.ok(a && a.achado === 'cd', JSON.stringify(a));
  const b = shell.cdSolto('Push-Location a; Push-Location b; Pop-Location', 'PowerShell');
  assert.ok(b && b.achado === 'Push-Location', JSON.stringify(b));
  // Pop como argumento nao desempilha, e cd sem pilha esta solto
  const c = shell.cdSolto('Get-Help Pop-Location; cd x', 'PowerShell');
  assert.ok(c && c.achado === 'cd', JSON.stringify(c));
  // controle: dois Push e dois Pop esvaziam a pilha
  assert.strictEqual(shell.cdSolto('Push-Location a; Push-Location b; Pop-Location; Pop-Location', 'PowerShell'), null);
});

test('shell/cdSolto: cd\\ e comando no PowerShell (T4 r2)', () => {
  const r = shell.cdSolto('cd\\; git status', 'PowerShell');
  assert.ok(r && r.achado === 'cd', JSON.stringify(r));
});

test('shell/cdSolto: sem ferramenta, a plataforma escolhe o idioma; sem nenhuma, vale o Bash', () => {
  // Bash: `( cd X )` isola. PowerShell: nao isola. O mesmo texto, dois veredictos.
  assert.strictEqual(shell.cdSolto('( cd X && y )', 'Bash'), null);
  assert.ok(shell.cdSolto('( cd X && y )', 'PowerShell'));
  assert.ok(shell.cdSolto('Set-Location X; y', undefined, WIN));
  assert.strictEqual(shell.cdSolto('( cd X && y )', undefined, LINUX), null);
  assert.ok(shell.cdSolto('cd X && y', undefined, LINUX));
  assert.strictEqual(shell.cdSolto('( cd X && y )'), null);
  assert.ok(shell.cdSolto('cd X && y'));
  // independe da plataforma: o `cd` persiste em qualquer SO
  assert.ok(shell.cdSolto('cd X && y', 'Bash', LINUX));
  assert.ok(shell.cdSolto('cd X && y', 'Bash', WIN));
  assert.ok(shell.cdSolto('Set-Location X; y', 'PowerShell', LINUX));
});

test('shell/cdSolto: entrada vazia ou estranha nao estoura', () => {
  for (const v of [undefined, null, '', '   ', 42]) {
    assert.strictEqual(shell.cdSolto(v, 'Bash'), null);
    assert.strictEqual(shell.cdSolto(v, 'PowerShell'), null);
  }
});

test('shell/motivoCdSolto: o Bash recebe o subshell, o PowerShell recebe a forma medida, ambos em ASCII', () => {
  const b = shell.motivoCdSolto('cd X && y', shell.cdSolto('cd X && y', 'Bash'));
  assert.ok(b.includes('( cd '), b);
  assert.ok(/persiste/i.test(b), b);
  assert.ok(b.includes('comandosLiberados'), 'faltou o escape declarado: ' + b);
  assert.ok(!b.includes('Pop-Location'), 'o Bash nao recebe a forma do PowerShell: ' + b);
  assert.ok(/^[\x20-\x7E\n]+$/.test(b), 'motivo tem de ser ASCII (R5)');

  const p = shell.motivoCdSolto('Set-Location X; y', shell.cdSolto('Set-Location X; y', 'PowerShell'));
  assert.ok(p.includes('Push-Location -LiteralPath'), p);
  assert.ok(p.includes('-ErrorAction Stop'), p);
  assert.ok(p.includes('try {') && p.includes('finally { Pop-Location }'), p);
  assert.ok(/& \{/.test(p), 'faltou avisar que o bloco & { } nao isola: ' + p);
  assert.ok(!p.includes('( cd '), 'o PowerShell nao recebe o subshell do Bash: ' + p);
  assert.ok(/^[\x20-\x7E\n]+$/.test(p), 'motivo tem de ser ASCII (R5)');
  // mostra o comando do agente, cortado
  assert.ok(b.includes('cd X && y') && p.includes('Set-Location X; y'));
});

test('shell/motivoCdSolto: a forma que a mensagem ensina passa pela propria trava', () => {
  // A mensagem que nega nao pode ensinar uma forma que a mesma trava nega.
  for (const [ferramenta, cmd] of [['Bash', 'cd X && y'], ['PowerShell', 'Set-Location X; y']]) {
    const m = shell.motivoCdSolto(cmd, shell.cdSolto(cmd, ferramenta));
    const formas = m.split('\n').filter((l) => /^\s{2,}\S/.test(l) && /cd |Push-Location/.test(l) && !/^\s+por que/.test(l));
    assert.ok(formas.length >= 1, 'nenhuma forma de exemplo na mensagem: ' + m);
    for (const f of formas) {
      assert.strictEqual(shell.cdSolto(f, ferramenta), null, ferramenta + ' ensina forma que a trava nega: ' + f);
    }
  }
});

// As tres instrucoes do proprio plugin que mandavam usar `cd` solto (achado da abertura, D286).
const RAIZ_PLUGIN = path.join(__dirname, '..');
function lerDoPlugin(rel) { return fs.readFileSync(path.join(RAIZ_PLUGIN, rel), 'utf8'); }

test('D286: a instrucao do init (Passo 7b) usa formas que a trava aceita', () => {
  const texto = lerDoPlugin(path.join('skills', 'init', 'SKILL.md'));
  const i = texto.indexOf('Rode os tr');
  assert.ok(i !== -1, 'nao achou a frase dos tres geradores no Passo 7b');
  const paragrafo = texto.slice(i, texto.indexOf('\n\n', i));
  const trechos = paragrafo.match(/`[^`]+`/g) || [];
  const bash = trechos.filter((t) => /\bcd\b/.test(t));
  const ps = trechos.filter((t) => /Push-Location|Set-Location/.test(t));
  assert.ok(bash.length >= 1 && ps.length >= 1, 'faltou a forma do Bash ou a do PowerShell: ' + paragrafo);
  for (const t of bash) assert.strictEqual(shell.cdSolto(t.slice(1, -1), 'Bash'), null, 'a trava nega o que o init ensina: ' + t);
  for (const t of ps) {
    assert.strictEqual(shell.cdSolto(t.slice(1, -1), 'PowerShell'), null, 'a trava nega o que o init ensina: ' + t);
    assert.ok(/Pop-Location/.test(t), 'a forma do PowerShell tem de devolver a pasta: ' + t);
  }
  assert.ok(!/Set-Location -LiteralPath '<raiz>'; node/.test(paragrafo), 'sobrou o Set-Location solto do init');
});

test('D286: o bloco do `claude -p` em 06-ambiente.md usa forma que a trava aceita', () => {
  const texto = lerDoPlugin(path.join('skills', 'padrao', 'references', '06-ambiente.md'));
  const i = texto.indexOf('## 8. Provar hook');
  assert.ok(i !== -1, 'nao achou a secao 8');
  const m = texto.slice(i).match(/```\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(m, 'nao achou o bloco de exemplo da secao 8');
  assert.ok(m[1].includes('claude -p'), m[1]);
  assert.ok(m[1].includes('( cd '), 'o cd do bloco tem de estar em subshell: ' + m[1]);
  assert.strictEqual(shell.cdSolto(m[1], 'Bash'), null, 'a trava nega o bloco inteiro: ' + m[1]);
});

test('D286: o texto que o exportar.js imprime usa forma que a trava aceita', () => {
  const fonte = lerDoPlugin(path.join('scripts', 'exportar.js'));
  const linha = fonte.split(/\r?\n/).find((l) => /console\.log\(.*npm/.test(l));
  assert.ok(linha, 'nao achou a linha que imprime o passo do npm');
  const expr = linha.match(/console\.log\((.*)\);\s*$/)[1];
  const impresso = new Function('destinoPedido', 'return ' + expr)('C:\\pasta com espaco\\export');
  assert.ok(impresso.includes('npm'), impresso);
  assert.strictEqual(shell.cdSolto(impresso, 'Bash'), null, 'a trava nega o que o exportar imprime (Bash): ' + impresso);
  assert.strictEqual(shell.cdSolto(impresso, 'PowerShell'), null, 'a trava nega o que o exportar imprime (PowerShell): ' + impresso);
  assert.ok(!/\bcd\b/.test(impresso), 'sobrou cd no texto impresso: ' + impresso);
});
