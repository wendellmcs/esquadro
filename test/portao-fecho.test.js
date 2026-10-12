'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

function rodar(script, entrada, tmp) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', script)], {
    input: JSON.stringify(entrada),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { ESQUADRO_TMP: tmp })
  });
  let json = null;
  if (r.stdout && r.stdout.trim()) { try { json = JSON.parse(r.stdout); } catch (e) { json = null; } }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function comTmp(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-fecho-'));
  try { fn(base); } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

test('fecho: sem trabalho real no turno, nao bloqueia (custo zero em conversa)', () => {
  comTmp((tmp) => {
    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto, tudo certo.'
    }, tmp);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.json, null, 'nao devia emitir decisao');
  });
});

test('fecho: com trabalho real e alegacao sem evidencia, bloqueia', () => {
  comTmp((tmp) => {
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto, os testes passaram.'
    }, tmp);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.json.decision, 'block');
    assert.ok(r.json.reason.includes('trava 3'));
  });
});

test('fecho: com trabalho real e evidencia colada, libera', () => {
  comTmp((tmp) => {
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Os testes passaram.\n```\n# pass 12\n# fail 0\n```'
    }, tmp);
    assert.strictEqual(r.json, null);
  });
});

test('fecho: bloqueia no maximo uma vez por turno (sem laco)', () => {
  comTmp((tmp) => {
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    const entrada = {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    };
    const primeiro = rodar('portao-fecho.js', entrada, tmp);
    const segundo = rodar('portao-fecho.js', entrada, tmp);
    assert.strictEqual(primeiro.json.decision, 'block');
    assert.strictEqual(segundo.json, null, 'a segunda passada tem de liberar');
  });
});

test('fecho: stop_hook_active true libera de imediato', () => {
  comTmp((tmp) => {
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      stop_hook_active: true, last_assistant_message: 'Pronto.'
    }, tmp);
    assert.strictEqual(r.json, null);
  });
});

test('fecho: mostra no fecho quantas vezes o escopo foi ampliado (desenho §5)', () => {
  comTmp((tmp) => {
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    const estado = require('../scripts/lib/estado.js');
    const antes = process.env.ESQUADRO_TMP;
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    require('../scripts/lib/estado.js').incrementar('s1', 'escopo_ampliado');
    if (antes === undefined) delete process.env.ESQUADRO_TMP; else process.env.ESQUADRO_TMP = antes;

    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Segue o resumo.\n```\nok\n```'
    }, tmp);
    assert.ok(r.json && r.json.systemMessage, 'devia avisar o usuario');
    assert.ok(r.json.systemMessage.includes('1'));
    // D39: o rotulo tem de dizer o que o contador realmente mede (ampliado), nao
    // "reescrito" - criar o escopo do zero e o caminho obediente, nao uma reescrita.
    assert.ok(r.json.systemMessage.includes('ampliado'),
      'o aviso tem de dizer "ampliado": ' + r.json.systemMessage);
  });
});

test('fecho: turno liberado limpa a marca', () => {
  comTmp((tmp) => {
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop', last_assistant_message: 'Ola.'
    }, tmp);
    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop', last_assistant_message: 'Pronto.'
    }, tmp);
    assert.strictEqual(r.json, null, 'sem marca nova, nao ha portao');
  });
});

// D33: contador da D14 chega ao arquivo duravel sem duplicar, e a ordem e descarregar-depois-limpar.

test('fecho D33: descarga persiste no arquivo duravel sem duplicar o contador (D14/D20)', () => {
  comTmp((tmp) => {
    fs.mkdirSync(path.join(tmp, '.claude', 'esquadro'), { recursive: true });
    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    }, tmp);
    rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    }, tmp);
    const bruto = fs.readFileSync(path.join(tmp, '.claude', 'esquadro', 'contadores.json'), 'utf8');
    const contadores = JSON.parse(bruto);
    assert.strictEqual(contadores.fecho_sem_evidencia, 1, 'esperava 1, nao 2: descarregar nao pode duplicar');
  });
});

test('fecho D33: descarrega antes de limpar - falha na descarga preserva a marca da sessao', () => {
  comTmp((tmp) => {
    // Forca estado.descarregar a lancar excecao: .claude/esquadro e um ARQUIVO, nao pasta,
    // entao a escrita do contadores.json (fora do try/catch interno) da ENOTDIR.
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude', 'esquadro'), 'nao e uma pasta', 'utf8');

    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);
    rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    }, tmp);
    const r = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    }, tmp);
    assert.strictEqual(r.status, 0, 'R6: falha na descarga tem de liberar com exit 0');

    const estado = require('../scripts/lib/estado.js');
    const antes = process.env.ESQUADRO_TMP;
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    const sessao = require('../scripts/lib/estado.js').ler('s1');
    if (antes === undefined) delete process.env.ESQUADRO_TMP; else process.env.ESQUADRO_TMP = antes;

    assert.strictEqual(sessao.bloqueouNesteTurno, true, 'a marca so sobrevive se descarregar rodou antes de limpar');
  });
});

// Rodada de correcao 1 / achado 2: contadores.json com JSON valido mas nao-objeto (42) nao
// pode mais fazer descarregar() estourar - e se estourasse, io.blindar capturaria com exit 0
// silencioso e estado.limpar nunca rodaria, congelando bloqueouNesteTurno para sempre.

test('fecho D-A2: contadores.json = 42 nao trava a limpeza da sessao no turno seguinte', () => {
  comTmp((tmp) => {
    const pasta = path.join(tmp, '.claude', 'esquadro');
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'contadores.json'), '42', 'utf8');

    rodar('marcar-trabalho.js', { session_id: 's1', cwd: tmp, tool_name: 'Edit' }, tmp);

    // Primeiro turno: sem evidencia, bloqueia e marca bloqueouNesteTurno.
    const primeiro = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    }, tmp);
    assert.strictEqual(primeiro.json.decision, 'block');

    // Segundo turno: cai no ramo bloqueouNesteTurno -> encerrarTurno -> descarregar + limpar.
    const segundo = rodar('portao-fecho.js', {
      session_id: 's1', cwd: tmp, hook_event_name: 'Stop',
      last_assistant_message: 'Pronto.'
    }, tmp);
    assert.strictEqual(segundo.status, 0, 'R6: nunca pode estourar');

    const estado = require('../scripts/lib/estado.js');
    const antes = process.env.ESQUADRO_TMP;
    process.env.ESQUADRO_TMP = tmp;
    delete require.cache[require.resolve('../scripts/lib/estado.js')];
    const sessao = require('../scripts/lib/estado.js').ler('s1');
    if (antes === undefined) delete process.env.ESQUADRO_TMP; else process.env.ESQUADRO_TMP = antes;

    // T18/D123: o arquivo de sessao passa a sobreviver ao turno (turnosComTrabalho,
    // gitAbertura, contadoresSessao...). O que NAO pode sobreviver e a marca do
    // TURNO - senao o 42 invalido congelaria a trava 3 para sempre, que e o que
    // este teste existe para impedir.
    assert.strictEqual(sessao.bloqueouNesteTurno, undefined,
      'a marca do turno tem de ter sido zerada: ' + JSON.stringify(sessao));
    assert.strictEqual(sessao.trabalhoReal, undefined,
      'trabalhoReal e do turno e tem de ter sido zerado: ' + JSON.stringify(sessao));
    assert.strictEqual(sessao.contadores, undefined,
      'o balde do TURNO nao pode sobreviver a descarga (D123): ' + JSON.stringify(sessao));

    const corrompido = path.join(pasta, 'contadores.json.corrompido');
    assert.ok(fs.existsSync(corrompido), 'o 42 invalido foi preservado como .corrompido');
    const contadoresNovo = JSON.parse(fs.readFileSync(path.join(pasta, 'contadores.json'), 'utf8'));
    assert.strictEqual(contadoresNovo.fecho_sem_evidencia, 1, 'o contador do turno foi descarregado normalmente');
  });
});

