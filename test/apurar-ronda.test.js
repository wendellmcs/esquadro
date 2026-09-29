'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

/** D120: o apurador e CLI, nao hook. Ele descobre a sessao por --sessao ou pelo ambiente. */
function rodar(args, cwd, tmp, extraEnv) {
  const env = Object.assign({}, process.env, { ESQUADRO_TMP: tmp }, extraEnv || {});
  delete env.CLAUDE_CODE_SESSION_ID;
  if (extraEnv && extraEnv.CLAUDE_CODE_SESSION_ID) env.CLAUDE_CODE_SESSION_ID = extraEnv.CLAUDE_CODE_SESSION_ID;
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'apurar-ronda.js')].concat(args || []), {
    cwd: cwd, encoding: 'utf8', env: env
  });
  let json = null;
  if (r.stdout && r.stdout.trim()) { try { json = JSON.parse(r.stdout); } catch (e) { json = null; } }
  return { status: r.status, stdout: r.stdout, json: json };
}

function comTmp(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-apurar-'));
  try { fn(base); } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

/** Escreve <cwd>/.claude/esquadro/revisao/<n>/vereditos/<lente>.json */
function gravarRonda(cwd, n, vereditos) {
  const dir = path.join(cwd, '.claude', 'esquadro', 'revisao', String(n), 'vereditos');
  fs.mkdirSync(dir, { recursive: true });
  for (const v of vereditos) {
    fs.writeFileSync(path.join(dir, v.lente + '.json'), JSON.stringify(v), 'utf8');
  }
}

function gravarMapa(cwd, n, mapa) {
  const dir = path.join(cwd, '.claude', 'esquadro', 'revisao', String(n));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mapa.json'), JSON.stringify({ arquivo: 'src/a.js', mapa: mapa }), 'utf8');
}

// D244/defeito 3: a forma da onda 7 - todo P1 do lado antigo, nenhum do novo - fecha por
// duas secas, e nao pelo teto. Fixture sintetica: os vereditos reais citam o produto.
test('D244/defeito 3: pelo CLI, P1 so do lado antigo fecha por duas rondas secas', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-apurar-lado-'));
    const vd = (arq, linha) => ({ lente: 'design', melhor: 'A',
      achados: [{ severidade: 'P1', arquivo: arq, linha: linha, descricao: 'valor cru' }] });
    gravarMapa(cwd, 1, { A: 'trabalho', B: 'HEAD' });
    gravarRonda(cwd, 1, [vd('B.txt', 379)]);
    gravarMapa(cwd, 2, { A: 'HEAD', B: 'trabalho' });
    gravarRonda(cwd, 2, [vd('A.txt', 471)]);
    const r = rodar(['--sessao', 'lado'], cwd, tmp);
    assert.strictEqual(r.status, 0, r.stdout);
    assert.strictEqual(r.json.encerrar, true, r.stdout);
    assert.strictEqual(r.json.motivo, 'duas rondas secas seguidas: aprovado');
    assert.strictEqual(r.json.achadosDoLadoAntigo.length, 1);
  });
});

test('D244/defeito 3: pelo CLI, refutados.json sem prova para com erro', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-apurar-ref-'));
    gravarMapa(cwd, 1, { A: 'trabalho', B: 'HEAD' });
    gravarRonda(cwd, 1, [{ lente: 'design', melhor: 'A',
      achados: [{ severidade: 'P1', arquivo: 'A.txt', linha: 3, descricao: 'x' }] }]);
    fs.writeFileSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'refutados.json'),
      JSON.stringify([{ ronda: 1, lente: 'design', arquivo: 'A.txt', linha: 3 }]), 'utf8');
    const r = rodar(['--sessao', 'ref'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /prova/);
  });
});

function contadorDe(tmp, sessionId) {
  const arquivo = path.join(tmp, 'esquadro', sessionId + '.json');
  try {
    const s = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return (s.contadores && s.contadores.revisao_fechada) || 0;
  } catch (e) {
    return 0;
  }
}

