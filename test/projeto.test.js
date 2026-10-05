'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const projeto = require('../scripts/lib/projeto.js');

const VALIDO = {
  versaoConfig: 1,
  geradoEm: '2026-08-08',
  plataforma: { so: 'win32', shell: 'powershell' },
  modeloDeAmeaca: 'interno',
  provaDePronto: 'npm test',
  quemDecide: 'Ana',
  fontesCanonicas: ['CLAUDE.md'],
  intocaveis: [],
  marchaPadrao: 'padrao',
  marchas: { aaa: [], padrao: ['src/**'], rapida: ['**/*.md'] },
  comandosBloqueados: [],
  comandosLiberados: [],
  travas: { fecho: true, escopo: true, destrutivo: true, outraFrente: true },
  limiares: {},
  agentes: { escada: [] }
};

function copia(mudancas) {
  return Object.assign(JSON.parse(JSON.stringify(VALIDO)), mudancas || {});
}

test('projeto: config valida passa', () => {
  const r = projeto.validar(VALIDO);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

test('projeto: falta de chave obrigatoria e erro nomeado', () => {
  const semAmeaca = Object.assign({}, VALIDO);
  delete semAmeaca.modeloDeAmeaca;
  const r = projeto.validar(semAmeaca);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('modeloDeAmeaca')));
});

test('projeto: modeloDeAmeaca so aceita interno ou publico (C10)', () => {
  const ruim = Object.assign({}, VALIDO, { modeloDeAmeaca: 'talvez' });
  assert.strictEqual(projeto.validar(ruim).ok, false);
});

test('projeto: marchaPadrao so aceita rapida, padrao ou aaa', () => {
  const ruim = Object.assign({}, VALIDO, { marchaPadrao: 'turbo' });
  assert.strictEqual(projeto.validar(ruim).ok, false);
});

test('projeto: padrao de caminho invalido e recusado antes de virar portao', () => {
  const ruim = JSON.parse(JSON.stringify(VALIDO));
  ruim.marchas.padrao = [123];
  const r = projeto.validar(ruim);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('marchas.padrao')));
});

test('projeto: comandosBloqueados com regex quebrada e recusado', () => {
  const ruim = Object.assign({}, VALIDO, { comandosBloqueados: ['[nao fecha'] });
  const r = projeto.validar(ruim);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('comandosBloqueados')));
});

test('projeto: montar preenche a partir da varredura e das respostas', () => {
  const inferido = {
    linguagem: 'node', gerenciador: 'npm', provaDePronto: 'npm test',
    plataforma: { so: 'win32', shell: 'powershell' },
    candidatosCanonicos: ['CLAUDE.md'], temGit: true, modificados: [], temDesignSystem: false
  };
  const respostas = {
    modeloDeAmeaca: 'interno',
    fontesCanonicas: ['CLAUDE.md'],
    provaDePronto: 'npm test',
    intocaveis: ['segredos/**'],
    quemDecide: 'Ana',
    marchas: { aaa: ['**/auth/**'], padrao: ['src/**'], rapida: ['**/*.md'] }
  };
  const p = projeto.montar(inferido, respostas);
  assert.strictEqual(projeto.validar(p).ok, true, projeto.validar(p).erros.join(' | '));
  assert.strictEqual(p.plataforma.shell, 'powershell');
  assert.deepStrictEqual(p.intocaveis, ['segredos/**']);
});

test('projeto: montar liga as quatro travas por padrao', () => {
  const p = projeto.montar({ plataforma: { so: 'linux', shell: 'bash' } }, {
    modeloDeAmeaca: 'publico', fontesCanonicas: [], provaDePronto: 'make test',
    intocaveis: [], quemDecide: 'time', marchas: { aaa: [], padrao: [], rapida: [] }
  });
  assert.deepStrictEqual(p.travas, { fecho: true, escopo: true, destrutivo: true, outraFrente: true });
});

// ---------------------------------------------------------------------------
// Daqui para baixo: o que fecha os dez achados e os oito buracos de teste (D99).
// ---------------------------------------------------------------------------