// Ronda 1 do Passo 8b: o fecho regravava o estado com uma lista fixa de campos, e
// os avisos de "uma vez por sessao" do portao de escopo morriam a cada turno.
test('fecho: aviso de uma vez por sessao nao volta no turno seguinte', () => {
  comTmp((tmp) => {
    const escrita = (id, cwd) => rodar('portao-escopo.js', {
      session_id: id, cwd: cwd, tool_name: 'Write',
      tool_input: { file_path: path.join(cwd, 'notas', 'a.md'), content: 'x' }
    }, tmp);
    const fecharTurno = (id, cwd) => {
      rodar('marcar-trabalho.js', { session_id: id, cwd: cwd, tool_name: 'Write' }, tmp);
      const f = rodar('portao-fecho.js', {
        session_id: id, cwd: cwd, hook_event_name: 'Stop', last_assistant_message: 'Anotado.'
      }, tmp);
      assert.ok(!(f.json && f.json.decision === 'block'), 'o fecho tinha de encerrar o turno: ' + f.stdout);
      return f;
    };

    // sem projeto.json - e o fecho passa pelo ramo em que a saude NAO dispara
    const sem = fs.mkdtempSync(path.join(tmp, 'sem-'));
    const primeiro = escrita('av1', sem);
    assert.ok(primeiro.json && /projeto\.json/.test(primeiro.json.systemMessage), 'controle: ' + primeiro.stdout);
    assert.strictEqual(fecharTurno('av1', sem).json, null, 'controle: sem projeto a saude nao dispara');
    assert.strictEqual(escrita('av1', sem).json, null, 'o aviso de projeto sem projeto.json voltou');

    // projeto.json com campo de tipo errado, e limiar de 1 turno: o fecho passa pelo
    // OUTRO ramo, o da saude que dispara - os dois regravam o estado
    const torto = fs.mkdtempSync(path.join(tmp, 'torto-'));
    fs.mkdirSync(path.join(torto, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(torto, '.claude', 'esquadro', 'projeto.json'), JSON.stringify({
      versaoConfig: 1, marchaPadrao: 'padrao', marchas: { rapida: ['notas/**'] }, intocaveis: 'cofre/**',
      limiares: { turnosComTrabalho: 1 }
    }), 'utf8');
    const aviso = escrita('av2', torto);
    assert.ok(aviso.json && /tipo errado/.test(aviso.json.systemMessage), 'controle: ' + aviso.stdout);
    const disparou = fecharTurno('av2', torto);
    assert.ok(disparou.json && /chat novo/.test(disparou.json.systemMessage),
      'controle: a saude tinha de disparar: ' + disparou.stdout);
    assert.strictEqual(escrita('av2', torto).json, null, 'o aviso de campo de tipo errado voltou');
  });
});

// ------------------------------- ronda 2 do Passo 8b: todo campo da sessao

const sessaoDe = (tmp, id) => JSON.parse(fs.readFileSync(path.join(tmp, 'esquadro', id + '.json'), 'utf8'));

// O registro do gatilho 3 tem outro nome e outra forma - um objeto, nao `avisou* = true`
// -, e morria no fecho do turno sem teste nenhum perceber.
test('fecho: o registro do gatilho 3 sobrevive ao fecho do turno', () => {
  comTmp((tmp) => {
    const dir = fs.mkdtempSync(path.join(tmp, 'g3-'));
    rodar('portao-apelido.js', { session_id: 'g3', cwd: dir, tool_name: 'Task' }, tmp);
    const antes = sessaoDe(tmp, 'g3').gatilho3;
    assert.ok(antes && antes.verificavel === false, 'controle: o gatilho 3 tinha de registrar: ' + JSON.stringify(antes));
    rodar('marcar-trabalho.js', { session_id: 'g3', cwd: dir, tool_name: 'Write' }, tmp);
    const f = rodar('portao-fecho.js', {
      session_id: 'g3', cwd: dir, hook_event_name: 'Stop', last_assistant_message: 'Anotado.'
    }, tmp);
    assert.ok(!(f.json && f.json.decision === 'block'), 'controle: o fecho tinha de encerrar o turno: ' + f.stdout);
    const depois = sessaoDe(tmp, 'g3');
    assert.strictEqual(depois.trabalhoReal, undefined, 'controle: o fecho tinha de zerar o turno');
    assert.deepStrictEqual(depois.gatilho3, antes, 'o registro de sessao do gatilho 3 morreu no fecho');
  });
});

/**
 * O que um script grava no estado da sessao. <v> e o parametro de
 * `alterar(..., function (<v>)` ou o que recebeu `estado.ler(...)`, e o leitor le
 * `<v>.<campo>` com qualquer nome e qualquer atribuicao (`=`, `+=`, `||=`, `++`...).
 * A gravacao que ele nao saberia ler, ele reprova, dizendo como gravar (ronda 3 do
 * Passo 8b): `Object.assign(<v>, ...)`, `<v>[...] = ...`, o `alterar` cuja funcao
 * devolve outra coisa que nao o proprio <v> - o `alterar` grava o que ela devolve -
 * e o `estado.gravar` fora do fecho, cujos campos o teste mede rodando o fecho.
 */
function lerGravacoes(arquivo, texto) {
  const campos = new Set();
  const proibidas = [];
  const comoGravar = ' - grave campo a campo pelo estado.alterar: <v>.<campo> = ...';
  const atribui = '(?:\\+\\+|--|(?:[-+*/%&|^]|\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?)?=(?!=))';
  const nomes = new Set();
  let m;
  const doAlterar = /alterar\([^,()]+,\s*function\s*\(\s*(\w+)\s*\)/g;
  while ((m = doAlterar.exec(texto)) !== null) {
    nomes.add(m[1]);
    const abre = texto.indexOf('{', doAlterar.lastIndex);
    let fundo = 0;
    let fim = texto.length;
    for (let i = abre; i < texto.length; i++) {
      if (texto[i] === '{') fundo++;
      else if (texto[i] === '}' && --fundo === 0) { fim = i; break; }
    }
    const devolve = /\breturn\b\s*([^;\n]*)/g;
    let r;
    while ((r = devolve.exec(texto.slice(abre, fim))) !== null) {
      if (r[1].trim() !== m[1]) proibidas.push(arquivo + ': o alterar devolve `' + r[1].trim() + '`' + comoGravar);
    }
  }
  const doLer = /\b(\w+)\s*=\s*estado\.ler\(/g;
  while ((m = doLer.exec(texto)) !== null) nomes.add(m[1]);
  for (const v of nomes) {
    const re = new RegExp('\\b' + v + '\\.([A-Za-z_]\\w*)\\s*' + atribui, 'g');
    while ((m = re.exec(texto)) !== null) campos.add(m[1]);
    const antes = new RegExp('(?:\\+\\+|--)\\s*\\b' + v + '\\.([A-Za-z_]\\w*)', 'g');
    while ((m = antes.exec(texto)) !== null) campos.add(m[1]);
    const junta = new RegExp('Object\\.assign\\(\\s*' + v + '\\s*[,)]', 'g');
    while ((m = junta.exec(texto)) !== null) proibidas.push(arquivo + ': `' + m[0] + '`' + comoGravar);
    const calculada = new RegExp('(?<![\\w$.])' + v + '\\s*\\[[^\\]]*\\]\\s*' + atribui, 'g');
    while ((m = calculada.exec(texto)) !== null) proibidas.push(arquivo + ': `' + m[0] + '`' + comoGravar);
  }
  if (path.basename(arquivo) !== 'portao-fecho.js') {
    const grava = /\bestado\.gravar\(/g;
    while ((m = grava.exec(texto)) !== null) proibidas.push(arquivo + ': `estado.gravar(` fora do fecho' + comoGravar);
  }
  return { campos, proibidas };
}

function camposGravados() {
  const campos = new Set();
  const proibidas = [];
  const visitar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { visitar(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const r = lerGravacoes(path.relative(RAIZ, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8'));
      r.campos.forEach((c) => campos.add(c));
      proibidas.push(...r.proibidas);
    }
  };
  visitar(path.join(RAIZ, 'scripts'));
  return { campos, proibidas };
}

// Rondas 1 e 2 do Passo 8b: o fecho regrava o estado so com os campos da sessao, e o
// que ficava fora morria calado - os avisos na ronda 1, o registro do gatilho 3 na 2.
// O teste de antes so enxergava `avisou* = true`. Este le todo campo gravado, exige
// que cada um tenha tempo de vida declarado, e roda o fecho com todos, nos dois ramos.
// Ronda 3: dizia ler todo campo "com qualquer forma" e nao via Object.assign nem chave
// calculada. Agora a forma que ele nao sabe ler reprova, e diz como gravar.
test('fecho: todo campo que um script grava no estado tem tempo de vida declarado, e o fecho o cumpre', () => {
  const estado = require('../scripts/lib/estado.js');
  // cada forma que o leitor nao sabe ler, num script de mentira, reprova sozinha
  const script = (meio, fim) => 'estado.alterar(e.session_id, function (s) {\n  s.marca = true;\n' +
    meio + '\n  ' + (fim || 'return s;') + '\n});\n';
  for (const [nome, texto, forma] of [
    ['junta.js', script('  Object.assign(s, { novo: 1 });'), 'Object.assign(s,'],
    ['calculada.js', script('  s[chave] = 1;'), 's[chave] ='],
    ['somada.js', script('  s[chave] += 1;'), 's[chave] +='],
    ['devolve.js', script('', 'return Object.assign({}, s, { novo: 1 });'), 'devolve `Object.assign({}, s,'],
    ['grava.js', script('') + 'estado.gravar(e.session_id, { novo: 1 });\n', 'estado.gravar('],
  ]) {
    const r = lerGravacoes(nome, texto);
    assert.strictEqual(r.proibidas.length, 1, nome + ': a forma ' + forma + ' tinha de reprovar uma vez: ' +
      JSON.stringify(r.proibidas));
    assert.ok(r.proibidas[0].indexOf(nome + ': ') === 0 && r.proibidas[0].indexOf(forma) !== -1,
      nome + ': a reprovacao nao diz onde nem o que: ' + r.proibidas[0]);
    assert.ok(/pelo estado\.alterar: <v>\.<campo> = \.\.\.$/.test(r.proibidas[0]),
      nome + ': a reprovacao nao diz como gravar: ' + r.proibidas[0]);
    assert.ok(r.campos.has('marca'), 'controle: ' + nome + ' tinha de ler s.marca');
  }
  // controles: as formas que os scripts usam hoje e uma propriedade com o nome de <v>
  // (`e.s[0]`) nao reprovam, e toda atribuicao a um campo e lida
  const hoje = lerGravacoes('portao-fecho.js', script([
    '  const acumulados = Object.assign({}, s.contadoresSessao || {});',
    '  acumulados[chave] = (acumulados[chave] || 0) + 1;',
    '  s.contadores[chave] = (s.contadores[chave] || 0) + 1;', '  e.s[0] = 1;',
    '  const vs = avaliar(Object.assign({}, s, { contadores: acumulados }));',
    '  s.somado += 1;', '  s.ou ||= true;', '  s.depois++;', '  --s.antes;'
  ].join('\n')) + 'estado.gravar(e.session_id, s);\n');
  assert.deepStrictEqual(hoje.proibidas, [], 'controle: forma que o leitor le reprovou');
  assert.deepStrictEqual(Array.from(hoje.campos).sort(), ['antes', 'depois', 'marca', 'ou', 'somado'],
    'o leitor nao le toda atribuicao a um campo');

  const { campos: gravados, proibidas } = camposGravados();
  assert.deepStrictEqual(proibidas, [], 'gravacao no estado que o leitor nao sabe ler');
  for (const c of ['gatilho3', 'avisouApelido', 'trabalhoReal', 'gitAbertura']) {
    assert.ok(gravados.has(c), 'controle: o leitor nao achou ' + c + ': ' + Array.from(gravados).join(', '));
  }
  const daSessao = estado.CAMPOS_DA_SESSAO;
  const doTurno = estado.CAMPOS_DO_TURNO;
  assert.deepStrictEqual(daSessao.filter((c) => doTurno.indexOf(c) !== -1), [], 'campo nas duas listas');
  assert.deepStrictEqual(daSessao.concat(doTurno).filter((c) => !gravados.has(c)), [],
    'lista com campo que nenhum script grava');

  comTmp((tmp) => {
    // o que o proprio fecho recalcula: o que sobra de um fecho com o estado minimo
    const vazio = fs.mkdtempSync(path.join(tmp, 'minimo-'));
    rodar('marcar-trabalho.js', { session_id: 'min', cwd: vazio, tool_name: 'Write' }, tmp);
    rodar('portao-fecho.js', { session_id: 'min', cwd: vazio, hook_event_name: 'Stop',
      last_assistant_message: 'Anotado.' }, tmp);
    const doFecho = Object.keys(sessaoDe(tmp, 'min'));
    assert.ok(doFecho.indexOf('gitAbertura') !== -1, 'controle: o fecho recalcula a foto: ' + doFecho.join(', '));
    const semVida = Array.from(gravados).filter((c) =>
      daSessao.indexOf(c) === -1 && doTurno.indexOf(c) === -1 && doFecho.indexOf(c) === -1);
    assert.deepStrictEqual(semVida, [], 'campo gravado sem tempo de vida: ponha em estado.CAMPOS_DA_SESSAO ' +
      '(o fecho carrega) ou em estado.CAMPOS_DO_TURNO (morre no fecho)');

    // o estado com todo campo gravado, nos dois ramos do fecho. `abertoEm: null` e o
    // que a abertura grava sem origem: valor falso da sessao tambem tem de ser carregado
    const tipado = { trabalhoReal: true, bloqueouNesteTurno: true, contadores: {}, turnosComTrabalho: 1,
      gitAbertura: [], arquivosTocados: [], abertoEm: null };
    const cheio = {};
    for (const c of gravados) cheio[c] = Object.prototype.hasOwnProperty.call(tipado, c) ? tipado[c] : { campo: c };
    const sem = fs.mkdtempSync(path.join(tmp, 'sem-'));
    const dispara = fs.mkdtempSync(path.join(tmp, 'dispara-'));
    fs.mkdirSync(path.join(dispara, '.claude', 'esquadro'), { recursive: true });
    fs.writeFileSync(path.join(dispara, '.claude', 'esquadro', 'projeto.json'),
      JSON.stringify({ versaoConfig: 1, marchaPadrao: 'padrao', limiares: { turnosComTrabalho: 1 } }), 'utf8');
    for (const [id, cwd, saude] of [['cheio-sem', sem, false], ['cheio-dispara', dispara, true]]) {
      fs.writeFileSync(path.join(tmp, 'esquadro', id + '.json'), JSON.stringify(cheio), 'utf8');
      const f = rodar('portao-fecho.js', { session_id: id, cwd: cwd, hook_event_name: 'Stop',
        last_assistant_message: 'Anotado.' }, tmp);
      assert.strictEqual(Boolean(f.json && /chat novo/.test(f.json.systemMessage)), saude,
        'controle: o ramo da saude errado em ' + id + ': ' + f.stdout);
      const depois = sessaoDe(tmp, id);
      for (const c of daSessao) {
        assert.deepStrictEqual(depois[c], cheio[c], id + ': ' + c + ' e da sessao e morreu no fecho');
      }
      for (const c of doTurno) {
        assert.strictEqual(depois[c], undefined, id + ': ' + c + ' e do turno e sobreviveu ao fecho');
      }
    }
  });
});

// ------------------------------- T10-1 (D357): o aviso de saude chega ao MODELO, nao so a tela

// Projeto com limiar de 1 turno: o primeiro turno com trabalho ja dispara a saude.
function projetoQueDispara(tmp, nome, limiares) {
  const dir = fs.mkdtempSync(path.join(tmp, nome + '-'));
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'),
    JSON.stringify({ versaoConfig: 1, marchaPadrao: 'padrao', limiares: limiares || { turnosComTrabalho: 1 } }), 'utf8');
  return dir;
}

function turnoComTrabalho(tmp, id, cwd, extra) {
  rodar('marcar-trabalho.js', { session_id: id, cwd: cwd, tool_name: 'Write' }, tmp);
  return rodar('portao-fecho.js', Object.assign({
    session_id: id, cwd: cwd, hook_event_name: 'Stop', last_assistant_message: 'Anotado.'
  }, extra || {}), tmp);
}

test('T10-1: a saude que dispara manda ao modelo o que fazer, e ao usuario o aviso (additionalContext do Stop)', () => {
  comTmp((tmp) => {
    const dir = projetoQueDispara(tmp, 't101');
    const r = turnoComTrabalho(tmp, 't101', dir);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.json && /chat novo/.test(r.json.systemMessage), 'controle: o aviso do usuario segue: ' + r.stdout);
    const h = r.json.hookSpecificOutput;
    assert.ok(h, 'faltou hookSpecificOutput: ' + r.stdout);
    assert.strictEqual(h.hookEventName, 'Stop');
    const t = h.additionalContext;
    assert.strictEqual(typeof t, 'string');
    assert.ok(/turnos com trabalho real \(limiar 1\)/.test(t), 'tem de citar o gatilho que disparou: ' + t);
    assert.ok(t.indexOf('/esquadro:handoff') !== -1, 'tem de mandar rodar o handoff: ' + t);
    assert.ok(/chat novo/.test(t), 'tem de mandar dizer que e hora de abrir chat novo: ' + t);
    assert.ok(/bloco de codigo/.test(t), 'tem de mandar colar o prompt em bloco de codigo: ' + t);
    assert.ok(/sigo/.test(t), 'tem de proibir o "sigo?": ' + t);
    assert.ok(/^[\x20-\x7E\n]+$/.test(t), 'additionalContext tem de ser ASCII: ' + JSON.stringify(t));
  });
});

test('T10-1: a continuacao sai uma vez por sessao', () => {
  comTmp((tmp) => {
    const dir = projetoQueDispara(tmp, 't101b');
    const primeiro = turnoComTrabalho(tmp, 't101b', dir);
    assert.ok(primeiro.json && primeiro.json.hookSpecificOutput, 'controle: o primeiro turno tinha de avisar: ' + primeiro.stdout);
    const segundo = turnoComTrabalho(tmp, 't101b', dir);
    assert.strictEqual(segundo.json, null, 'o segundo turno repetiu o aviso: ' + segundo.stdout);
  });
});

test('T10-1: com stop_hook_active nao continua e nao marca avisouSaude - o aviso fica para o proximo Stop', () => {
  comTmp((tmp) => {
    const dir = projetoQueDispara(tmp, 't101c');
    const laco = turnoComTrabalho(tmp, 't101c', dir, { stop_hook_active: true });
    assert.strictEqual(laco.status, 0, laco.stderr);
    assert.strictEqual(laco.json, null, 'em laco nao pode emitir nada (nem continuacao, nem aviso): ' + laco.stdout);
    assert.ok(!sessaoDe(tmp, 't101c').avisouSaude, 'em laco o avisouSaude nao pode ser marcado');
    // o proximo Stop, fora do laco, entrega o aviso que ficou pendente
    const depois = turnoComTrabalho(tmp, 't101c', dir);
    assert.ok(depois.json && depois.json.hookSpecificOutput && /handoff/.test(depois.json.hookSpecificOutput.additionalContext),
      'o aviso pendente nao chegou no Stop seguinte: ' + depois.stdout);
    assert.strictEqual(sessaoDe(tmp, 't101c').avisouSaude, true);
  });
});

// ------------------------------- D412/D415: handoff gravado no turno sem o prompt no chat

const HANDOFF = path.join('.claude', 'esquadro', 'handoff', '2026-10-10-frente-x.md');
const PROMPT = 'Handoff gravado. Prompt da proxima sessao:\n```text\nRetomando a frente x\nPASSO 1\n```';

function projetoCom(tmp, nome, conteudo) {
  const dir = fs.mkdtempSync(path.join(tmp, nome + '-'));
  fs.mkdirSync(path.join(dir, '.claude', 'esquadro'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'projeto.json'),
    JSON.stringify(Object.assign({ versaoConfig: 1, marchaPadrao: 'padrao' }, conteudo || {})), 'utf8');
  return dir;
}

function gravar(tmp, id, cwd, ferramenta, arquivo) {
  return rodar('marcar-trabalho.js', { session_id: id, cwd: cwd, tool_name: ferramenta,
    tool_input: { file_path: path.join(cwd, arquivo) } }, tmp);
}

function fecho(tmp, id, cwd, mensagem, extra) {
  return rodar('portao-fecho.js', Object.assign({ session_id: id, cwd: cwd, hook_event_name: 'Stop',
    last_assistant_message: mensagem }, extra || {}), tmp);
}

test('D412: handoff gravado (Write ou Edit) e resposta final sem bloco de codigo -> barra, e conta o balde', () => {
  comTmp((tmp) => {
    for (const ferramenta of ['Write', 'Edit']) {
      const id = 'h-' + ferramenta;
      const dir = projetoCom(tmp, id);
      gravar(tmp, id, dir, ferramenta, HANDOFF);
      const r = fecho(tmp, id, dir, 'Handoff gravado no arquivo.');
      assert.strictEqual(r.status, 0, r.stderr);
      assert.ok(r.json && r.json.decision === 'block', ferramenta + ': tinha de barrar: ' + r.stdout);
      assert.ok(/handoff/.test(r.json.reason) && /bloco/.test(r.json.reason), r.json.reason);
      assert.ok(r.json.reason.indexOf('trava 3') === -1, 'sem alegacao, o motivo da evidencia nao entra: ' + r.json.reason);
      assert.strictEqual(sessaoDe(tmp, id).contadores.handoff_sem_prompt, 1);
      // uma vez por turno: a segunda passada (o modelo respondeu de novo) libera
      assert.strictEqual(fecho(tmp, id, dir, 'Handoff gravado no arquivo.').json, null);
    }
  });
});

test('D412: handoff gravado e o prompt colado em bloco -> libera', () => {
  comTmp((tmp) => {
    const dir = projetoCom(tmp, 'h-ok');
    gravar(tmp, 'h-ok', dir, 'Write', HANDOFF);
    assert.strictEqual(fecho(tmp, 'h-ok', dir, PROMPT).json, null);
  });
});

test('D412: controles - arquivo que nao e handoff, ou Read do handoff, nao barram', () => {
  comTmp((tmp) => {
    const dir = projetoCom(tmp, 'h-nao');
    gravar(tmp, 'h-nao', dir, 'Write', path.join('skills', 'handoff', 'SKILL.md'));
    assert.strictEqual(fecho(tmp, 'h-nao', dir, 'Anotado.').json, null, 'a skill nao e um handoff');
    const dir2 = projetoCom(tmp, 'h-read');
    gravar(tmp, 'h-read', dir2, 'Edit', 'notas.md');
    gravar(tmp, 'h-read', dir2, 'Read', HANDOFF);
    assert.strictEqual(fecho(tmp, 'h-read', dir2, 'Anotado.').json, null, 'ler o handoff nao e grava-lo');
  });
});

test('D412: a marca e do turno - o turno seguinte sem handoff nao herda a trava', () => {
  comTmp((tmp) => {
    const dir = projetoCom(tmp, 'h-turno');
    gravar(tmp, 'h-turno', dir, 'Write', HANDOFF);
    assert.strictEqual(fecho(tmp, 'h-turno', dir, PROMPT).json, null, 'controle: o turno 1 colou o prompt');
    rodar('abrir-turno.js', { session_id: 'h-turno', cwd: dir, prompt: 'segue' }, tmp);
    gravar(tmp, 'h-turno', dir, 'Edit', 'notas.md');
    assert.strictEqual(fecho(tmp, 'h-turno', dir, 'Anotado.').json, null, 'o turno 2 herdou a marca do 1');
    // e a marca que ficou de um turno sem Stop (interrompido) morre na abertura do seguinte
    gravar(tmp, 'h-turno', dir, 'Write', HANDOFF);
    assert.strictEqual(sessaoDe(tmp, 'h-turno').gravouHandoff, true, 'controle: a marca foi gravada');
    rodar('abrir-turno.js', { session_id: 'h-turno', cwd: dir, prompt: 'outro' }, tmp);
    assert.strictEqual(sessaoDe(tmp, 'h-turno').gravouHandoff, undefined, 'abrir-turno nao zerou a marca');
  });
});

test('D415: "portaoHandoff": false desliga; travas.fecho false NAO desliga', () => {
  comTmp((tmp) => {
    const desl = projetoCom(tmp, 'h-desl', { portaoHandoff: false });
    gravar(tmp, 'h-desl', desl, 'Write', HANDOFF);
    assert.strictEqual(fecho(tmp, 'h-desl', desl, 'Handoff gravado.').json, null, 'portaoHandoff false nao desligou');
    // so `false` desliga
    const texto = projetoCom(tmp, 'h-texto', { portaoHandoff: 'false' });
    gravar(tmp, 'h-texto', texto, 'Write', HANDOFF);
    const t = fecho(tmp, 'h-texto', texto, 'Handoff gravado.');
    assert.ok(t.json && t.json.decision === 'block', 'texto "false" desligou: ' + t.stdout);
    const semFecho = projetoCom(tmp, 'h-fecho', {
      travas: { fecho: false, destrutivo: true, outraFrente: true, escopo: true } });
    gravar(tmp, 'h-fecho', semFecho, 'Write', HANDOFF);
    const f = fecho(tmp, 'h-fecho', semFecho, 'Pronto, os testes passaram.');
    assert.ok(f.json && f.json.decision === 'block', 'travas.fecho false desligou a trava do handoff: ' + f.stdout);
    assert.ok(f.json.reason.indexOf('trava 3') === -1, 'com fecho false a evidencia nao e cobrada: ' + f.json.reason);
  });
});

test('D412: alegacao sem evidencia e handoff sem prompt -> um bloqueio so, com os dois motivos e os dois baldes', () => {
  comTmp((tmp) => {
    const dir = projetoCom(tmp, 'h-dois');
    gravar(tmp, 'h-dois', dir, 'Write', HANDOFF);
    const r = fecho(tmp, 'h-dois', dir, 'Pronto, os testes passaram.');
    assert.ok(r.json && r.json.decision === 'block', r.stdout);
    assert.ok(r.json.reason.indexOf('trava 3') !== -1, 'faltou o motivo da evidencia: ' + r.json.reason);
    assert.ok(r.json.reason.indexOf('portaoHandoff') !== -1, 'faltou o motivo do handoff: ' + r.json.reason);
    const c = sessaoDe(tmp, 'h-dois').contadores;
    assert.strictEqual(c.fecho_sem_evidencia, 1);
    assert.strictEqual(c.handoff_sem_prompt, 1);
  });
});

test('D412: subitem aberto e handoff sem prompt -> os dois motivos no mesmo bloqueio', () => {
  comTmp((tmp) => {
    const dir = projetoCom(tmp, 'h-sub');
    fs.writeFileSync(path.join(dir, 'plano.md'), '## Tarefa 1: fazer\n- [x] a\n- [ ] b\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'plano-ativo.json'),
      JSON.stringify({ arquivo: 'plano.md', sessionId: 'h-sub', tarefa: null }), 'utf8');
    gravar(tmp, 'h-sub', dir, 'Write', HANDOFF);
    const r = fecho(tmp, 'h-sub', dir, 'A etapa esta concluida.');
    assert.ok(r.json && r.json.decision === 'block', r.stdout);
    assert.ok(/subitem pendente/.test(r.json.reason), 'faltou o motivo do subitem: ' + r.json.reason);
    assert.ok(r.json.reason.indexOf('portaoHandoff') !== -1, 'faltou o motivo do handoff: ' + r.json.reason);
    const c = sessaoDe(tmp, 'h-sub').contadores;
    assert.strictEqual(c.subitem_pendente, 1);
    assert.strictEqual(c.handoff_sem_prompt, 1);
  });
});

test('D412: saude dispara no turno que gravou o handoff e colou o prompt -> nao manda colar de novo', () => {
  comTmp((tmp) => {
    const dir = projetoQueDispara(tmp, 'h-saude');
    gravar(tmp, 'h-saude', dir, 'Write', HANDOFF);
    const r = fecho(tmp, 'h-saude', dir, PROMPT);
    const t = r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.additionalContext;
    assert.ok(t, 'controle: a saude tinha de disparar: ' + r.stdout);
    assert.ok(!/Cole o prompt/.test(t) && /nao cole/.test(t), 'mandou colar de novo: ' + t);
    // controle: sem handoff no turno, a ordem de rodar e colar segue
    const dir2 = projetoQueDispara(tmp, 'h-saude2');
    gravar(tmp, 'h-saude2', dir2, 'Edit', 'notas.md');
    const r2 = fecho(tmp, 'h-saude2', dir2, PROMPT);
    assert.ok(/Cole o prompt/.test(r2.json.hookSpecificOutput.additionalContext), r2.stdout);
  });
});

// D417: o README diz que, com o portao desligado e a resposta sem bloco, o aviso segue mandando colar.
test('D417: portaoHandoff false, handoff gravado sem bloco e a saude dispara -> nao barra e manda colar', () => {
  comTmp((tmp) => {
    const dir = projetoCom(tmp, 'h-desl-saude', { portaoHandoff: false, limiares: { turnosComTrabalho: 1 } });
    gravar(tmp, 'h-desl-saude', dir, 'Write', HANDOFF);
    const r = fecho(tmp, 'h-desl-saude', dir, 'Handoff gravado no arquivo.');
    assert.ok(r.json && r.json.decision !== 'block', 'com o portao desligado nada barra: ' + r.stdout);
    const t = r.json.hookSpecificOutput && r.json.hookSpecificOutput.additionalContext;
    assert.ok(t, 'controle: a saude tinha de disparar: ' + r.stdout);
    assert.ok(/Cole o prompt/.test(t) && !/nao cole/.test(t), 'sem bloco na resposta, o aviso tem de mandar colar: ' + t);
  });
});

// PT-01 (lote 2, D422): o subitem aberto cobrado e o da tarefa que o agente DISSE ter concluido,
// nao o da primeira tarefa com caixa aberta do plano.
const SAIDA = '\n```text\n3 passed\n```';

function planoComTarefas(tmp, nome, texto, ativoExtra) {
  const dir = projetoCom(tmp, nome);
  fs.writeFileSync(path.join(dir, 'plano.md'), texto, 'utf8');
  fs.writeFileSync(path.join(dir, '.claude', 'esquadro', 'plano-ativo.json'),
    JSON.stringify(Object.assign({ arquivo: 'plano.md', sessionId: nome, tarefa: null }, ativoExtra || {})), 'utf8');
  gravar(tmp, nome, dir, 'Write', 'a.js');
  return dir;
}

const DUAS = '## Tarefa 1: primeira\n- [x] a\n- [x] b\n\n## Tarefa 2: segunda (futura)\n- [ ] c\n- [ ] d\n- [ ] e\n';

test('PT-01: alegar a Tarefa 1 concluida com a Tarefa 2 futura aberta NAO cobra a Tarefa 2', () => {
  comTmp((tmp) => {
    const dir = planoComTarefas(tmp, 'pt1a', DUAS);
    const r = fecho(tmp, 'pt1a', dir, 'A Tarefa 1 esta concluida.' + SAIDA);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.json || r.json.decision !== 'block', 'cobrou a tarefa futura: ' + r.stdout);
  });
});

test('PT-01: alegacao acentuada ("A Tarefa 1 está concluída.") tambem nao cobra a Tarefa 2 futura', () => {
  comTmp((tmp) => {
    const dir = planoComTarefas(tmp, 'pt1c', DUAS);
    const r = fecho(tmp, 'pt1c', dir, 'A Tarefa 1 está concluída.' + SAIDA);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.json || r.json.decision !== 'block', 'cobrou a tarefa futura: ' + r.stdout);
  });
});

test('PT-01: alegacao acentuada ("A Tarefa 1 está concluída.") com caixa aberta NA Tarefa 1 bloqueia', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n- [ ] b\n\n## Tarefa 2: segunda\n- [ ] c\n';
    const dir = planoComTarefas(tmp, 'pt1f', texto);
    const r = fecho(tmp, 'pt1f', dir, 'A Tarefa 1 está concluída.' + SAIDA);
    assert.ok(r.json && r.json.decision === 'block', r.stdout);
    assert.ok(/Tarefa 1 \("primeira"\)/.test(r.json.reason), r.json.reason);
  });
});

