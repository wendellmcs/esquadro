'use strict';
const test = require('node:test');
const assert = require('node:assert');
const design = require('../scripts/lib/design.js');

const DESIGN = {
  cores: ['#ff6600', '#1a1a1a', '#ffffff'],
  raios: ['4px', '8px'],
  espacos: ['4px', '8px', '16px', '24px'],
  sombras: ['0 1px 2px rgba(0,0,0,.08)'],
  antiReferencias: ['gradiente', 'glassmorphism', 'sombra larga']
};

test('design: reconhece arquivo de estilo', () => {
  assert.strictEqual(design.ehArquivoDeEstilo('src/a.css', {}), true);
  assert.strictEqual(design.ehArquivoDeEstilo('src/a.scss', {}), true);
  assert.strictEqual(design.ehArquivoDeEstilo('src/a.js', {}), false);
});

test('design: caminho de estilo pode ser declarado no projeto', () => {
  const p = { design: { caminhosDeEstilo: ['src/tema/**'] } };
  assert.strictEqual(design.ehArquivoDeEstilo('src/tema/cores.ts', p), true);
});

test('design: extrai tokens de variaveis CSS', () => {
  const css = ':root{--cor-marca:#ff6600;--raio-m:8px;--espaco-g:24px;}';
  const t = design.extrairTokens(css);
  assert.ok(t.cores.includes('#ff6600'));
  assert.ok(t.raios.includes('8px'));
  assert.ok(t.espacos.includes('24px'));
});

test('design: valor cru fora do sistema e apontado com a linha', () => {
  const css = '.a{color:#ff6600;}\n.b{color:#00ff00;}';
  const r = design.conferir(css, DESIGN);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.fora.length, 1);
  assert.strictEqual(r.fora[0].valor, '#00ff00');
  assert.strictEqual(r.fora[0].linha, 2);
});

test('design: valor que esta no sistema passa', () => {
  assert.strictEqual(design.conferir('.a{color:#ff6600;border-radius:8px;}', DESIGN).ok, true);
});

test('design: cor em maiuscula casa com o token em minuscula', () => {
  assert.strictEqual(design.conferir('.a{color:#FF6600;}', DESIGN).ok, true);
});

test('design: uso de var() nunca e apontado', () => {
  assert.strictEqual(design.conferir('.a{color:var(--cor-marca);}', DESIGN).ok, true);
});

test('design: anti-referencia e apontada mesmo com valor valido', () => {
  const r = design.conferir('.a{background:linear-gradient(#ff6600,#1a1a1a);}', DESIGN);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fora.some((f) => f.tipo === 'anti-referencia'));
});

test('design: sem design.json declarado, nada e apontado', () => {
  assert.strictEqual(design.conferir('.a{color:#123456;}', null).ok, true);
});

test('design: motivo cita o token esperado, nao so o erro (D12)', () => {
  const r = design.conferir('.a{color:#00ff00;}', DESIGN);
  const m = design.motivo('src/a.css', r.fora, DESIGN);
  assert.ok(m.includes('#00ff00'));
  assert.ok(m.includes('#ff6600'), 'tem de mostrar o que existe no sistema');
  assert.ok(/^[\x20-\x7E\n]+$/.test(m), 'motivo tem de ser ASCII (R5)');
});

// --- D124: o par teste/codigo do plano nao fechava. Estes tres guardam a correcao. ---

test('design: anti-referencia em portugues casa com o cognato ingles do CSS (D124)', () => {
  // A entrevista coleta "gradiente"; o CSS diz "linear-gradient". Antes do radical, o
  // casamento pegava ZERO de 7 casos reais de CSS: portao vivo por fora, morto por dentro.
  const r = design.conferir('.a{background:radial-gradient(#ff6600,#1a1a1a);}', DESIGN);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.fora.map((f) => f.tipo), ['anti-referencia']);
  assert.strictEqual(r.fora[0].valor, 'gradiente', 'o motivo mostra o que o DONO escreveu');
});