// A linha que rejeita entrada nao-objeto nunca foi exercitada por teste nenhum.
test('projeto: entrada que nao e objeto e recusada com o erro certo', () => {
  for (const ruim of [null, undefined, 42, 'texto', '', true, false, NaN]) {
    const r = projeto.validar(ruim);
    assert.strictEqual(r.ok, false, JSON.stringify(ruim) + ' devia ser recusado');
    assert.deepStrictEqual(r.erros, ['projeto.json nao e um objeto'],
      'erro errado para ' + JSON.stringify(ruim) + ': ' + r.erros.join(' | '));
  }
  // array NAO cai nessa linha: cai no laco de chaves, e isso e proposital
  const arr = projeto.validar([]);
  assert.strictEqual(arr.ok, false);
  assert.ok(arr.erros.some((e) => e === 'falta a chave versaoConfig'), arr.erros.join(' | '));
});

// A checagem de versaoConfig podia ser apagada INTEIRA sem matar teste nenhum.
test('projeto: versaoConfig diferente de 1 e recusado com erro nomeado', () => {
  for (const ruim of ['1', 0, 2, null, undefined]) {
    const r = projeto.validar(copia({ versaoConfig: ruim }));
    assert.strictEqual(r.ok, false, 'versaoConfig=' + JSON.stringify(ruim) + ' devia ser recusado');
    assert.ok(r.erros.some((e) => e === 'versaoConfig tem de ser 1'),
      'faltou o erro de versaoConfig para ' + JSON.stringify(ruim) + ': ' + r.erros.join(' | '));
  }
});

// O laco de chave-faltando podia ser apagado INTEIRO: o teste que parecia cobri-lo
// passava por acidente, porque a mensagem de AMEACAS contem a palavra "modeloDeAmeaca".
// A conferencia de CHAVES e por SUPERCONJUNTO: tarefas seguintes acrescentam chaves.
test('projeto: cada chave obrigatoria ausente vira o erro "falta a chave X"', () => {
  for (const chave of projeto.CHAVES) {
    const semEla = copia();
    delete semEla[chave];
    const r = projeto.validar(semEla);
    assert.strictEqual(r.ok, false, 'sem ' + chave + ' devia ser recusado');
    assert.ok(r.erros.some((e) => e === 'falta a chave ' + chave),
      'faltou "falta a chave ' + chave + '" em: ' + r.erros.join(' | '));
  }
  for (const obrigatoria of ['versaoConfig', 'geradoEm', 'plataforma', 'modeloDeAmeaca',
    'provaDePronto', 'quemDecide', 'fontesCanonicas', 'intocaveis', 'marchaPadrao',
    'marchas', 'comandosBloqueados', 'comandosLiberados', 'travas']) {
    assert.ok(projeto.CHAVES.indexOf(obrigatoria) !== -1, 'CHAVES perdeu ' + obrigatoria);
  }
});

test('projeto: plataforma quebrada e recusada, com a mensagem nomeada', () => {
  for (const p of [undefined, null, 'win32', 42, {}, { so: 'win32' }, { shell: 'powershell' },
                   { so: '', shell: 'powershell' }, { so: 'win32', shell: '   ' },
                   { so: 42, shell: 'powershell' }, { so: 'win32', shell: false }]) {
    const r = projeto.validar(copia({ plataforma: p }));
    assert.strictEqual(r.ok, false, 'plataforma=' + JSON.stringify(p) + ' devia ser recusada');
    assert.ok(r.erros.some((e) => e === 'plataforma precisa de so e shell, os dois texto nao vazio'),
      'mensagem errada para ' + JSON.stringify(p) + ': ' + r.erros.join(' | '));
  }
  assert.strictEqual(projeto.validar(copia({ plataforma: { so: 'linux', shell: 'bash' } })).ok, true);
});

// validar() ESTOURAVA em vez de reprovar: `for..of` sobre {} ou numero.
test('projeto: campo-lista com tipo errado e RECUSADO, nunca estoura', () => {
  for (const lista of ['comandosBloqueados', 'comandosLiberados', 'intocaveis', 'fontesCanonicas']) {
    for (const ruim of [{}, { a: 1 }, 123, true, 'texto', [1], [''], ['   '], [null]]) {
      let r;
      assert.doesNotThrow(() => { r = projeto.validar(copia({ [lista]: ruim })); },
        lista + ' = ' + JSON.stringify(ruim) + ' fez validar() estourar');
      assert.strictEqual(r.ok, false, lista + ' = ' + JSON.stringify(ruim) + ' devia ser recusado');
      assert.ok(r.erros.some((e) => e.includes(lista)), 'o erro nao nomeia ' + lista);
    }
  }
});