test('PT-01: alegar a Tarefa 1 concluida com caixa aberta NA Tarefa 1 continua bloqueando', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n- [ ] b\n\n## Tarefa 2: segunda\n- [ ] c\n';
    const dir = planoComTarefas(tmp, 'pt1b', texto);
    const r = fecho(tmp, 'pt1b', dir, 'A Tarefa 1 esta concluida.' + SAIDA);
    assert.ok(r.json && r.json.decision === 'block', r.stdout);
    assert.ok(/Tarefa 1 \("primeira"\)/.test(r.json.reason), r.json.reason);
    assert.ok(/1 de 2 passos/.test(r.json.reason), r.json.reason);
  });
});

test('PT-01: alegar a Tarefa 2 concluida cobra a Tarefa 2, mesmo com a 1 aberta antes dela', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [ ] a\n\n## Tarefa 2: segunda\n- [x] b\n- [ ] c\n';
    const dir = planoComTarefas(tmp, 'pt1c', texto);
    const r = fecho(tmp, 'pt1c', dir, 'Fechei a etapa 2.' + SAIDA);
    assert.ok(r.json && r.json.decision === 'block', r.stdout);
    assert.ok(/Tarefa 2 \("segunda"\)/.test(r.json.reason), r.json.reason);
  });
});