test('design: CONTROLE NEGATIVO - o radical corta a vogal final, nao a palavra (D124)', () => {
  // Sem este controle, um radical guloso (que fosse cortando ate casar) passaria no teste
  // acima apontando qualquer CSS, e o portao viraria ruido. "bordado" NAO termina em "e":
  // fica inteiro, e nao pode casar "border". Cortado em 3 viraria "bor", e casaria.
  const b = { cores: [], raios: [], espacos: [], sombras: [], antiReferencias: ['bordado'] };
  assert.strictEqual(design.conferir('.a{border:inherit;}', b).ok, true,
    'radical guloso: "bor" casaria "border" e o portao negaria CSS inocente');
  assert.strictEqual(design.conferir('.a{/*bordado*/border:inherit;}', b).ok, false,
    'CONTROLE POSITIVO: quando a palavra INTEIRA esta la, o portao pega');
});

test('design: anti-referencia sem cognato ingles nao e pega - limite declarado (D124)', () => {
  // MEDIDO: vocabulario PT contra CSS EN pega 2 de 7 casos reais. So o par gradiente/gradient
  // tem cognato; "sombra larga" x "box-shadow" nao tem, e passa. Fica declarado AQUI para
  // ninguem confiar no portao alem do que ele mede, nem "consertar" isto calado.
  const so = { cores: [], raios: [], espacos: [], sombras: [], antiReferencias: ['sombra larga'] };
  assert.strictEqual(design.conferir('.a{box-shadow:inherit;}', so).ok, true,
    'o limite declarado tem de continuar visivel');
});

test('design: medida negativa e outro valor - -8px nao passa por 8px (ronda 1 do 8b)', () => {
  // O \b antes do digito ancorava depois do sinal: `margin: -8px` era lido 8px, e
  // com 8px no sistema o portao deixava passar um valor que ninguem declarou.
  const r = design.conferir('.a{margin:-8px;}', DESIGN);
  assert.strictEqual(r.ok, false, 'com 8px no sistema, -8px passou calado');
  assert.strictEqual(r.fora[0].valor, '-8px');
  assert.strictEqual(design.conferir('.a{margin: -8px;}', DESIGN).ok, false,
    'com espaco antes do sinal');
  // declarado, passa: o sinal e parte do valor, nao motivo de recusa
  const comNegativo = Object.assign({}, DESIGN, { espacos: DESIGN.espacos.concat(['-8px']) });
  assert.strictEqual(design.conferir('.a{margin:-8px;}', comNegativo).ok, true);
  // hifen de nome nao e sinal: o seletor .mt-8px segue lendo 8px, como antes
  assert.strictEqual(design.conferir('.mt-8px{margin:8px;}', DESIGN).ok, true,
    'o hifen colado a letra virou sinal de menos');
});

test('design: medida fora de px, rem e em passa sem conferencia - limite declarado (ronda 2 do 8b)', () => {
  // O portao le medida so nas unidades de UNIDADES. O `%` ficou de fora de proposito:
  // bloquea-lo acusaria todo `width:100%`. O limite esta escrito no README e no
  // CHANGELOG com estas mesmas unidades, e fica AQUI para ninguem confiar no portao
  // alem do que ele mede, nem "consertar" isto calado.
  assert.deepStrictEqual(design.UNIDADES, ['px', 'rem', 'em']);
  for (const u of design.UNIDADES) {
    assert.strictEqual(design.conferir('.a{margin:3' + u + ';}', DESIGN).ok, false,
      'controle: 3' + u + ' fora do sistema tinha de ser pego');
  }
  for (const v of ['50%', '2pt', '10vw', '1.5ch']) {
    assert.strictEqual(design.conferir('.a{border-radius:' + v + ';}', DESIGN).ok, true,
      v + ' passou a ser conferido: o limite escrito no README e no CHANGELOG ficou falso');
  }
});

// D244 (P2 da D238 secao 6): `.04em` era lido `04em` - o `\b` separa o ponto do digito, e a
// medida valida do sistema virava valor barrado.
test('D244/P2 .04em: medida sem zero a esquerda e lida inteira, com e sem sinal', () => {
  const v = (css) => design.valoresCrus(css).map((a) => a.valor);
  assert.deepStrictEqual(v('a { letter-spacing: .04em; }'), ['.04em']);
  assert.deepStrictEqual(v('a { margin: -.5em 0.04em 12px; }'), ['-.5em', '0.04em', '12px']);
  assert.strictEqual(design.conferir('a { letter-spacing: .04em; }', { espacos: ['.04em'] }).ok, true);
});