// O conserto acima nao pode recriar estouro em outro lugar: RegExp.test COAGE, e
// Object.create(null) nao tem toString. So valores que sobrevivem a JSON.parse.
test('projeto: validar nao estoura com valor hostil que sobrevive a JSON.parse', () => {
  for (const chave of projeto.CHAVES) {
    for (const h of [Object.create(null), { toString: null }, { valueOf: null }, []]) {
      const alvo = copia();
      alvo[chave] = h;
      assert.doesNotThrow(() => { projeto.validar(alvo); },
        chave + ' com valor hostil fez validar() estourar');
    }
  }
});

test('projeto: travas so passa com as quatro chaves booleanas', () => {
  for (const ruim of [null, undefined, {}, [], 'sim', 1, true,
                      { fecho: true, escopo: true, destrutivo: true },
                      { fecho: true, escopo: true, destrutivo: true, outraFrente: 'sim' }]) {
    const r = projeto.validar(copia({ travas: ruim }));
    assert.strictEqual(r.ok, false, 'travas=' + JSON.stringify(ruim) + ' devia ser recusado');
  }
  const arr = projeto.validar(copia({ travas: [] }));
  assert.ok(arr.erros.some((e) => e === 'travas tem de ser objeto com as quatro chaves'),
    arr.erros.join(' | '));
  // desligar uma trava DE PROPOSITO e valido: e escolha declarada, nao acidente
  assert.strictEqual(projeto.validar(copia({
    travas: { fecho: true, escopo: false, destrutivo: true, outraFrente: true } })).ok, true);
});

test('projeto: marchas nao-objeto cai na mensagem de tipo', () => {
  for (const ruim of [null, 'src/**', 42, false]) {
    const r = projeto.validar(copia({ marchas: ruim }));
    assert.strictEqual(r.ok, false, 'marchas=' + JSON.stringify(ruim) + ' devia ser recusado');
    assert.ok(r.erros.some((e) => e === 'marchas tem de ser objeto'),
      'mensagem errada para ' + JSON.stringify(ruim) + ': ' + r.erros.join(' | '));
  }
});

// Tres campos declarados obrigatorios que validar() nunca olhava.
test('projeto: quemDecide, geradoEm e provaDePronto sao conferidos de verdade', () => {
  for (const ruim of ['', '   ', null, 42, {}, []]) {
    assert.strictEqual(projeto.validar(copia({ quemDecide: ruim })).ok, false,
      'quemDecide=' + JSON.stringify(ruim) + ' devia ser recusado');
  }
  // formato errado, data que nao existe, e lixo com sufixo
  for (const ruim of [99999, '2026-8-8', '08-08-2026', '', null, 'ontem',
                      '2026-13-45', '0000-00-00', '9999-99-99', '2026-02-30', '2026-08-08x']) {
    assert.strictEqual(projeto.validar(copia({ geradoEm: ruim })).ok, false,
      'geradoEm=' + JSON.stringify(ruim) + ' devia ser recusado');
  }
  assert.strictEqual(projeto.validar(copia({ geradoEm: '2024-02-29' })).ok, true, 'bissexto e valido');
  for (const ruim of [12345, '', '   ', {}, []]) {
    assert.strictEqual(projeto.validar(copia({ provaDePronto: ruim })).ok, false,
      'provaDePronto=' + JSON.stringify(ruim) + ' devia ser recusado');
  }
  // null e resposta legitima: a varredura pode nao ter achado prova de pronto
  assert.strictEqual(projeto.validar(copia({ provaDePronto: null })).ok, true);
});

