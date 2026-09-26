'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const catraca = require('../scripts/lib/catraca.js');

/**
 * B7 - "quando o teste me atrapalha, eu tenho vontade de mexer no medidor".
 * O desenho da v1 §12 adiou o item; a autoavaliacao exigia "diff cruzado
 * teste x codigo". Cada teste que ACUSA vem com o par que NAO pode acusar.
 */

test('catraca: subir teto e afrouxar - acusa', () => {
  const r = catraca.afrouxou('const TETO = 3;', 'const TETO = 8;');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].de, 3);
  assert.strictEqual(r[0].para, 8);
  assert.strictEqual(r[0].familia, 'teto');
});

test('catraca: DESCER teto e apertar - NAO acusa (controle)', () => {
  assert.strictEqual(catraca.afrouxou('"teto": 200', '"teto": 150').length, 0);
});

test('catraca: descer piso e afrouxar - acusa', () => {
  const r = catraca.afrouxou('cobertura minima: 80', 'cobertura minima: 40');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].familia, 'piso');
});

test('catraca: SUBIR piso e apertar - NAO acusa (controle)', () => {
  assert.strictEqual(catraca.afrouxou('minimo: 40', 'minimo: 80').length, 0);
});

test('catraca: numero sem palavra de catraca NAO acusa (controle)', () => {
  assert.strictEqual(catraca.afrouxou('const x = 3;', 'const x = 900;').length, 0);
});

test('catraca: criar catraca nova NAO e afrouxar (controle)', () => {
  // Palavra que so existe depois e criacao. Exigir "antes" evita que escrever
  // uma catraca pela primeira vez seja lido como afrouxamento dela.
  assert.strictEqual(catraca.afrouxou('const A = 1;', 'const A = 1;\nconst TETO = 5;').length, 0);
});

test('catraca: acento nao esconde a palavra', () => {
  assert.strictEqual(catraca.semAcento('máximo'), 'maximo');
  assert.ok(catraca.afrouxou('máximo: 5', 'máximo: 50').length >= 1);
});

test('catraca: pega a forma de flag de linha de comando', () => {
  const r = catraca.afrouxou('--max-warnings 0', '--max-warnings 50');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].de, 0);
  assert.strictEqual(r[0].para, 50);
});

test('catraca: pega a forma camelCase do proprio projeto', () => {
  assert.strictEqual(catraca.afrouxou('tetoDeInstrucoes: 200', 'tetoDeInstrucoes: 400').length, 1);
});

test('catraca: o maior teto manda, mesmo se outro desceu junto', () => {
  const r = catraca.afrouxou('teto: 10\nteto: 20', 'teto: 5\nteto: 99');
  assert.strictEqual(r.length, 1, 'subir o teto mais alto e afrouxar, ainda que outro aperte');
  assert.strictEqual(r[0].para, 99);
});

test('catraca: motivo cita o arquivo e o numero que andou', () => {
  const m = catraca.motivo('regra.js', catraca.afrouxou('teto: 3', 'teto: 8'));
  assert.ok(m.includes('regra.js'));
  assert.ok(m.includes('3 -> 8'));
  assert.ok(/decisao humana/i.test(m), 'a recusa tem de dizer de quem e a decisao');
});

test('catraca: entrada vazia ou nula nao estoura', () => {
  assert.strictEqual(catraca.afrouxou(null, undefined).length, 0);
  assert.strictEqual(catraca.afrouxou('', '').length, 0);
});

// ── regressao: falsos positivos achados na auditoria de 2026-09-02 ──────────

test('catraca REGRESSAO: "climax" nao e "max" - palavra tem de comecar', () => {
  // Sem o \b no padrao, qualquer palavra que CONTENHA uma palavra de catraca
  // virava catraca, e o portao passava a negar edicao honesta.
  assert.strictEqual(catraca.afrouxou('climax: 1', 'climax: 7').length, 0);
  assert.strictEqual(catraca.afrouxou('administrador: 9', 'administrador: 5').length, 0);
  assert.strictEqual(catraca.afrouxou('terminal: 2', 'terminal: 8').length, 0);
});

test('catraca REGRESSAO: "maximo" conta UMA vez, nao duas', () => {
  // "maximo" e "max" casavam a mesma ocorrencia e o motivo saia duplicado.
  const r = catraca.afrouxou('maximo: 2', 'maximo: 8');
  assert.strictEqual(r.length, 1, 'reportou ' + r.length + ': ' + JSON.stringify(r.map((x) => x.palavra)));
  assert.strictEqual(r[0].palavra, 'maximo', 'a palavra mais longa e a que descreve o achado');
});

// Ronda 1 do 8c.5: a faixa de acentos do semAcento estava em caractere cru - uma marca
// combinante sozinha no fonte, invisivel no editor, que um salvamento em NFC pode fundir
// com o `[` e mudar o regex sem mudar nada que se veja. Os irmaos (auditoria.js,
// obrigacoes.js) usam escape. O semAcento com acento ja se confere acima.
test('catraca: nenhum script traz marca combinante crua - a faixa de acentos vai em escape', () => {
  const crus = [];
  const visitar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { visitar(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((linha, i) => {
        if ([...linha].some((ch) => ch.codePointAt(0) >= 0x300 && ch.codePointAt(0) <= 0x36f)) {
          crus.push(path.relative(path.join(__dirname, '..'), p) + ':' + (i + 1));
        }
      });
    }
  };
  visitar(path.join(__dirname, '..', 'scripts'));
  assert.deepStrictEqual(crus, [], 'marca combinante crua no fonte: ' + crus.join(', '));
});