test('apurar-ronda: revisao que encerra soma +1 em revisao_fechada (D21)', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-repo-'));
    try {
      gravarRonda(cwd, 1, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      gravarRonda(cwd, 2, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      const r = rodar(['--sessao', 's1'], cwd, tmp);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.json.encerrar, true, 'duas rondas secas tinham de encerrar');
      assert.strictEqual(contadorDe(tmp, 's1'), 1, 'revisao fechada conta exatamente 1');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test('apurar-ronda: revisao que NAO encerra nao conta (contador inflado e D14 sem base)', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-repo-'));
    try {
      gravarRonda(cwd, 1, [{
        lente: 'correcao', melhor: 'A',
        achados: [{ severidade: 'P1', arquivo: 'x.js', linha: 10, o_que: 'quebra' }]
      }]);
      const r = rodar(['--sessao', 's1'], cwd, tmp);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.json.encerrar, false, 'ronda 1 com P1 novo nao encerra');
      assert.strictEqual(contadorDe(tmp, 's1'), 0, 'nao fechou, nao conta');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test('apurar-ronda: sem --sessao, a sessao vem de CLAUDE_CODE_SESSION_ID', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-repo-'));
    try {
      gravarRonda(cwd, 1, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      gravarRonda(cwd, 2, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      const r = rodar([], cwd, tmp, { CLAUDE_CODE_SESSION_ID: 'da-env' });
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.json.encerrar, true);
      assert.strictEqual(contadorDe(tmp, 'da-env'), 1, 'contou na sessao que veio do ambiente');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// Ronda 1 do 8c.5: o veredito que nao se le virava empate sem achados, passava na
// validacao e contava a ronda como seca. Um voto que falta nao e voto a favor.
test('apurar-ronda: veredito ilegivel para a apuracao, nomeia o arquivo e nao conta a revisao', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-repo-'));
    try {
      gravarRonda(cwd, 1, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      gravarRonda(cwd, 2, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      fs.writeFileSync(path.join(cwd, '.claude', 'esquadro', 'revisao', '2', 'vereditos', 'seguranca.json'),
        '{ "lente": "seguranca", "melhor": ', 'utf8');
      const r = rodar(['--sessao', 's1'], cwd, tmp);
      assert.strictEqual(r.status, 1, 'ronda com voto ilegivel nao pode sair 0: ' + r.stdout);
      assert.strictEqual(r.json, null, 'nao pode sair apuracao com um voto faltando: ' + r.stdout);
      assert.ok(r.stdout.includes('.claude/esquadro/revisao/2/vereditos/seguranca.json'),
        'a mensagem tem de nomear o arquivo ilegivel: ' + r.stdout);
      assert.ok(/regrave/i.test(r.stdout), 'a mensagem tem de dizer o que fazer: ' + r.stdout);
      assert.strictEqual(contadorDe(tmp, 's1'), 0, 'revisao que nao se apurou nao fecha');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// Ronda 2 do 8c.10: o que se le mas nao e veredito - nao e objeto, nao tem lente, o melhor nao
// e A, B nem empate, ou os achados faltam ou nao sao lista - contava como voto sem achado e
// deixava a ronda seca. Para como o ilegivel. O achado invalido dentro de um veredito bom
// segue so descartado: um achado mal citado nao trava a ronda.
test('apurar-ronda: o que se le mas nao e veredito para a apuracao, e diz por que', () => {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-repo-'));
    try {
      gravarRonda(cwd, 1, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      gravarRonda(cwd, 2, [{ lente: 'correcao', melhor: 'B', achados: [] }]);
      const dir = path.join(cwd, '.claude', 'esquadro', 'revisao', '2', 'vereditos');
      const falsos = {
        'estados.json': ['{}', ['sem lente', 'melhor', 'achados']],
        'seguranca.json': ['null', ['nao e objeto']],
        'borda.json': ['{ "lente": "borda", "melhor": "talvez", "achados": [] }', ['melhor']],
        'medidor.json': ['{ "melhor": "empate", "achados": [] }', ['sem lente']],
        'escopo.json': ['{ "lente": "escopo", "melhor": "empate" }', ['achados']],
        'design.json': ['{ "lente": "design", "melhor": "empate", "achados": 5 }', ['achados']]
      };
      for (const [f, [txt]] of Object.entries(falsos)) fs.writeFileSync(path.join(dir, f), txt, 'utf8');
      let r = rodar(['--sessao', 's1'], cwd, tmp);
      assert.strictEqual(r.status, 1, 'ronda com voto que nao e veredito nao pode sair 0: ' + r.stdout);
      assert.strictEqual(r.json, null, 'nao pode sair apuracao com um voto faltando: ' + r.stdout);
      const linhas = r.stdout.split('\n');
      for (const [f, [, motivos]] of Object.entries(falsos)) {
        const l = linhas.find((x) => x.includes('.claude/esquadro/revisao/2/vereditos/' + f));
        assert.ok(l && l.startsWith('ERRO:'), 'a mensagem tem de nomear ' + f + ': ' + r.stdout);
        const ditos = l.slice(l.indexOf(f) + f.length + 2).split('; ');
        assert.strictEqual(ditos.length, motivos.length, f + ' diz os seus motivos, e so eles: ' + l);
        for (const m of motivos) assert.ok(ditos.some((d) => d.includes(m)), f + ' tem de dizer "' + m + '": ' + l);
      }
      assert.ok(/regrave/i.test(r.stdout), 'a mensagem tem de dizer o que fazer: ' + r.stdout);
      assert.strictEqual(contadorDe(tmp, 's1'), 0, 'revisao que nao se apurou nao fecha');

      for (const f of Object.keys(falsos)) fs.rmSync(path.join(dir, f));
      fs.writeFileSync(path.join(dir, 'borda.json'), JSON.stringify({ lente: 'borda', melhor: 'empate',
        achados: [{ severidade: 'P1', descricao: 'sem lugar' }] }), 'utf8');
      r = rodar(['--sessao', 's2'], cwd, tmp);
      assert.strictEqual(r.status, 0, 'achado invalido em veredito bom nao para a apuracao: ' + r.stdout);
      assert.ok(r.json && r.json.vereditosDescartados.some((e) => e.includes('sem lugar')),
        'o achado sem arquivo:linha segue descartado: ' + r.stdout);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// T2 / itens 11 e 12 da D257 (secao 11). Os testes de cima sao do FORMATO ANTIGO (0.3.0): pasta
// numerada solta em revisao/. Daqui para baixo, a base e uma por arquivo: revisao/<id>/<n>/.
// ---------------------------------------------------------------------------------------------

const SECO = { lente: 'correcao', melhor: 'B', achados: [] };
const P1_NOVO = { lente: 'correcao', melhor: 'A',
  achados: [{ severidade: 'P1', arquivo: 'A.txt', linha: 3, descricao: 'quebra' }] };

/** Grava revisao/<id>/<n>/ com vereditos e mapa.json (A = trabalho, B = HEAD). */
function gravarNaBase(cwd, id, arquivo, n, vereditos) {
  const dir = path.join(cwd, '.claude', 'esquadro', 'revisao', id, String(n));
  fs.mkdirSync(path.join(dir, 'vereditos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mapa.json'),
    JSON.stringify({ arquivo: arquivo, mapa: { A: 'trabalho', B: 'HEAD' } }), 'utf8');
  for (const v of vereditos) fs.writeFileSync(path.join(dir, 'vereditos', v.lente + '.json'), JSON.stringify(v), 'utf8');
}

function comRepo(fn) {
  comTmp((tmp) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-bases-'));
    try { fn(cwd, tmp); } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
  });
}

test('T2/item 11: --arquivo apura so a base dele, e a saida diz de qual arquivo e', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    gravarNaBase(cwd, 'src__b.js', 'src/b.js', 1, [P1_NOVO]);
    const a = rodar(['--sessao', 'ba', '--arquivo', 'src/a.js'], cwd, tmp);
    assert.strictEqual(a.status, 0, a.stdout);
    assert.strictEqual(a.json.encerrar, true, 'a base de a.js tem duas secas');
    assert.strictEqual(a.json.arquivo, 'src/a.js');
    assert.strictEqual(a.json.ronda, 2);
    const b = rodar(['--sessao', 'bb', '--arquivo', 'src/b.js'], cwd, tmp);
    assert.strictEqual(b.status, 0, b.stdout);
    assert.strictEqual(b.json.encerrar, false, 'a base de b.js tem P1 novo e uma ronda so');
    assert.strictEqual(b.json.arquivo, 'src/b.js');
    assert.strictEqual(b.json.ronda, 1, 'a ronda de b.js nao soma as de a.js');
    assert.strictEqual(contadorDe(tmp, 'bb'), 0);
  });
});

test('T2/item 11: --arquivo com barra invertida e normalizado como no preparar-revisao', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__b.js', 'src/b.js', 1, [P1_NOVO]);
    const r = rodar(['--sessao', 'bs', '--arquivo', 'src\\a.js'], cwd, tmp);
    assert.strictEqual(r.status, 0, r.stdout);
    assert.strictEqual(r.json.arquivo, 'src/a.js');
    assert.strictEqual(r.json.rondasSecas, 1);
  });
});

test('T2/item 11: sem --arquivo e com duas bases, para com erro que lista os dois arquivos', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    gravarNaBase(cwd, 'src__b.js', 'src/b.js', 1, [SECO]);
    const r = rodar(['--sessao', 'dois'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.strictEqual(r.json, null, 'sem apuracao: ' + r.stdout);
    assert.ok(r.stdout.startsWith('ERRO:'), r.stdout);
    assert.ok(r.stdout.includes('src/a.js') && r.stdout.includes('src/b.js'), 'lista os dois arquivos: ' + r.stdout);
    assert.ok(r.stdout.includes('--arquivo'), 'diz o que passar: ' + r.stdout);
    assert.strictEqual(contadorDe(tmp, 'dois'), 0, 'nao apurou, nao conta');
  });
});

test('T2/item 11: sem --arquivo e com uma base so, a base e achada sozinha', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    const r = rodar(['--sessao', 'uma'], cwd, tmp);
    assert.strictEqual(r.status, 0, r.stdout);
    assert.strictEqual(r.json.encerrar, true);
    assert.strictEqual(r.json.arquivo, 'src/a.js');
  });
});

test('T2/item 11: revisao/ sem nenhuma ronda da o erro de "nao ha revisao"', () => {
  comRepo((cwd, tmp) => {
    fs.mkdirSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js'), { recursive: true });
    const r = rodar(['--sessao', 'zero'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /nao ha revisao/);
  });
});

test('T2/item 11: veredito ilegivel ou invalido numa base nomeia o caminho da base, nao o da pasta plana', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    const dir = path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js', '2', 'vereditos');
    fs.writeFileSync(path.join(dir, 'borda.json'), '{ "lente": ', 'utf8');
    const r = rodar(['--sessao', 'ile'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(r.stdout.includes('.claude/esquadro/revisao/src__a.js/2/vereditos/borda.json'), r.stdout);
    fs.rmSync(path.join(dir, 'borda.json'));
    fs.writeFileSync(path.join(dir, 'escopo.json'), JSON.stringify({ lente: 'escopo', melhor: 'talvez', achados: [] }), 'utf8');
    const r2 = rodar(['--sessao', 'inv'], cwd, tmp);
    assert.strictEqual(r2.status, 1, r2.stdout);
    assert.ok(r2.stdout.includes('.claude/esquadro/revisao/src__a.js/2/vereditos/escopo.json'), r2.stdout);
  });
});

test('T2/item 11: o refutados.json e lido da base escolhida', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [P1_NOVO]);
    gravarNaBase(cwd, 'src__b.js', 'src/b.js', 1, [SECO]);
    fs.writeFileSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js', 'refutados.json'),
      JSON.stringify([{ ronda: 1, lente: 'correcao', arquivo: 'A.txt', linha: 3, severidade: 'P1', prova: 'x.js:9' }]), 'utf8');
    const r = rodar(['--sessao', 'rf', '--arquivo', 'src/a.js'], cwd, tmp);
    assert.strictEqual(r.status, 0, r.stdout);
    assert.strictEqual(r.json.refutados.length, 1, 'refutacao da base dele: ' + r.stdout);
    assert.deepStrictEqual(r.json.achadosNovosP0P1, [], 'o P1 refutado nao molha a ronda');
    const r2 = rodar(['--sessao', 'rf', '--arquivo', 'src/b.js'], cwd, tmp);
    assert.deepStrictEqual(r2.json.refutados, [], 'a refutacao de a.js nao vaza para b.js');
  });
});

