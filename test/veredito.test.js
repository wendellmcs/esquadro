'use strict';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../scripts/lib/veredito.js');

function achado(sev, arq, linha, desc) {
  return { severidade: sev, arquivo: arq, linha: linha, descricao: desc || 'defeito', comoFalha: 'x -> y' };
}
function veredito(lente, achados, melhor) {
  return { lente: lente, melhor: melhor || 'A', porQue: 'A.txt:1', achados: achados };
}

test('veredito: sao nove lentes distintas', () => {
  assert.strictEqual(v.LENTES.length, 9);
  assert.strictEqual(new Set(v.LENTES.map((l) => l.chave)).size, 9);
});

test('veredito: as oito lentes de UI sao distintas e nao colidem com as de codigo', () => {
  assert.strictEqual(v.LENTES_UI.length, 8);
  assert.strictEqual(new Set(v.LENTES_UI.map((l) => l.chave)).size, 8);
  // D121: as listas divergem por desenho. Chave repetida entre as familias
  // faria o despacho gravar dois vereditos no mesmo arquivo.
  const codigo = new Set(v.LENTES.map((l) => l.chave));
  for (const l of v.LENTES_UI) {
    assert.ok(!codigo.has(l.chave), 'chave de UI colide com a de codigo: ' + l.chave);
  }
});

test('veredito: toda lente de UI tem titulo e pergunta', () => {
  for (const l of v.LENTES_UI) {
    assert.ok(l.titulo && l.titulo.length > 3, 'lente sem titulo: ' + l.chave);
    assert.ok(l.pergunta && l.pergunta.length > 20, 'lente sem pergunta: ' + l.chave);
  }
});

test('veredito: mudanca sem UI despacha so a familia de codigo', () => {
  assert.deepStrictEqual(v.familiasPara(true, false), ['codigo']);
});

test('veredito: mudanca com UI despacha as duas familias', () => {
  assert.deepStrictEqual(v.familiasPara(true, true), ['codigo', 'ui']);
});

// Ronda 2 do 8c.10: "Codigo sempre" mandava as 9 de codigo tambem na mudanca so de tela, contra
// a regra da spec (decisao 8) e a tabela do /esquadro:revisar. So tela, as 8. Nada declarado e
// duvida, e na duvida vao as duas - nunca nenhuma, que seria revisao sem voto.
test('veredito: mudanca so de tela despacha so a familia de tela; na duvida, as duas', () => {
  assert.deepStrictEqual(v.familiasPara(false, true), ['ui']);
  assert.deepStrictEqual(v.familiasPara(false, false), ['codigo', 'ui']);
  assert.deepStrictEqual(v.familiasPara(), ['codigo', 'ui']);
});

test('veredito: as duas familias somam 17 lentes sem chave repetida', () => {
  const todas = v.FAMILIAS.codigo.concat(v.FAMILIAS.ui);
  assert.strictEqual(todas.length, 17);
  assert.strictEqual(new Set(todas.map((l) => l.chave)).size, 17);
});

test('veredito: achado sem arquivo:linha nao conta (anti-teatro)', () => {
  const r = v.validarVeredito(veredito('correcao', [
    achado('P1', 'A.txt', 10),
    { severidade: 'P1', descricao: 'esta feio' }
  ]));
  assert.strictEqual(r.achadosValidos.length, 1);
  assert.ok(r.erros.some((e) => e.includes('arquivo')));
});

test('veredito: severidade fora dos tres niveis e descartada', () => {
  const r = v.validarVeredito(veredito('correcao', [achado('grave', 'A.txt', 3)]));
  assert.strictEqual(r.achadosValidos.length, 0);
});

test('veredito: veredito sem lente e recusado', () => {
  const r = v.validarVeredito({ melhor: 'A', achados: [] });
  assert.strictEqual(r.ok, false);
});