test('PT-01: sem numero na alegacao, a tarefa em andamento (ultima com caixa marcada) e a cobrada, nao a primeira aberta', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n- [x] b\n\n## Tarefa 2: segunda (futura)\n- [ ] c\n- [ ] d\n';
    const dir = planoComTarefas(tmp, 'pt1d', texto);
    const r = fecho(tmp, 'pt1d', dir, 'A etapa esta concluida.' + SAIDA);
    assert.ok(!r.json || r.json.decision !== 'block', 'cobrou a tarefa futura sem numero: ' + r.stdout);
    // controle: com a Tarefa 2 em andamento (caixa marcada), ela e a cobrada
    const dir2 = planoComTarefas(tmp, 'pt1e', texto.replace('- [ ] c', '- [x] c'));
    const r2 = fecho(tmp, 'pt1e', dir2, 'A etapa esta concluida.' + SAIDA);
    assert.ok(r2.json && r2.json.decision === 'block' && /Tarefa 2 \("segunda/.test(r2.json.reason), r2.stdout);
  });
});

test('PT-01: sem numero na alegacao, o campo tarefa do plano-ativo.json diz qual cobrar', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n\n## Tarefa 2: segunda\n- [x] b\n- [ ] c\n';
    const dir = planoComTarefas(tmp, 'pt1f', texto, { tarefa: 1 });
    const r = fecho(tmp, 'pt1f', dir, 'A etapa esta concluida.' + SAIDA);
    assert.ok(!r.json || r.json.decision !== 'block', 'ignorou ativo.tarefa: ' + r.stdout);
  });
});