// O objeto tem de sobreviver a GRAVACAO, nao so a chamada direta: `undefined` some
// no JSON.stringify e a chave desaparece do disco.
test('projeto: o que montar() devolve continua valido depois de gravar e reler', () => {
  const semResposta = projeto.montar({ plataforma: { so: 'win32', shell: 'powershell' } }, {});
  const antes = projeto.validar(semResposta);
  const depois = projeto.validar(JSON.parse(JSON.stringify(semResposta)));
  assert.strictEqual(antes.ok, depois.ok,
    'validar mudou de resposta depois da gravacao: antes=' + antes.ok + ' depois=' + depois.ok);
  assert.deepStrictEqual(antes.erros, depois.erros, 'os erros mudaram depois da gravacao');
  const cheio = projeto.montar(
    { plataforma: { so: 'win32', shell: 'powershell' }, provaDePronto: 'npm test' },
    { modeloDeAmeaca: 'interno', quemDecide: 'Ana', fontesCanonicas: ['CLAUDE.md'],
      intocaveis: ['segredos/**'], marchas: { aaa: [], padrao: ['src/**'], rapida: ['**/*.md'] } });
  assert.strictEqual(projeto.validar(cheio).ok, true, projeto.validar(cheio).erros.join(' | '));
  const relido = JSON.parse(JSON.stringify(cheio));
  assert.strictEqual(projeto.validar(relido).ok, true);
  for (const chave of projeto.CHAVES) {
    assert.ok(chave in relido, 'a chave ' + chave + ' nao sobreviveu ao JSON.stringify');
  }
});

// montar() descartava a resposta do dono sobre travas, calado.
test('projeto: montar respeita a trava que o dono desligou, e ignora resposta nao-booleana', () => {
  const desligou = projeto.montar({}, { travas: { destrutivo: false } });
  assert.strictEqual(desligou.travas.destrutivo, false, 'religou calado a trava que o dono desligou');
  assert.strictEqual(desligou.travas.fecho, true, 'trava nao respondida tem de ficar ligada');
  const lixo = projeto.montar({}, { travas: { destrutivo: 'nao', escopo: 0, fecho: null } });
  assert.deepStrictEqual(lixo.travas, { fecho: true, escopo: true, destrutivo: true, outraFrente: true },
    'resposta que nao e booleana tem de cair no default ligado');
});

// montar() jogava fora candidatosCanonicos - e o primeiro conserto disso recriava o
// mesmo defeito espelhado, descartando a resposta "nenhuma" do dono.
test('projeto: montar aproveita o inferido so quando a entrevista nao respondeu', () => {
  assert.deepStrictEqual(
    projeto.montar({ candidatosCanonicos: ['AGENTS.md', 'CLAUDE.md'] }, {}).fontesCanonicas,
    ['AGENTS.md', 'CLAUDE.md'], 'ignorou o que a varredura achou');
  assert.deepStrictEqual(
    projeto.montar({ candidatosCanonicos: ['AGENTS.md'] }, { fontesCanonicas: ['LEIAME.md'] }).fontesCanonicas,
    ['LEIAME.md'], 'a resposta da entrevista tem de vencer a varredura');
  assert.deepStrictEqual(
    projeto.montar({ candidatosCanonicos: ['AGENTS.md'] }, { fontesCanonicas: null }).fontesCanonicas,
    [], 'o dono respondeu "nenhuma" e recebeu o palpite da varredura');
  assert.deepStrictEqual(projeto.montar({}, {}).fontesCanonicas, []);
  // a mesma regra vale para provaDePronto, que tem a forma identica
  assert.strictEqual(projeto.montar({ provaDePronto: 'npm test' }, {}).provaDePronto, 'npm test');
  assert.strictEqual(projeto.montar({ provaDePronto: 'npm test' }, { provaDePronto: null }).provaDePronto,
    null, 'o dono respondeu "nao tenho" e recebeu o palpite da varredura');
  // Enter num prompt devolve "": isso e "nao respondi", nao "nenhuma"
  assert.strictEqual(projeto.montar({ provaDePronto: 'npm test' }, { provaDePronto: '' }).provaDePronto,
    'npm test', 'texto vazio foi tratado como resposta em vez de silencio');
  assert.strictEqual(projeto.montar({ provaDePronto: 'npm test' }, { provaDePronto: '   ' }).provaDePronto,
    'npm test');
});

test('projeto: montar preenche os defaults e a data no formato certo', () => {
  const p = projeto.montar({}, {});
  assert.match(p.geradoEm, /^\d{4}-\d{2}-\d{2}$/, 'geradoEm fora do formato AAAA-MM-DD');
  assert.strictEqual(p.versaoConfig, 1);
  assert.strictEqual(p.marchaPadrao, 'padrao');
  assert.strictEqual(p.provaDePronto, null);
  assert.strictEqual(p.modeloDeAmeaca, null);
  assert.strictEqual(p.quemDecide, null);
  assert.deepStrictEqual(p.intocaveis, []);
  assert.deepStrictEqual(p.comandosBloqueados, []);
  assert.deepStrictEqual(p.comandosLiberados, []);
  assert.deepStrictEqual(p.marchas, { aaa: [], padrao: [], rapida: [] });
  assert.strictEqual(p.plataforma.so, process.platform);
  assert.strictEqual(p.plataforma.shell, process.platform === 'win32' ? 'powershell' : 'bash');
  assert.deepStrictEqual(projeto.montar({ plataforma: { so: 'linux', shell: 'bash' } }, {}).plataforma,
    { so: 'linux', shell: 'bash' });
});