test('apurar: ronda 1 com P1 novo nao e seca', () => {
  const r = v.apurar([[veredito('correcao', [achado('P1', 'A.txt', 10)])]]);
  assert.strictEqual(r.secas, 0);
  assert.strictEqual(r.encerrar, false);
});

test('apurar: ronda so com P2 e seca (P2 vira registro, nao correcao)', () => {
  const r = v.apurar([[veredito('correcao', [achado('P2', 'A.txt', 10)])]]);
  assert.strictEqual(r.secas, 1);
});

test('apurar: achado repetido com a mesma evidencia nao molha a ronda', () => {
  const mesmo = [veredito('correcao', [achado('P1', 'A.txt', 10)])];
  const r = v.apurar([mesmo, mesmo, mesmo]);
  assert.strictEqual(r.secas, 2, 'rondas 2 e 3 nao trouxeram nada novo');
  assert.strictEqual(r.encerrar, true);
  assert.ok(r.motivo.includes('secas'));
});

test('apurar: duas rondas secas seguidas encerram aprovado', () => {
  const r = v.apurar([
    [veredito('correcao', [achado('P1', 'A.txt', 10)])],
    [veredito('correcao', [])],
    [veredito('correcao', [])]
  ]);
  assert.strictEqual(r.encerrar, true);
  assert.strictEqual(r.secas, 2);
});

test('apurar: teto de 3 rondas com P1 aberto para e manda ao dono', () => {
  const r = v.apurar([
    [veredito('correcao', [achado('P1', 'A.txt', 1)])],
    [veredito('correcao', [achado('P1', 'A.txt', 2)])],
    [veredito('correcao', [achado('P1', 'A.txt', 3)])]
  ]);
  assert.strictEqual(r.encerrar, true);
  assert.ok(r.motivo.includes('teto'));
  assert.ok(r.motivo.includes('dono') || r.motivo.includes('humano'));
});

test('apurar: P0 novo nunca e ronda seca', () => {
  const r = v.apurar([[veredito('seguranca', [achado('P0', 'B.txt', 7)])]]);
  assert.strictEqual(r.secas, 0);
});

test('apurar: placar A/B e sinal, e vem separado dos achados', () => {
  const r = v.apurar([[
    veredito('correcao', [], 'A'),
    veredito('seguranca', [], 'B'),
    veredito('microcopy', [], 'A')
  ]]);
  assert.deepStrictEqual(r.placar, { A: 2, B: 1, empate: 0 });
});

// Ronda 1 do 8c.5: a chave do achado nao levava a lente. Dois defeitos diferentes, de
// lentes diferentes, na mesma linha contavam como um - e o segundo, se voltasse sem
// correcao, nunca molhava a ronda. A mesma lente repetindo o mesmo lugar segue sendo um.
test('apurar: lentes diferentes na mesma linha sao dois achados; a mesma lente repetida, um', () => {
  const r = v.apurar([[
    veredito('correcao', [achado('P1', 'A.txt', 42, 'quebra com lista vazia')]),
    veredito('seguranca', [achado('P1', 'A.txt', 42, 'caminho sem guarda')])
  ]]);
  assert.deepStrictEqual(r.novos.map((a) => a.descricao).sort(), ['caminho sem guarda', 'quebra com lista vazia'],
    'duas lentes, dois defeitos na mesma linha: ' + JSON.stringify(r.novos));

  const r2 = v.apurar([
    [veredito('correcao', [achado('P1', 'A.txt', 42, 'quebra com lista vazia')])],
    [veredito('correcao', [achado('P1', 'A.txt', 42, 'quebra com lista vazia')]),
      veredito('seguranca', [achado('P1', 'A.txt', 42, 'caminho sem guarda')])]
  ]);
  assert.deepStrictEqual(r2.novos.map((a) => a.descricao), ['caminho sem guarda'],
    'na ronda 2 so a lente nova naquela linha e novidade: ' + JSON.stringify(r2.novos));
  assert.strictEqual(r2.secas, 0, 'um P1 novo de outra lente molha a ronda');

  // O motivo do teto conta os abertos pelo comeco da chave: a severidade tem de seguir primeiro.
  const r3 = v.apurar([
    [veredito('correcao', [achado('P1', 'A.txt', 42, 'quebra com lista vazia')])],
    [veredito('seguranca', [achado('P1', 'A.txt', 42, 'caminho sem guarda')])],
    [veredito('correcao', [achado('P2', 'A.txt', 7, 'nome que mente')])]
  ]);
  assert.ok(r3.motivo.includes('com 2 achado(s) P0/P1'), 'o teto conta os dois P1 e nao o P2: ' + r3.motivo);
});