// PT-01 (ronda 2 da revisao cega): a tarefa em andamento toda fechada nao esconde um subitem esquecido
// numa tarefa ANTERIOR; a futura intocada (depois do andamento) segue sem ser cobrada.
test('PT-01 R2: sem numero, andamento todo fechado cobra a tarefa anterior com caixa esquecida (e nao a futura)', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n- [x] b\n- [ ] esquecido\n\n## Tarefa 2: segunda\n- [x] c\n- [x] d\n\n## Tarefa 3: terceira (futura)\n- [ ] e\n';
    const dir = planoComTarefas(tmp, 'pt1j', texto);
    const r = fecho(tmp, 'pt1j', dir, 'Fechei a etapa.' + SAIDA);
    assert.ok(r.json && r.json.decision === 'block', 'passou com subitem esquecido na Tarefa 1: ' + r.stdout);
    assert.ok(/Tarefa 1 \("primeira"\)/.test(r.json.reason), r.json.reason);
    // controle: sem o subitem esquecido, so a futura esta aberta e nada e cobrado
    const dir2 = planoComTarefas(tmp, 'pt1k', texto.replace('- [ ] esquecido', '- [x] esquecido'));
    const r2 = fecho(tmp, 'pt1k', dir2, 'Fechei a etapa.' + SAIDA);
    assert.ok(!r2.json || r2.json.decision !== 'block', 'cobrou a tarefa futura: ' + r2.stdout);
  });
});