// O portao testa o escape ANTES de classificar: o liberado venceria sempre.
test('projeto: o mesmo padrao nos dois lados e recusado, porque o liberado venceria', () => {
  const r = projeto.validar(copia({ comandosBloqueados: ['npm publish'], comandosLiberados: ['npm publish'] }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('npm publish') && e.includes('comandosLiberados')),
    'o erro nao nomeia o padrao e as duas listas: ' + r.erros.join(' | '));
  assert.strictEqual(projeto.validar(copia({
    comandosBloqueados: ['npm publish'], comandosLiberados: ['npm test'] })).ok, true);
});

// marcha.js:12 usa glob contra o MESMO alvo relativo que portao-escopo.js:42:
// padrao com letra de unidade rebaixa o rigor calado, em vez de proteger.
test('projeto: padrao que nao e caminho relativo e recusado em intocaveis e em marchas', () => {
  for (const abs of ['C:/segredos/**', 'C:\\segredos\\**', 'c:/segredos/**', 'C:segredos/**',
                     'file:///C:/segredos/**']) {
    const r = projeto.validar(copia({ intocaveis: [abs] }));
    assert.strictEqual(r.ok, false, 'intocaveis ' + abs + ' devia ser recusado');
    assert.ok(r.erros.some((e) => e.includes('intocaveis') && e.includes(abs)), r.erros.join(' | '));
    const q = projeto.validar(copia({ marchas: { aaa: [abs], padrao: ['src/**'], rapida: ['**/*.md'] } }));
    assert.strictEqual(q.ok, false, 'marchas.aaa ' + abs + ' devia ser recusado');
    assert.ok(q.erros.some((e) => e.includes('marchas.aaa')), q.erros.join(' | '));
  }
  // glob.normalizar tira TODAS as barras da frente e troca "\" por "/": estas casam
  // o alvo relativo de verdade, e recusa-las seria afirmar o contrario do medido.
  for (const rel of ['segredos/**', '/segredos/**', '//segredos/**', './segredos/**',
                     '\\\\segredos\\**', '**/*.pem', 'src/auth/**']) {
    assert.strictEqual(projeto.validar(copia({ intocaveis: [rel] })).ok, true, rel + ' devia passar');
  }
});

// A CLI e o config.js liam o MESMO arquivo e discordavam sobre o BOM existir.
test('projeto: a CLI le o mesmo arquivo que os portoes leem, BOM inclusive', () => {
  const cli = path.join(__dirname, '..', 'scripts', 'validar.js');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro-cli-'));
  fs.mkdirSync(path.join(base, '.claude', 'esquadro'), { recursive: true });
  const arq = path.join(base, '.claude', 'esquadro', 'projeto.json');
  const roda = () => spawnSync(process.execPath, [cli, base], { encoding: 'utf8', shell: false });

  fs.writeFileSync(arq, '\uFEFF' + JSON.stringify(VALIDO), 'utf8');
  let r = roda();
  assert.strictEqual(r.status, 0, 'BOM derrubou a CLI: ' + r.stdout + r.stderr);
  assert.ok(r.stdout.includes('OK:'), r.stdout);

  fs.writeFileSync(arq, '{ isto nao e json', 'utf8');
  r = roda();
  assert.strictEqual(r.status, 1);
  assert.ok(r.stdout.includes('nao e JSON valido'), 'a CLI culpou a leitura: ' + r.stdout);
  assert.ok(!r.stdout.includes('nao consegui ler'), 'a CLI ainda diz que nao conseguiu ler: ' + r.stdout);

  fs.rmSync(arq);
  r = roda();
  assert.strictEqual(r.status, 1);
  assert.ok(r.stdout.includes('nao consegui ler'), r.stdout);

  fs.writeFileSync(arq, JSON.stringify(copia({ modeloDeAmeaca: 'talvez' })), 'utf8');
  r = roda();
  assert.strictEqual(r.status, 1);
  assert.ok(r.stdout.includes('invalido'), r.stdout);
  // O defeito medido era stdout VAZIO com stack no stderr - entao e o stdout que
  // prova. Nao asserte stderr vazio: NODE_DEBUG=module o enche e acusa o inocente.
  assert.ok(r.stdout.includes('  - modeloDeAmeaca'), 'a CLI nao listou o erro no stdout: ' + r.stdout);

  fs.rmSync(base, { recursive: true, force: true });
});

