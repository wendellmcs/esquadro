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