// PT-01 (ronda 1 da revisao cega, F1): numero citado que NAO existe no plano nao e conferivel; a
// alegacao cai como sem numero (ativo.tarefa -> andamento -> primeira aberta) em vez de passar.
const TRES = '## Tarefa 1: primeira\n- [x] a\n\n## Tarefa 2: segunda\n- [x] b\n- [ ] c\n\n## Tarefa 3: terceira\n- [ ] d\n';

test('PT-01 F1: alegar uma etapa que nao existe no plano cobra a tarefa em andamento', () => {
  comTmp((tmp) => {
    const dir = planoComTarefas(tmp, 'pt1g', TRES);
    const r = fecho(tmp, 'pt1g', dir, 'Fechei a etapa 7.' + SAIDA);
    assert.ok(r.json && r.json.decision === 'block', 'passou com numero inexistente: ' + r.stdout);
    assert.ok(/Tarefa 2 \("segunda"\)/.test(r.json.reason), r.json.reason);
  });
});

test('PT-01 F1: numero citado que EXISTE e esta fechado continua sem cobrar, mesmo citado junto de um inexistente', () => {
  comTmp((tmp) => {
    const dir = planoComTarefas(tmp, 'pt1h', TRES);
    const r = fecho(tmp, 'pt1h', dir, 'A Tarefa 1 esta concluida.' + SAIDA);
    assert.ok(!r.json || r.json.decision !== 'block', 'cobrou alegacao verdadeira: ' + r.stdout);
    const dir2 = planoComTarefas(tmp, 'pt1i', TRES);
    const r2 = fecho(tmp, 'pt1i', dir2, 'Fechei a etapa 7. A Tarefa 1 esta concluida.' + SAIDA);
    assert.ok(!r2.json || r2.json.decision !== 'block', 'cobrou com um numero existente e fechado: ' + r2.stdout);
  });
});

