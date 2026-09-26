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