// Ronda 2 do 8c.10: o apurar contava o que nao e veredito como voto sem achado, e a ronda saia
// seca por falta de voto. O apurar-ronda.js para antes; quem chama o apurar direto recebe o erro.
test('apurar: o que nao e veredito e recusado, e nao conta como voto seco', () => {
  const seca = [veredito('correcao', [])];
  const falsos = [[{}, 'sem lente'], [null, 'nao e objeto'],
    [{ lente: 'borda', melhor: 'talvez', achados: [] }, 'melhor'], [{ lente: 'borda', melhor: 'A' }, 'achados']];
  for (const [falso, motivo] of falsos) {
    assert.throws(() => v.apurar([seca, [falso]]), (e) => e.message.includes(motivo),
      'o apurar aceitou ' + JSON.stringify(falso) + ' como voto');
  }
  assert.strictEqual(v.apurar([seca, seca]).motivo, 'duas rondas secas seguidas: aprovado');
});

// D244/defeito 3 (D241 secao 2.3): na onda 7 as 3 rondas molharam com P1 do lado ANTIGO - o que
// a mudanca conserta. So o lado novo molha; o antigo sai listado a parte.
const P1 = (arquivo, linha, lente) => ({ lente: lente || 'design', melhor: 'A',
  achados: [{ severidade: 'P1', arquivo: arquivo, linha: linha, descricao: 'x' }] });
const TRAB_A = { A: 'trabalho', B: 'HEAD' };
const TRAB_B = { A: 'HEAD', B: 'trabalho' };

test('D244/defeito 3: P1 so do lado antigo nao molha a ronda', () => {
  const r = v.apurar([[P1('B.txt', 10)], [P1('A.txt', 12)]], { mapas: [TRAB_A, TRAB_B] });
  assert.strictEqual(r.encerrar, true, JSON.stringify(r));
  assert.strictEqual(r.motivo, 'duas rondas secas seguidas: aprovado');
  assert.strictEqual(r.achadosDoLadoAntigo.length, 1, 'o lado antigo da ultima ronda sai listado');
});

test('D244/defeito 3: P1 do lado novo continua molhando', () => {
  const r = v.apurar([[P1('A.txt', 10)]], { mapas: [TRAB_A] });
  assert.strictEqual(r.secas, 0);
  assert.strictEqual(r.novos.length, 1);
});

test('D244/defeito 3: a mesma linha do mesmo lado e o mesmo achado, mesmo com o rotulo trocado', () => {
  // ronda 1: trabalho = A; ronda 2: trabalho = B. Mesmo lugar do lado novo, rotulo diferente.
  const r = v.apurar([[P1('A.txt', 10)], [P1('B.txt', 10)], []], { mapas: [TRAB_A, TRAB_B, TRAB_A] });
  assert.strictEqual(r.encerrar, true);
  assert.strictEqual(r.motivo, 'duas rondas secas seguidas: aprovado', JSON.stringify(r));
});

test('D244/defeito 3: arquivo citado com caminho ainda acha o lado', () => {
  const r = v.apurar([[P1('.claude/esquadro/revisao/1/B.txt', 10)]], { mapas: [TRAB_A] });
  assert.strictEqual(r.secas, 1);
});