test('T2/item 11: --arquivo sem base cai na pasta plana quando ha formato antigo', () => {
  comRepo((cwd, tmp) => {
    gravarMapa(cwd, 1, { A: 'trabalho', B: 'HEAD' });
    gravarRonda(cwd, 1, [SECO]);
    gravarMapa(cwd, 2, { A: 'trabalho', B: 'HEAD' });
    gravarRonda(cwd, 2, [SECO]);
    const r = rodar(['--sessao', 'ant', '--arquivo', 'src/a.js'], cwd, tmp);
    assert.strictEqual(r.status, 0, r.stdout);
    assert.strictEqual(r.json.encerrar, true);
    assert.strictEqual(r.json.arquivo, 'src/a.js', 'o arquivo vem do mapa.json da ultima ronda');
  });
});

test('T2/item 11: com pasta plana E bases, sem --arquivo vale a plana; com --arquivo, a base', () => {
  comRepo((cwd, tmp) => {
    gravarRonda(cwd, 1, [SECO]);
    gravarRonda(cwd, 2, [SECO]);
    gravarNaBase(cwd, 'src__b.js', 'src/b.js', 1, [P1_NOVO]);
    const plana = rodar(['--sessao', 'pl'], cwd, tmp);
    assert.strictEqual(plana.status, 0, plana.stdout);
    assert.strictEqual(plana.json.encerrar, true, 'a plana tem duas secas');
    assert.strictEqual(plana.json.arquivo, null, 'a plana desta fixture nao tem mapa.json');
    const base = rodar(['--sessao', 'pl2', '--arquivo', 'src/b.js'], cwd, tmp);
    assert.strictEqual(base.json.encerrar, false);
    assert.strictEqual(base.json.arquivo, 'src/b.js');
  });
});

