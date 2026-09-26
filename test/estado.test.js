'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BOM = String.fromCharCode(65279);

function comTmp(fn) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-teste-'));
  const antes = process.env.ESQUADRO_TMP;
  process.env.ESQUADRO_TMP = base;
  delete require.cache[require.resolve('../scripts/lib/estado.js')];
  const estado = require('../scripts/lib/estado.js');
  try {
    fn(estado, base);
  } finally {
    if (antes === undefined) delete process.env.ESQUADRO_TMP;
    else process.env.ESQUADRO_TMP = antes;
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test('estado: sessao desconhecida le objeto vazio', () => {
  comTmp((estado) => {
    assert.deepStrictEqual(estado.ler('nao-existe'), {});
  });
});

test('estado: grava e le de volta', () => {
  comTmp((estado) => {
    estado.gravar('s1', { trabalhoReal: true });
    assert.strictEqual(estado.ler('s1').trabalhoReal, true);
  });
});

test('estado: alterar aplica a funcao e persiste', () => {
  comTmp((estado) => {
    estado.alterar('s1', (s) => { s.n = (s.n || 0) + 1; return s; });
    estado.alterar('s1', (s) => { s.n = (s.n || 0) + 1; return s; });
    assert.strictEqual(estado.ler('s1').n, 2);
  });
});

test('estado: limpar zera a sessao', () => {
  comTmp((estado) => {
    estado.gravar('s1', { trabalhoReal: true });
    estado.limpar('s1');
    assert.deepStrictEqual(estado.ler('s1'), {});
  });
});

test('estado: session_id sujo nao escapa da pasta', () => {
  comTmp((estado, base) => {
    const alvo = estado.caminhoSessao('../../fora');
    assert.ok(alvo.startsWith(path.join(base, 'esquadro')), alvo);
    assert.ok(!alvo.includes('..'));
  });
});

test('estado: arquivo corrompido nao derruba a leitura', () => {
  comTmp((estado) => {
    estado.gravar('s1', { a: 1 });
    fs.writeFileSync(estado.caminhoSessao('s1'), '{ isso nao e json', 'utf8');
    assert.deepStrictEqual(estado.ler('s1'), {});
  });
});

test('estado: incrementar conta por chave', () => {
  comTmp((estado) => {
    assert.strictEqual(estado.incrementar('s1', 'fora_do_escopo'), 1);
    assert.strictEqual(estado.incrementar('s1', 'fora_do_escopo'), 2);
    assert.strictEqual(estado.incrementar('s1', 'outra'), 1);
    assert.strictEqual(estado.ler('s1').contadores.fora_do_escopo, 2);
  });
});

test('estado: descarregar so grava se .claude/esquadro existir (D14)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), false);
      fs.mkdirSync(path.join(proj, '.claude', 'esquadro'), { recursive: true });
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true);
      assert.strictEqual(estado.descarregar(proj, { a: 2 }), true);
      const dados = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'esquadro', 'contadores.json'), 'utf8'));
      assert.strictEqual(dados.a, 3, 'contador durável acumula entre turnos');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: contador corrompido nao apaga historico em silencio (D30)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      const conteudoOriginal = '{ esse json esta corrompido e nao fecha';
      fs.writeFileSync(arquivo, conteudoOriginal, 'utf8');
      assert.strictEqual(estado.descarregar(proj, { novo: 1 }), true);
      const arquivoCorrempido = path.join(pasta, 'contadores.json.corrompido');
      assert.ok(fs.existsSync(arquivoCorrempido), 'arquivo .corrompido foi criado');
      const conteudoPreservado = fs.readFileSync(arquivoCorrempido, 'utf8');
      assert.strictEqual(conteudoPreservado, conteudoOriginal, 'conteudo ilegivel foi preservado');
      const contadoresNovo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.strictEqual(contadoresNovo.novo, 1, 'novo contador foi gravado');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: escrita de contadores nao deixa arquivo temporario (D30)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      estado.descarregar(proj, { a: 1 });
      estado.descarregar(proj, { b: 2 });
      estado.descarregar(proj, { c: 3 });
      const arquivos = fs.readdirSync(pasta);
      const apenasContadores = arquivos.filter(f => f === 'contadores.json' || f.endsWith('.corrompido'));
      assert.deepStrictEqual(arquivos, apenasContadores, 'nao ha arquivo temporario na pasta');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: descarregar escreve em arquivo temporario antes de renomear (D30)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      fs.mkdirSync(path.join(proj, '.claude', 'esquadro'), { recursive: true });
      const arquivo = path.join(proj, '.claude', 'esquadro', 'contadores.json');

      // Interceptar writeFileSync e renameSync para registrar chamadas
      const originalWriteFileSync = fs.writeFileSync;
      const originalRenameSync = fs.renameSync;
      const chamadas = { writeSync: [], renameSync: [] };

      fs.writeFileSync = function(...args) {
        chamadas.writeSync.push(args[0]); // path
        return originalWriteFileSync.apply(fs, args);
      };

      fs.renameSync = function(...args) {
        chamadas.renameSync.push([args[0], args[1]]); // [from, to]
        return originalRenameSync.apply(fs, args);
      };

      try {
        estado.descarregar(proj, { test: 1 });

        // Prova da atomicidade: deve ter escrito num caminho temporário
        const tmpPath = arquivo + '.tmp';
        assert.ok(chamadas.writeSync.includes(tmpPath), 'writeFileSync foi chamado no caminho .tmp');

        // E depois renomeado do temporário para o final
        assert.ok(
          chamadas.renameSync.some(([from, to]) => from === tmpPath && to === arquivo),
          'renameSync foi chamado para mover .tmp para contadores.json'
        );
      } finally {
        fs.writeFileSync = originalWriteFileSync;
        fs.renameSync = originalRenameSync;
      }
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: sessao com BOM preserva gitAbertura (D-A)', () => {
  comTmp((estado) => {
    const conteudo = BOM + JSON.stringify({ gitAbertura: ['docs/x.md'] });
    fs.mkdirSync(path.dirname(estado.caminhoSessao('s1')), { recursive: true });
    fs.writeFileSync(estado.caminhoSessao('s1'), conteudo, 'utf8');
    const bytes = fs.readFileSync(estado.caminhoSessao('s1'));
    assert.strictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'arquivo de teste realmente tem BOM');
    assert.deepStrictEqual(estado.ler('s1').gitAbertura, ['docs/x.md']);
  });
});