test('projeto: config anterior - agentes.escada sem degraus - continua valida', () => {
  const r = projeto.validar(copia({ agentes: { escada: ['a', 'b'] } }));
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

test('projeto: degraus gravados casados com a escada passam', () => {
  const degraus = require('../scripts/lib/degraus.js');
  const agentes = degraus.paraProjeto([{ agente: 'a', apelido: 'x' }, { agente: 'b', apelido: 'y' }]);
  const r = projeto.validar(copia({ agentes: agentes }));
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

test('projeto: degraus fora de ordem da escada sao erro nomeado', () => {
  const r = projeto.validar(copia({
    agentes: { escada: ['a', 'b'], degraus: [{ agente: 'b', apelido: 'y' }, { agente: 'a', apelido: 'x' }] }
  }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('posicao 1')), r.erros.join(' | '));
});

test('projeto: apelido que e id de modelo reprova a configuracao', () => {
  const r = projeto.validar(copia({
    agentes: { escada: ['a', 'b'], degraus: [{ agente: 'a', apelido: 'claude-sonnet-5' }, { agente: 'b', apelido: 'y' }] }
  }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('id de modelo')), r.erros.join(' | '));
});

test('projeto: montar grava os DOIS lados quando a entrevista respondeu degraus', () => {
  const c = projeto.montar({}, { degraus: [{ agente: 'a', apelido: 'x' }, { agente: 'b', apelido: 'y' }] });
  assert.deepStrictEqual(c.agentes.escada, ['a', 'b']);
  assert.deepStrictEqual(c.agentes.degraus.map((d) => d.agente), ['a', 'b']);
});

test('projeto: montar sem resposta de degraus continua devolvendo escada vazia', () => {
  assert.deepStrictEqual(projeto.montar({}, {}).agentes, { escada: [] });
});

test('projeto: re-init preserva o que a entrevista nao perguntou de novo', () => {
  const antes = copia({
    intocaveis: ['segredos/**', '.env'],
    travas: { fecho: true, escopo: true, destrutivo: false, outraFrente: true }
  });
  const r = projeto.atualizar(antes, { quemDecide: 'Bruno' }, '2026-09-30');
  assert.deepStrictEqual(r.config.intocaveis, ['segredos/**', '.env']);
  assert.strictEqual(r.config.travas.destrutivo, false, 'trava que o dono desligou nao se religa calada');
  assert.strictEqual(r.config.quemDecide, 'Bruno');
});

// F1-C01: resposta parcial de travas/marchas/limiares trocava o objeto inteiro e apagava as chaves irmas.
test('projeto: re-init com travas/marchas/limiares PARCIAIS funde por chave', () => {
  const antes = copia({
    travas: { fecho: true, escopo: true, destrutivo: false, outraFrente: true },
    marchas: { rapida: ['a/**'], padrao: ['b/**'], aaa: ['c/**'] },
    limiares: { x: 1, y: 2 }
  });
  const r = projeto.atualizar(antes, {
    travas: { fecho: false }, marchas: { aaa: ['novo/**'] }, limiares: { y: 3, z: 4 }
  }, '2026-09-30');
  assert.deepStrictEqual(r.config.travas,
    { fecho: false, escopo: true, destrutivo: false, outraFrente: true });
  assert.deepStrictEqual(r.config.marchas,
    { rapida: ['a/**'], padrao: ['b/**'], aaa: ['novo/**'] });
  assert.deepStrictEqual(r.config.limiares, { x: 1, y: 3, z: 4 });
  assert.deepStrictEqual(r.mudou.sort(), ['geradoEm', 'limiares', 'marchas', 'travas']);
  const v = projeto.validar(r.config);
  assert.strictEqual(v.ok, true, v.erros.join(' | '));
});

test('projeto: a fusao por chave deixa entrar chave nova e nao inventa mudanca', () => {
  const antes = copia({ limiares: { x: 1 } });
  const nova = projeto.atualizar(antes, { limiares: { x: 1, novo: 9 } }, '2026-08-08');
  assert.deepStrictEqual(nova.config.limiares, { x: 1, novo: 9 }, 'chave nova tem de entrar');
  assert.deepStrictEqual(nova.mudou, ['limiares']);
  const igual = projeto.atualizar(copia({ limiares: { x: 1 } }), { limiares: { x: 1 } }, '2026-08-08');
  assert.deepStrictEqual(igual.mudou, [], 'valor igual nao e mudanca');
  // objeto sobre valor que nao e objeto: nao ha o que fundir, a resposta vale inteira
  const sobre = projeto.atualizar(copia({ limiares: null }), { limiares: { x: 1 } }, '2026-08-08');
  assert.deepStrictEqual(sobre.config.limiares, { x: 1 });
});

test('projeto: re-init move o geradoEm, que era o buraco do H3', () => {
  const antes = copia({});
  assert.strictEqual(antes.geradoEm, '2026-08-08');
  const r = projeto.atualizar(antes, {}, '2026-09-30');
  assert.strictEqual(r.config.geradoEm, '2026-09-30');
  assert.ok(r.mudou.includes('geradoEm'), JSON.stringify(r.mudou));
});

test('projeto: re-init lista o que mudou, e so o que mudou', () => {
  const r = projeto.atualizar(copia({}), { quemDecide: 'Ana' }, '2026-08-08');
  // quemDecide ja era 'Ana' no VALIDO, e a data e a mesma: nada mudou.
  assert.deepStrictEqual(r.mudou, []);
});

test('projeto: chave desconhecida nao entra calada - volta em ignoradas', () => {
  const r = projeto.atualizar(copia({}), { quemDecidem: 'Ana' }, '2026-09-30');
  assert.deepStrictEqual(r.ignoradas, ['quemDecidem']);
  assert.strictEqual('quemDecidem' in r.config, false);
});

test('projeto: re-init com degraus grava os dois lados, como o montar', () => {
  const r = projeto.atualizar(copia({}), {
    degraus: [{ agente: 'a', apelido: 'x' }, { agente: 'b', apelido: 'y' }]
  }, '2026-09-30');
  assert.deepStrictEqual(r.config.agentes.escada, ['a', 'b']);
  assert.deepStrictEqual(r.config.agentes.degraus.map((d) => d.agente), ['a', 'b']);
  assert.ok(r.mudou.includes('agentes'));
});

test('projeto: o que sai do re-init continua passando no validador', () => {
  const r = projeto.atualizar(copia({}), { quemDecide: 'Bruno' }, '2026-09-30');
  const v = projeto.validar(r.config);
  assert.strictEqual(v.ok, true, v.erros.join(' | '));
});

test('projeto: re-init de config invalida nao inventa config valida', () => {
  const r = projeto.atualizar(null, { quemDecide: 'Ana' }, '2026-09-30');
  assert.strictEqual(projeto.validar(r.config).ok, false, 'meia config nao pode virar config inteira');
});

test('qualidadeDeResposta: validar aceita, atualizar preserva, avisosDeTipo avisa tipo errado', () => {
  const base = projeto.montar({ plataforma: { so: 'linux', shell: 'bash' } }, {
    modeloDeAmeaca: 'publico', fontesCanonicas: [], provaDePronto: 'make test',
    intocaveis: [], quemDecide: 'time', marchas: { aaa: [], padrao: [], rapida: [] }
  });
  const com = Object.assign({}, base, { qualidadeDeResposta: false });
  assert.strictEqual(projeto.validar(com).ok, true, 'a chave invalidou o projeto.json');
  const novo = projeto.atualizar(com, { quemDecide: 'Bruno' }, '2026-10-01');
  assert.strictEqual(novo.config.qualidadeDeResposta, false, 'o init apagou a chave');
  assert.ok(projeto.avisosDeTipo(Object.assign({}, base, { qualidadeDeResposta: 'nao' }))
    .includes('qualidadeDeResposta tem de ser true ou false'));
  assert.ok(!projeto.avisosDeTipo(com).some((a) => /qualidadeDeResposta/.test(a)));
});