// Item 12: rodar o apurador de novo numa revisao ja fechada somava revisao_fechada outra vez.
test('T2/item 12: apurar duas vezes uma revisao fechada conta revisao_fechada uma vez so', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    const r1 = rodar(['--sessao', 'idem'], cwd, tmp);
    assert.strictEqual(r1.json.encerrar, true);
    assert.strictEqual(r1.json.revisaoFechadaContada.revisao_fechada, 1);
    assert.strictEqual(contadorDe(tmp, 'idem'), 1);
    const fechada = JSON.parse(fs.readFileSync(
      path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js', 'fechada.json'), 'utf8'));
    assert.strictEqual(fechada.ronda, 2);
    assert.strictEqual(fechada.sessao, 'idem');
    assert.match(fechada.motivo, /duas rondas secas/);
    const r2 = rodar(['--sessao', 'outra'], cwd, tmp);
    assert.strictEqual(r2.status, 0, r2.stdout);
    assert.strictEqual(contadorDe(tmp, 'idem'), 1, 'a segunda apuracao nao soma');
    assert.strictEqual(contadorDe(tmp, 'outra'), 0, 'nem na sessao que a rodou de novo');
    assert.strictEqual(r2.json.revisaoFechadaContada.jaContada, true);
    assert.strictEqual(r2.json.revisaoFechadaContada.sessao, 'idem', 'diz onde foi contada: a do arquivo');
    assert.strictEqual(r2.json.encerrar, true, 'o resto da saida nao muda');
  });
});