test('estado: sessao sem BOM continua funcionando (controle)', () => {
  comTmp((estado) => {
    const conteudo = JSON.stringify({ gitAbertura: ['docs/x.md'] });
    fs.mkdirSync(path.dirname(estado.caminhoSessao('s1')), { recursive: true });
    fs.writeFileSync(estado.caminhoSessao('s1'), conteudo, 'utf8');
    const bytes = fs.readFileSync(estado.caminhoSessao('s1'));
    assert.notStrictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'controle: este arquivo NAO tem BOM');
    assert.deepStrictEqual(estado.ler('s1').gitAbertura, ['docs/x.md']);
  });
});

test('estado: contadores.json com BOM soma em vez de zerar (D-A)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      fs.writeFileSync(arquivo, BOM + JSON.stringify({ a: 7 }), 'utf8');
      const bytes = fs.readFileSync(arquivo);
      assert.strictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'arquivo de teste realmente tem BOM');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true);
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.strictEqual(dados.a, 8, 'somou em cima do valor existente, nao zerou');
      assert.ok(!fs.existsSync(arquivo + '.corrompido'), 'nao criou .corrompido para um arquivo valido com BOM');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: contadores.json sem BOM soma normalmente (controle)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      fs.writeFileSync(arquivo, JSON.stringify({ a: 7 }), 'utf8');
      const bytes = fs.readFileSync(arquivo);
      assert.notStrictEqual(bytes.slice(0, 3).toString('hex'), 'efbbbf', 'controle: este arquivo NAO tem BOM');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true);
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.strictEqual(dados.a, 8, 'somou em cima do valor existente');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

// Rodada de correcao 1 / achado 2: JSON valido mas nao-objeto nao pode passar como acumulador.

test('estado: contadores.json = numero (42) vira .corrompido, nao estoura (D-A2)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      const original = '42';
      fs.writeFileSync(arquivo, original, 'utf8');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true, 'nao pode estourar');
      const corrompido = arquivo + '.corrompido';
      assert.ok(fs.existsSync(corrompido), 'preservou o 42 como .corrompido');
      assert.strictEqual(fs.readFileSync(corrompido, 'utf8'), original, 'conteudo original intacto');
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.deepStrictEqual(dados, { a: 1 }, 'contadores.json novo tem so o incremento deste turno');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: contadores.json = string ("oi") vira .corrompido, nao estoura (D-A2)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      const original = '"oi"';
      fs.writeFileSync(arquivo, original, 'utf8');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true, 'nao pode estourar');
      const corrompido = arquivo + '.corrompido';
      assert.ok(fs.existsSync(corrompido), 'preservou a string como .corrompido');
      assert.strictEqual(fs.readFileSync(corrompido, 'utf8'), original, 'conteudo original intacto');
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.deepStrictEqual(dados, { a: 1 }, 'contadores.json novo tem so o incremento deste turno');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: contadores.json = booleano (true) vira .corrompido, nao estoura (D-A2)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      const original = 'true';
      fs.writeFileSync(arquivo, original, 'utf8');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true, 'nao pode estourar');
      const corrompido = arquivo + '.corrompido';
      assert.ok(fs.existsSync(corrompido), 'preservou o booleano como .corrompido');
      assert.strictEqual(fs.readFileSync(corrompido, 'utf8'), original, 'conteudo original intacto');
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.deepStrictEqual(dados, { a: 1 }, 'contadores.json novo tem so o incremento deste turno');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: contadores.json = array ([1,2,3]) vira .corrompido, nao perde o incremento (D-A2)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      const original = '[1,2,3]';
      fs.writeFileSync(arquivo, original, 'utf8');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true, 'nao pode estourar');
      const corrompido = arquivo + '.corrompido';
      assert.ok(fs.existsSync(corrompido), 'preservou o array como .corrompido');
      assert.strictEqual(fs.readFileSync(corrompido, 'utf8'), original, 'conteudo original intacto');
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.deepStrictEqual(dados, { a: 1 }, 'contador nao pode se perder dentro de um array');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

test('estado: contadores.json = objeto valido soma e NAO cria .corrompido (controle D-A2)', () => {
  comTmp((estado) => {
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-proj-'));
    try {
      const pasta = path.join(proj, '.claude', 'esquadro');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, 'contadores.json');
      fs.writeFileSync(arquivo, JSON.stringify({ a: 7 }), 'utf8');
      assert.strictEqual(estado.descarregar(proj, { a: 1 }), true);
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      assert.strictEqual(dados.a, 8, 'somou em cima do valor existente');
      assert.ok(!fs.existsSync(arquivo + '.corrompido'), 'objeto valido nao pode virar .corrompido');
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});