// Bloco S6 (fase P2, D426). `RE_ALEGA_N` mora num script que le stdin ao ser carregado e nao exporta
// nada: o teste le a fonte e avalia so o literal do array.
function reAlegaN() {
  const fonte = fs.readFileSync(path.join(RAIZ, 'scripts', 'portao-fecho.js'), 'utf8');
  const achou = fonte.match(/const RE_ALEGA_N = (\[[\s\S]*?\n\]);/);
  assert.ok(achou, 'RE_ALEGA_N nao encontrada em scripts/portao-fecho.js');
  return new Function('return ' + achou[1])();
}

function numerosCitados(texto) {
  const out = [];
  for (const re of reAlegaN()) {
    const r = new RegExp(re.source, re.flags);
    let m;
    // D442/8: espelha numerosDaAlegacao do portao-fecho.js - so o numero inteiro puro ("7b" e "1.2" nao sao Tarefa N).
    while ((m = r.exec(texto)) !== null) {
      (m[1].match(/\d+(?:\.\d+)*[a-z]?/gi) || []).filter((d) => /^\d+$/.test(d)).forEach((d) => out.push(parseInt(d, 10)));
    }
  }
  return out;
}

// D442/8 (S-47, S-48): "vou concluir a tarefa" contava como alegacao (bloqueio a toa); "Tarefa 3: concluida",
// "tarefa n. 3", "ja concluida", "onda 7b", "tarefa 1.2" nao eram lidos (etapa nao cobrada - os planos do dono
// usam "onda"). Id que o parser do plano nao modela (7b, 1.2) alega SEM numero: cai na tarefa em andamento.
test('D442/8: infinitivo e gerundio nao alegam; dois-pontos, nº, ja, onda 7b e tarefa 1.2 alegam', () => {
  const plano = require('../scripts/lib/plano.js');
  const alegam = [
    { texto: 'Tarefa 3: concluída.', n: [3] },
    { texto: 'Tarefa 3 - concluída.', n: [3] },
    { texto: 'Tarefa 3 — fechada.', n: [3] },
    { texto: 'A tarefa nº 3 foi concluída.', n: [3] },
    { texto: 'A tarefa n. 3 foi concluída.', n: [3] },
    { texto: 'A tarefa 3 já está concluída.', n: [3] },
    { texto: 'A tarefa 3 já concluída, sigo.', n: [3] },
    { texto: 'A onda 7b concluída.', n: [] },
    { texto: 'Onda 7b: fechada.', n: [] },
    { texto: 'Tarefa 1.2 concluída.', n: [] },
    { texto: 'Concluí a onda 7b.', n: [] },
    { texto: 'Fechei a tarefa 1.2 e tarefa 2.', n: [2] },
    { texto: 'Concluímos as tarefas 1 e 2.', n: [1, 2] },
    { texto: 'Fechada a etapa 4.', n: [4] }
  ];
  for (const c of alegam) {
    assert.strictEqual(plano.alegaEtapaConcluida(c.texto), true, 'devia alegar: ' + c.texto);
    assert.deepStrictEqual(numerosCitados(c.texto), c.n, 'numero extraido: ' + c.texto);
  }
  for (const t of ['Vou concluir a tarefa 3.', 'Antes de fechar a etapa, rodo a suite.', 'Estou finalizando a fase 2.',
    'Para completar a onda 7b falta o teste.', 'Concluindo a tarefa 3 agora.', 'Falta fechar as tarefas 1 e 2.',
    'Preciso concluir a etapa.', 'Tarefa 3: completar os testes.', 'Etapa 2 - completando a migracao.']) {
    assert.strictEqual(plano.alegaEtapaConcluida(t), false, 'nao devia alegar: ' + t);
    assert.deepStrictEqual(numerosCitados(t), [], t);
  }
});

test('D442/8: "Tarefa 1: concluida." com caixa aberta na 1 bloqueia; "onda 7b concluida" nao cobra a Tarefa 7', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n- [ ] b\n';
    const d1 = planoComTarefas(tmp, 'd8a', texto);
    const r1 = fecho(tmp, 'd8a', d1, 'Tarefa 1: concluída.' + SAIDA);
    assert.ok(r1.json && r1.json.decision === 'block' && /Tarefa 1 \("primeira"\)/.test(r1.json.reason), r1.stdout);
    // "7b" nao e a Tarefa 7: sem numero, a cobrada e a em andamento (a 6, com caixa marcada e aberta)
    const sete = '## Tarefa 6: seis\n- [x] a\n- [ ] b\n\n## Tarefa 7: sete\n- [ ] c\n';
    const d2 = planoComTarefas(tmp, 'd8b', sete);
    const r2 = fecho(tmp, 'd8b', d2, 'A onda 7b concluída.' + SAIDA);
    assert.ok(r2.json && r2.json.decision === 'block' && /Tarefa 6 \("seis"\)/.test(r2.json.reason), r2.stdout);
    // controle: intencao no futuro nao e alegacao e nao barra pelo subitem
    const d3 = planoComTarefas(tmp, 'd8c', texto);
    const r3 = fecho(tmp, 'd8c', d3, 'Vou concluir a tarefa 1 agora.' + SAIDA);
    assert.ok(!r3.json || !/subitem pendente/.test(r3.json.reason || ''), r3.stdout);
  });
});