test('T2/item 12: uma ronda nova numa revisao fechada e outro fecho, e conta de novo', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    rodar(['--sessao', 'nova'], cwd, tmp);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 3, [SECO]);
    const r = rodar(['--sessao', 'nova'], cwd, tmp);
    assert.strictEqual(r.json.revisaoFechadaContada.revisao_fechada, 2, 'ronda 3 e fecho novo: ' + r.stdout);
    assert.strictEqual(contadorDe(tmp, 'nova'), 2);
  });
});

test('T2/item 12: revisao que nao fecha nao grava fechada.json e a saida segue como antes', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [P1_NOVO]);
    const r = rodar(['--sessao', 'aberta'], cwd, tmp);
    assert.strictEqual(r.json.encerrar, false);
    assert.strictEqual(r.json.revisaoFechadaContada, null);
    assert.strictEqual(fs.existsSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js', 'fechada.json')), false);
  });
});

test('T2/item 12: no formato antigo o fechada.json fica na pasta plana e tambem conta uma vez', () => {
  comRepo((cwd, tmp) => {
    gravarRonda(cwd, 1, [SECO]);
    gravarRonda(cwd, 2, [SECO]);
    rodar(['--sessao', 'ant1'], cwd, tmp);
    assert.ok(fs.existsSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'fechada.json')));
    const r = rodar(['--sessao', 'ant1'], cwd, tmp);
    assert.strictEqual(contadorDe(tmp, 'ant1'), 1);
    assert.strictEqual(r.json.revisaoFechadaContada.jaContada, true);
  });
});