test('D244/defeito 3: refutado com prova nao molha; sem prova e recusado', () => {
  const vd = P1('A.txt', 7);
  const ref = [{ ronda: 1, lente: 'design', arquivo: 'A.txt', linha: 7, severidade: 'P1', prova: 'css/01.css:12 define o token' }];
  const r = v.apurar([[vd], []], { mapas: [TRAB_A, TRAB_A], refutados: ref });
  assert.strictEqual(r.motivo, 'duas rondas secas seguidas: aprovado', JSON.stringify(r));
  assert.throws(() => v.apurar([[vd]], { mapas: [TRAB_A],
    refutados: [{ ronda: 1, lente: 'design', arquivo: 'A.txt', linha: 7 }] }), /prova/);
});

test('D244/defeito 3: no teto, os abertos contados sao so os do lado novo nao refutados', () => {
  const r = v.apurar([[P1('A.txt', 1), P1('B.txt', 2, 'borda')], [P1('A.txt', 3)], [P1('A.txt', 4)]],
    { mapas: [TRAB_A, TRAB_A, TRAB_A] });
  assert.match(r.motivo, /teto de 3 rondas com 3 achado/);
});

test('D244/defeito 3: sem mapas (chamada antiga), a conta e a de antes', () => {
  const r = v.apurar([[P1('B.txt', 10)]]);
  assert.strictEqual(r.secas, 0, 'sem mapa nao da para saber o lado: conta, como antes');
});

// T14 ronda 1 (lente correcao): o inspetor que cita "A.txt:120" no campo arquivo perdia o lado, e
// o achado do lado antigo voltava a molhar - o defeito 3 de novo, calado.
test('T14: arquivo citado com a linha colada ainda acha o lado', () => {
  for (const arq of ['A.txt:120', 'A.txt:120-124', '.claude/esquadro/revisao/1/A.txt:7']) {
    const r = v.apurar([[P1(arq, 120)]], { mapas: [TRAB_B] });
    assert.strictEqual(r.secas, 1, arq + ' e do lado HEAD: ' + JSON.stringify(r));
    assert.strictEqual(r.achadosDoLadoAntigo.length, 1, arq);
  }
  // controle: o que nao e A nem B segue sem lado, e conta
  assert.strictEqual(v.apurar([[P1('A.txt.bak', 1)]], { mapas: [TRAB_B] }).secas, 0);
});

// T14 ronda 2 (lente correcao): outras formas que um inspetor escreve de verdade.
test('T14: citacao com linha por extenso, ancora ou espaco ainda acha o lado', () => {
  for (const arq of ['A.txt linha 45', 'A.txt#L12', 'A.txt: 120', ' a.txt ', 'C:\\x\\rev\\A.txt (linha 3)']) {
    const r = v.apurar([[P1(arq, 45)]], { mapas: [TRAB_B] });
    assert.strictEqual(r.secas, 1, JSON.stringify(arq) + ' e do lado HEAD: ' + JSON.stringify(r));
  }
  // controles: os dois rotulos juntos, ou nome que so contem A.txt, nao tem lado - e contam
  for (const arq of ['A.txt e B.txt', 'XA.txt', 'A.txt.bak', 'A.txtx']) {
    assert.strictEqual(v.apurar([[P1(arq, 1)]], { mapas: [TRAB_B] }).secas, 0, JSON.stringify(arq));
  }
});

// T14 ronda 2 (lente borda): `linha: true` virava 1 por coercao e derrubava o achado da linha 1.
test('T14: refutacao com ronda, linha ou lente mal formadas e recusada com o motivo', () => {
  const base = { ronda: 1, lente: 'correcao', arquivo: 'A.txt', linha: 1, severidade: 'P1', prova: 'x.js:1' };
  for (const [campo, valor] of [['linha', true], ['linha', ''], ['linha', '1'], ['linha', 0], ['ronda', '1'],
    ['ronda', null], ['lente', ''], ['lente', 3]]) {
    const r = Object.assign({}, base, { [campo]: valor });
    assert.throws(() => v.apurar([[P1('A.txt', 1, 'correcao')]], { mapas: [TRAB_A], refutados: [r] }),
      new RegExp(campo), campo + '=' + JSON.stringify(valor));
  }
  // lente com caixa ou espaco diferente ainda casa
  const ok = v.apurar([[P1('A.txt', 1, 'correcao')]], { mapas: [TRAB_A],
    refutados: [Object.assign({}, base, { lente: ' Correcao ' })] });
  assert.strictEqual(ok.secas, 1, JSON.stringify(ok));
});

