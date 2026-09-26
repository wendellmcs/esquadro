'use strict';
const test = require('node:test');
const assert = require('node:assert');
const saude = require('../scripts/lib/saude.js');
const { baldesNoCodigo, SO_CONTAM } = require('./auxiliar-baldes.js');

/**
 * A lacuna que este arquivo existe para impedir aconteceu de verdade: as travas
 * 7 e 8 entraram com balde proprio, e a lista de bloqueios do saude.js ficou
 * para tras. O portao continuava negando; so o SINAL de desgaste da sessao e que
 * passou a contar a menos - em silencio, sem teste vermelho.
 *
 * Lista escrita a mao envelhece calada. A cura nao e lembrar de atualizar: e um
 * teste que le o que os portoes de fato incrementam e compara. O leitor mora em
 * `auxiliar-baldes.js`, porque o pre-voo da publicacao le o mesmo.
 */

test('baldes: todo balde de bloqueio esta na lista do saude.js', () => {
  const noCodigo = baldesNoCodigo();
  const naLista = new Set(saude.BALDES_DE_BLOQUEIO);
  const faltando = [];
  for (const b of noCodigo) {
    if (SO_CONTAM.has(b)) continue;
    if (!naLista.has(b)) faltando.push(b);
  }
  assert.deepStrictEqual(faltando, [],
    'balde que nega mas nao conta para o gatilho de saude: ' + faltando.join(', '));
});

test('baldes: a lista do saude.js nao tem balde que nao existe mais', () => {
  const noCodigo = baldesNoCodigo();
  const orfaos = saude.BALDES_DE_BLOQUEIO.filter((b) => !noCodigo.has(b));
  assert.deepStrictEqual(orfaos, [],
    'a lista soma balde que nenhum portao incrementa: ' + orfaos.join(', '));
});

test('baldes: o instrumento acha alguma coisa (controle positivo)', () => {
  // Sem isto, um leitor quebrado devolveria o conjunto vazio e os dois testes
  // acima passariam dizendo "nada faltando" - o modo de falha mais perigoso.
  const noCodigo = baldesNoCodigo();
  assert.ok(noCodigo.size >= 10, 'o leitor de baldes achou so ' + noCodigo.size);
  assert.ok(noCodigo.has('fecho_sem_evidencia'), 'nao achou o balde escrito fora do incrementar()');
  assert.ok(noCodigo.has('criou_sem_buscar'), 'nao achou o balde da trava 7');
  assert.ok(noCodigo.has('catraca_afrouxada'), 'nao achou o balde da trava 8');
});

test('baldes: os que so contam nao viram bloqueio (controle negativo)', () => {
  for (const b of SO_CONTAM) {
    assert.ok(saude.BALDES_DE_BLOQUEIO.indexOf(b) === -1,
      b + ' conta sem negar; somar como bloqueio inflaria o gatilho de desgaste');
  }
});