// Ronda 1 da T4: --arquivo de um arquivo sem base, com pasta plana de OUTRO arquivo, apurava a
// plana calado e podia contar o fecho dela como o do arquivo pedido.
test('T4/r1: --arquivo sem base e com pasta plana de outro arquivo para com erro que nomeia os dois', () => {
  comRepo((cwd, tmp) => {
    gravarMapa(cwd, 1, { A: 'trabalho', B: 'HEAD' });
    gravarRonda(cwd, 1, [SECO]);
    gravarMapa(cwd, 2, { A: 'trabalho', B: 'HEAD' });
    gravarRonda(cwd, 2, [SECO]);
    const r = rodar(['--sessao', 'outro', '--arquivo', 'src/b.js'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.strictEqual(r.json, null, 'sem apuracao: ' + r.stdout);
    assert.ok(r.stdout.includes('src/a.js') && r.stdout.includes('src/b.js'), r.stdout);
    assert.strictEqual(contadorDe(tmp, 'outro'), 0, 'nao apurou, nao conta');
  });
});

test('T4/r1: --arquivo sem revisao nenhuma diz como prepara-la', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    const r = rodar(['--sessao', 'sem', '--arquivo', 'src/x.js'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(r.stdout.includes('preparar-revisao.js --arquivo src/x.js'), r.stdout);
  });
});

// Ronda 1 da T4: o fechada.json era gravado ANTES de contar. Se a contagem falhava, a reapuracao
// dizia "ja contada" sem nunca ter contado. Agora fechada.json existir quer dizer que contou.
test('T4/r1: se a contagem do fecho falha, fechada.json nao e gravado e a saida diz o que fazer', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    const arquivoNoLugarDaPasta = path.join(tmp, 'nao-e-pasta');
    fs.writeFileSync(arquivoNoLugarDaPasta, 'x', 'utf8');
    const r = rodar(['--sessao', 'falha'], cwd, arquivoNoLugarDaPasta);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(r.stdout.startsWith('ERRO:'), r.stdout);
    assert.match(r.stdout, /de novo/);
    assert.strictEqual(fs.existsSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js', 'fechada.json')), false);
  });
});

