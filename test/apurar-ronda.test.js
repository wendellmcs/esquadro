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