// T14 ronda 1 (lente borda): refutacao sem A.txt/B.txt casava por null === null com um achado que
// tambem nao citava A nem B, e o achado sumia da apuracao.
test('T14: refutacao tem de citar A.txt ou B.txt', () => {
  const vd = P1('A.txt.bak', 42, 'correcao');
  for (const arquivo of ['', undefined, 'mapa.json']) {
    assert.throws(() => v.apurar([[vd]], { mapas: [TRAB_A],
      refutados: [{ ronda: 1, lente: 'correcao', arquivo: arquivo, linha: 42, prova: 'x.js:1' }] }), /A\.txt ou B\.txt/,
    String(arquivo));
  }
  // controle: a refutacao certa segue aceita
  const ok = v.apurar([[P1('A.txt', 42, 'correcao')]], { mapas: [TRAB_A],
    refutados: [{ ronda: 1, lente: 'correcao', arquivo: 'A.txt:42', linha: 42, severidade: 'P1', prova: 'x.js:1' }] });
  assert.strictEqual(ok.secas, 1, JSON.stringify(ok));
});

// D246 sec. 4.2: a virgula (e qualquer nao-palavra) e fronteira antes do nome. `A.txt,B.txt` cita os dois
// lados e fica sem lado; antes dava `A`, e o achado ia para o lado antigo.
test('D246: rotulo depois de virgula ou outra pontuacao conta', () => {
  for (const arq of ['A.txt,B.txt', 'A.txt;B.txt', '[A.txt,B.txt]', 'copia.A.txt']) {
    assert.strictEqual(v.apurar([[P1(arq, 1)]], { mapas: [TRAB_B] }).secas, 0, JSON.stringify(arq));
  }
  // um rotulo so, entre pontuacao, ainda acha o lado (A e o HEAD aqui)
  for (const arq of ['"A.txt"', '[A.txt]', 'arquivo=A.txt']) {
    assert.strictEqual(v.apurar([[P1(arq, 1)]], { mapas: [TRAB_B] }).secas, 1, JSON.stringify(arq));
  }
});

// D246 sec. 4.3: a refutacao casa pela severidade. Refutar o P1 de uma linha apagava o P0 da mesma lente e
// linha - medido antes: novos = 0.
test('D246: refutacao exige severidade e so derruba o achado dela', () => {
  const vd = { lente: 'correcao', melhor: 'A', achados: [
    { severidade: 'P0', arquivo: 'A.txt', linha: 5, descricao: 'apaga tudo' },
    { severidade: 'P1', arquivo: 'A.txt', linha: 5, descricao: 'mensagem ruim' }] };
  const ref = { ronda: 1, lente: 'correcao', arquivo: 'A.txt', linha: 5, severidade: 'P1', prova: 'x.js:1' };
  const r = v.apurar([[vd]], { mapas: [TRAB_A], refutados: [ref] });
  assert.strictEqual(r.secas, 0, JSON.stringify(r));
  assert.deepStrictEqual(r.novos.map((a) => a.severidade), ['P0'], JSON.stringify(r));
  for (const sev of [undefined, '', 'p1', 'P3', 1]) {
    assert.throws(() => v.apurar([[vd]], { mapas: [TRAB_A], refutados: [Object.assign({}, ref, { severidade: sev })] }),
      /severidade/, JSON.stringify(sev));
  }
});