test('T4/r1: fechada.json ilegivel para com erro em vez de contar o fecho outra vez', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    fs.writeFileSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__a.js', 'fechada.json'), '{ "ronda": ', 'utf8');
    const r = rodar(['--sessao', 'trunc'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(r.stdout.includes('fechada.json'), r.stdout);
    assert.strictEqual(contadorDe(tmp, 'trunc'), 0, 'nao conta de novo');
  });
});

// Ronda 2 da T4.
test('T4/r2: pasta plana sem mapa.json nao aceita --arquivo calada', () => {
  comRepo((cwd, tmp) => {
    gravarRonda(cwd, 1, [SECO]);
    gravarRonda(cwd, 2, [SECO]);
    const r = rodar(['--sessao', 'semmapa', '--arquivo', 'src/b.js'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(r.stdout.includes('nao diz de qual arquivo') && r.stdout.includes('sem --arquivo'), r.stdout);
    assert.strictEqual(contadorDe(tmp, 'semmapa'), 0, 'nao apurou, nao conta');
  });
});

test('T4/r2: se fechada.json nao se grava depois de contar, a saida diz que o fecho ja foi contado', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    const preload = path.join(tmp, 'falha-fechada.js');
    fs.writeFileSync(preload, "const fs = require('fs'); const w = fs.writeFileSync;\n" +
      "fs.writeFileSync = function (p) { if (String(p).endsWith('fechada.json')) throw new Error('EACCES simulado'); " +
      'return w.apply(this, arguments); };\n', 'utf8');
    // No NODE_OPTIONS entre aspas a barra invertida vira escape: o caminho vai com barra normal.
    const r = rodar(['--sessao', 'grava'], cwd, tmp, { NODE_OPTIONS: '--require "' + preload.split(path.sep).join('/') + '"' });
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(r.stdout.startsWith('ERRO:'), r.stdout);
    assert.match(r.stdout, /fecho foi contado/);
    assert.strictEqual(contadorDe(tmp, 'grava'), 1, 'contou uma vez, e a saida diz isso');
  });
});

test('T4/r2: --arquivo sem caminho para com erro em vez de apurar sem filtro', () => {
  comRepo((cwd, tmp) => {
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 1, [SECO]);
    gravarNaBase(cwd, 'src__a.js', 'src/a.js', 2, [SECO]);
    const r = rodar(['--sessao', 'vazio', '--arquivo'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /--arquivo sem caminho/);
    assert.strictEqual(contadorDe(tmp, 'vazio'), 0, 'nao apurou, nao conta');
    const r2 = rodar(['--arquivo', '--sessao', 'vazio'], cwd, tmp);
    assert.strictEqual(r2.status, 1, r2.stdout);
    assert.match(r2.stdout, /--arquivo sem caminho/);
  });
});

test('T4/r2: erro de leitura que nao e pasta ausente sai com a causa, e nao como "nao ha revisao"', () => {
  comRepo((cwd, tmp) => {
    fs.mkdirSync(path.join(cwd, '.claude', 'esquadro', 'revisao'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.claude', 'esquadro', 'revisao', 'src__x.js'), 'nao e pasta', 'utf8');
    const r = rodar(['--sessao', 'enotdir', '--arquivo', 'src/x.js'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.ok(!r.stdout.includes('nao ha revisao'), r.stdout);
    assert.match(r.stdout, /ENOTDIR/);
  });
});

test('T4/r2: sem revisao nenhuma, o erro diz como preparar uma', () => {
  comRepo((cwd, tmp) => {
    fs.mkdirSync(path.join(cwd, '.claude', 'esquadro', 'revisao'), { recursive: true });
    const r = rodar(['--sessao', 'nada'], cwd, tmp);
    assert.strictEqual(r.status, 1, r.stdout);
    assert.match(r.stdout, /nao ha revisao/);
    assert.ok(r.stdout.includes('preparar-revisao.js --arquivo'), r.stdout);
  });
});
