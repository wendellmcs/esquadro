'use strict';
// D466/D467/D468 (0.7.0): menos paradas. Ligado por padrao: validar pelo proprio agente antes de pedir acao
// manual. Sob a chave `modoContinuo` (so o booleano true liga): os gatilhos contaveis de revisoes, decisoes,
// commits, turnos e arquivos nao pedem troca de chat; tamanho, alarme e bloqueios seguem.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../scripts/lib/continuo.js');
const saude = require('../scripts/lib/saude.js');
const projetoLib = require('../scripts/lib/projeto.js');

test('continuo: o bloco padrao manda validar antes de pedir acao manual e diz como ligar a chave', () => {
  const b = c.bloco(null);
  assert.ok(/^# esquadro - menos paradas/.test(b), 'titulo');
  assert.ok(/valide voce mesmo/.test(b), 'validar pelo proprio agente');
  assert.ok(/credencial/.test(b) && /num pedido so/.test(b), 'o que pedir ao dono, junto');
  assert.ok(!/Modo continuo ligado/.test(b), 'sem a chave o bloco nao diz que esta ligado');
  assert.ok(b.indexOf('"' + c.CHAVE + '": true') !== -1, 'diz como ligar com a chave que o codigo le');
});

test('continuo: com a chave, o bloco diz o que para e o que nao para, e manda decidir o tecnico', () => {
  const b = c.bloco({ modoContinuo: true });
  assert.ok(/Modo continuo ligado/.test(b), b);
  assert.ok(/tamanho da conversa/.test(b) && /bloqueios/.test(b), 'o que ainda pede troca');
  assert.ok(/Releia o trecho do plano/.test(b), 'reler o plano antes de cada subitem');
  assert.ok(/irreversivel/.test(b) && /custo/.test(b) && /produto/.test(b), 'quando ainda perguntar');
  assert.ok(/credencial, permissao ou seguranca/.test(b), 'SP7: credencial, permissao e seguranca vao ao dono');
  assert.ok(b.indexOf('"' + c.CHAVE + '": false') !== -1, 'diz como desligar');
});

test('continuo: so o booleano true liga; ASCII puro e dentro do teto', () => {
  for (const v of [null, undefined, {}, { modoContinuo: 'true' }, { modoContinuo: 1 }, { modoContinuo: false }, [], 'x']) {
    assert.strictEqual(c.ativo(v), false, JSON.stringify(v));
    assert.strictEqual(c.bloco(v), c.bloco(null), JSON.stringify(v));
  }
  assert.strictEqual(c.ativo({ modoContinuo: true }), true);
  for (const b of [c.bloco(null), c.bloco({ modoContinuo: true })]) {
    assert.ok(/^[\x20-\x7E\n]+$/.test(b), 'caractere fora de ASCII');
    assert.ok(b.length <= c.TETO, 'bloco com ' + b.length + ' caracteres, teto ' + c.TETO);
  }
});

test('continuo: a chave e de liga/desliga do projeto.json (aviso de tipo e validar)', () => {
  assert.ok(projetoLib.CHAVES_LIGA_DESLIGA.indexOf('modoContinuo') !== -1);
  assert.ok(projetoLib.avisosDeTipo({ modoContinuo: 'true' }).indexOf('modoContinuo tem de ser true ou false') !== -1);
  assert.deepStrictEqual(projetoLib.avisosDeTipo({ modoContinuo: true }), []);
});

test('D468: com a chave, revisoes, decisoes, commits, turnos e arquivos nao disparam; tamanho e bloqueios sim', () => {
  const cheio = {
    turnosComTrabalho: 99, arquivosTocados: new Array(40).fill('a'), decisoesDoDono: 9, commitsFeitos: 9,
    contadores: { revisao_fechada: 9 }
  };
  assert.strictEqual(saude.avaliar(cheio).disparou, true, 'controle: sem a chave dispara');
  assert.strictEqual(saude.avaliar(cheio, null, true).disparou, false, 'com a chave os cinco calam');
  const m = saude.medir(cheio, null, true);
  for (const chave of c.CALADOS) {
    const g = m.find((x) => x.chave === chave);
    assert.strictEqual(g.cruzou, false, chave);
    assert.strictEqual(g.calado, true, chave);
  }
  assert.deepStrictEqual(c.CALADOS.slice().sort(),
    ['arquivosTocados', 'commits', 'decisoesDoDono', 'revisoesFechadas', 'turnosComTrabalho']);
  assert.strictEqual(saude.avaliar({ contadores: { cd_solto: 6 } }, null, true).disparou, true, 'bloqueios seguem');
  assert.strictEqual(saude.avaliar({ tokensDeContexto: 260000 }, null, true).disparou, true, 'tamanho segue');
  assert.strictEqual(saude.avaliar({ avisouSaude: true, tokensDeContexto: 460000 }, null, true).alarme, true, 'alarme segue');
  // so o booleano true cala
  assert.strictEqual(saude.avaliar(cheio, null, 'true').disparou, true);
});

test('continuo: o medidor da sessao mostra o gatilho calado pela chave, sem dizer que cruzou', () => {
  const medidor = require('../scripts/lib/medidor.js');
  const m = saude.medir({ turnosComTrabalho: 99 }, null, true);
  const r = medidor.linhaDaSessao({ uso: null, amostras: [], medidas: m, avisouSaude: false });
  const linha = r.longa.split('\n').filter((l) => /turnos com trabalho real/.test(l))[0];
  assert.ok(linha && /modo continuo: nao dispara/.test(linha) && !/cruzou/.test(linha), r.longa);
});

test('continuo: a linha curta do medidor conta so os gatilhos que podem disparar (M2, D490)', () => {
  const medidor = require('../scripts/lib/medidor.js');
  const m = saude.medir({ turnosComTrabalho: 99 }, null, true);
  const podem = m.filter((g) => g.calado !== true).length;
  assert.strictEqual(m.length - podem, c.CALADOS.length, 'controle: os cinco calados estao na lista');
  const r = medidor.linhaDaSessao({ uso: null, amostras: [], medidas: m, avisouSaude: false });
  assert.ok(new RegExp('troca: 0 de ' + podem + ' gatilhos').test(r.curta), r.curta);
  const cruzou = medidor.linhaDaSessao({ uso: null, amostras: [], medidas: saude.medir({ tokensDeContexto: 260000 }, null, true), avisouSaude: false });
  assert.ok(new RegExp('troca: 1 de ' + podem + ' cruzou').test(cruzou.curta), cruzou.curta);
  // sem a chave, nada se cala: o denominador segue todos
  const sem = medidor.linhaDaSessao({ uso: null, amostras: [], medidas: saude.medir({}, null), avisouSaude: false });
  assert.ok(new RegExp('troca: 0 de ' + m.length + ' gatilhos').test(sem.curta), sem.curta);
});

test('continuo: a esquadro:padrao e o README falam da chave e da validacao pelo proprio agente', () => {
  const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const skill = ler('skills/padrao/SKILL.md');
  assert.ok(skill.indexOf('`modoContinuo`') !== -1, 'a skill nao cita a chave');
  assert.ok(/valid(?:e|ar) (?:você|pelo próprio agente)/.test(skill), 'a skill nao manda validar antes de pedir');
  const readme = ler('README.md');
  assert.ok(readme.indexOf('`modoContinuo`') !== -1, 'o README nao cita a chave');
});