test('L2-fec-1: RE_ALEGA_N concorda com plano.alegaEtapaConcluida (paridade) e extrai o numero certo', () => {
  const plano = require('../scripts/lib/plano.js');
  const nomes = ['tarefa', 'etapa', 'onda', 'fase'];
  const casos = [];
  for (const nome of nomes) {
    for (const aux of ['', 'esta ', 'está ', 'foi ']) {
      for (const p of ['concluida', 'concluído', 'fechada', 'finalizado', 'pronta', 'completa']) {
        casos.push({ texto: 'A ' + nome + ' 3 ' + aux + p + '.', n: 3 });
        casos.push({ texto: 'A ' + nome + ' ' + aux + p + '.', n: null });
      }
    }
    for (const verbo of ['concluí', 'conclui', 'fechei', 'fechou', 'finalizei', 'completamos']) {
      casos.push({ texto: 'Eu ' + verbo + ' a ' + nome + ' 3.', n: 3 });
      casos.push({ texto: 'Eu ' + verbo + ' o ' + nome + '.', n: null });
    }
  }
  // N2 (D426): plural e lista, nas duas formas e com os auxiliares plurais.
  casos.push(
    { texto: 'Tarefas 1 e 2 concluidas.', n: [1, 2] },
    { texto: 'As etapas 3, 4 e 5 fechadas.', n: [3, 4, 5] },
    { texto: 'As tarefas 1 e 2 estão concluídas.', n: [1, 2] },
    { texto: 'As tarefas 1 e 2 foram concluídas.', n: [1, 2] },
    { texto: 'As fases 6 e 7 estao prontas.', n: [6, 7] },
    { texto: 'Concluí as tarefas 1 e 2.', n: [1, 2] },
    { texto: 'Fechamos as etapas 3, 4 e 5.', n: [3, 4, 5] },
    { texto: 'Finalizei as fases 8 e 9.', n: [8, 9] },
    { texto: 'As fases concluídas.', n: null },
    { texto: 'Concluí as ondas.', n: null }
  );
  assert.ok(casos.length > 200, 'corpus pequeno demais: ' + casos.length);
  for (const c of casos) {
    assert.strictEqual(plano.alegaEtapaConcluida(c.texto), true, 'o corpus supoe que alega: ' + c.texto);
    const esperado = c.n === null ? [] : Array.isArray(c.n) ? c.n : [c.n];
    assert.deepStrictEqual(numerosCitados(c.texto), esperado, 'numero extraido: ' + c.texto);
  }
  // controles: o que nao alega nao pode render numero
  for (const t of ['A tarefa 3 esta pendente.', 'Abri a tarefa 3.', 'O chamado 3 foi fechado.', 'Tarefa 3 em andamento.',
    'As tarefas 1 e 2 ainda não foram concluídas.', 'Tarefas 1 e 2 pendentes.', 'Abri as tarefas 1 e 2.']) {
    assert.strictEqual(plano.alegaEtapaConcluida(t), false, t);
    assert.deepStrictEqual(numerosCitados(t), [], t);
  }
});

test('L2-fec-2: alegacao com mais de um numero ("tarefa 1 e 2") cobra todos, nao so o primeiro ou o ultimo', () => {
  comTmp((tmp) => {
    const texto = '## Tarefa 1: primeira\n- [x] a\n\n## Tarefa 2: segunda\n- [x] b\n- [ ] c\n';
    const frases = ['Fechei a tarefa 1 e 2.', 'Fechei a tarefa 1, 2.', 'A Tarefa 1 e Tarefa 2 concluidas.'];
    frases.forEach((frase, i) => {
      const id = 'lf2-' + i;
      const dir = planoComTarefas(tmp, id, texto);
      const r = fecho(tmp, id, dir, frase + SAIDA);
      assert.ok(r.json && r.json.decision === 'block', frase + ' passou com a Tarefa 2 aberta: ' + r.stdout);
      assert.ok(/Tarefa 2 \("segunda"\)/.test(r.json.reason), r.json.reason);
    });
    // controle: citar so a tarefa fechada continua sem cobrar a outra
    const dir = planoComTarefas(tmp, 'lf2-c', texto);
    const r = fecho(tmp, 'lf2-c', dir, 'Fechei a tarefa 1.' + SAIDA);
    assert.ok(!r.json || r.json.decision !== 'block', 'cobrou tarefa nao citada: ' + r.stdout);
  });
});

test('L2-fec-7: RE_ALEGA_N nao degrada com uma sequencia longa de espacos (tempo linear)', () => {
  const sp = ' '.repeat(50000);
  const entradas = ['fechei' + sp + 'x', 'fechei' + sp + 'a' + sp + 'x', 'tarefa' + sp + '1' + sp + 'x', 'tarefa 1' + sp + 'x'];
  for (const re of reAlegaN()) {
    for (const t of entradas) {
      const r = new RegExp(re.source, re.flags);
      const ini = process.hrtime.bigint();
      r.exec(t);
      const ms = Number(process.hrtime.bigint() - ini) / 1e6;
      assert.ok(ms < 500, 'backtracking: ' + ms.toFixed(0) + ' ms em ' + re.source.slice(0, 30));
    }
  }
});

test('L2-fec-8: os ramos de tarefaACobrar que nenhum teste tocava - nada andou, ativo.tarefa aberta, ativo.tarefa inexistente', () => {
  comTmp((tmp) => {
    // nada andou (nenhuma caixa marcada): a primeira aberta e a cobrada
    const nada = '## Tarefa 1: primeira\n- [ ] a\n\n## Tarefa 2: segunda\n- [ ] b\n';
    const d1 = planoComTarefas(tmp, 'lf8a', nada);
    const r1 = fecho(tmp, 'lf8a', d1, 'A etapa esta concluida.' + SAIDA);
    assert.ok(r1.json && r1.json.decision === 'block' && /Tarefa 1 \("primeira"\)/.test(r1.json.reason), r1.stdout);
    // ativo.tarefa aponta para uma tarefa aberta: ela manda, mesmo com outra aberta antes
    const d2 = planoComTarefas(tmp, 'lf8b', nada, { tarefa: 2 });
    const r2 = fecho(tmp, 'lf8b', d2, 'A etapa esta concluida.' + SAIDA);
    assert.ok(r2.json && r2.json.decision === 'block' && /Tarefa 2 \("segunda"\)/.test(r2.json.reason), r2.stdout);
    // ativo.tarefa que nao existe no plano e ignorado: cai na tarefa em andamento
    const d3 = planoComTarefas(tmp, 'lf8c', TRES, { tarefa: 9 });
    const r3 = fecho(tmp, 'lf8c', d3, 'A etapa esta concluida.' + SAIDA);
    assert.ok(r3.json && r3.json.decision === 'block' && /Tarefa 2 \("segunda"\)/.test(r3.json.reason), r3.stdout);
  });
});

test('S52-fec-1: plano ativo que nao pode ser lido nao passa calado - o fecho avisa que nao conferiu', () => {
  comTmp((tmp) => {
    const dir = planoComTarefas(tmp, 'sf1a', DUAS, { arquivo: 'plano-que-sumiu.md' });
    const r = fecho(tmp, 'sf1a', dir, 'A Tarefa 2 esta concluida.' + SAIDA);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.json && /nao pode ser lido/.test(r.json.systemMessage || ''), 'passou calado: ' + r.stdout);
    assert.ok(r.json.decision !== 'block', 'plano ilegivel nao pode barrar: ' + r.stdout);
    // quando o fecho barra por outro motivo (sem evidencia), o aviso viaja no mesmo bloqueio
    const dir2 = planoComTarefas(tmp, 'sf1b', DUAS, { arquivo: 'plano-que-sumiu.md' });
    const r2 = fecho(tmp, 'sf1b', dir2, 'A Tarefa 2 esta concluida.');
    assert.ok(r2.json && r2.json.decision === 'block' && /nao pode ser lido/.test(r2.json.reason), r2.stdout);
    // controle: plano legivel nao emite o aviso
    const dir3 = planoComTarefas(tmp, 'sf1c', DUAS);
    const r3 = fecho(tmp, 'sf1c', dir3, 'A Tarefa 1 esta concluida.' + SAIDA);
    assert.ok(!r3.json || !/nao pode ser lido/.test(r3.json.systemMessage || ''), 'avisou com plano legivel: ' + r3.stdout);
  });
});
