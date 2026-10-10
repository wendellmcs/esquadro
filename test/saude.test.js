'use strict';
const test = require('node:test');
const assert = require('node:assert');
const saude = require('../scripts/lib/saude.js');

test('saude: sessao nova nao dispara nada', () => {
  const r = saude.avaliar({});
  assert.strictEqual(r.disparou, false);
  assert.deepStrictEqual(r.gatilhos, []);
  assert.strictEqual(r.aviso, null);
});

test('saude: basta UM gatilho, nao a soma', () => {
  const r = saude.avaliar({ contadores: { revisao_fechada: 2 } });
  assert.strictEqual(r.disparou, true);
  assert.strictEqual(r.gatilhos.length, 1);
});

test('saude: 2 revisoes independentes fechadas disparam', () => {
  assert.strictEqual(saude.avaliar({ contadores: { revisao_fechada: 2 } }).disparou, true);
  assert.strictEqual(saude.avaliar({ contadores: { revisao_fechada: 1 } }).disparou, false);
});

test('saude: turnos com trabalho real disparam no limiar', () => {
  const limiares = { turnosComTrabalho: 12 };
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 11 }, limiares).disparou, false);
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 12 }, limiares).disparou, true);
});

test('saude: soma de bloqueios de portao dispara', () => {
  const e = { contadores: { fora_do_escopo: 3, comando_destrutivo: 2, fecho_sem_evidencia: 1 } };
  const r = saude.avaliar(e, { bloqueios: 5 });
  assert.strictEqual(r.disparou, true);
  assert.ok(r.gatilhos.some((g) => g.includes('bloqueio')));
});

test('saude: nome do gatilho aparece no aviso, para nao virar sensacao', () => {
  const r = saude.avaliar({ contadores: { revisao_fechada: 2 } });
  assert.ok(r.aviso.includes('revis'));
  assert.ok(r.aviso.includes('/esquadro:handoff'));
  assert.ok(/^[\x20-\x7E\n]+$/.test(r.aviso), 'aviso tem de ser ASCII (R5)');
});

test('saude: dois gatilhos ao mesmo tempo saem os dois no aviso', () => {
  const r = saude.avaliar({ turnosComTrabalho: 99, contadores: { revisao_fechada: 9 } });
  assert.strictEqual(r.gatilhos.length, 2);
});

test('saude: limiares do projeto sobrescrevem os padroes', () => {
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 3 }, { turnosComTrabalho: 3 }).disparou, true);
  assert.strictEqual(saude.avaliar({ turnosComTrabalho: 3 }).disparou, false);
});

test('saude: avisa uma vez so por sessao', () => {
  const e = { contadores: { revisao_fechada: 2 }, avisouSaude: true };
  assert.strictEqual(saude.avaliar(e).disparou, false);
});

// ------------------------------- T10-2/T10-3 (D357): decisao do dono e commit contam

test('T10-2: tres decisoes do dono respondidas disparam, e duas nao', () => {
  const dois = saude.avaliar({ decisoesDoDono: 2 });
  assert.strictEqual(dois.disparou, false);
  const tres = saude.avaliar({ decisoesDoDono: 3 });
  assert.strictEqual(tres.disparou, true);
  assert.deepStrictEqual(tres.gatilhos, ['3 decisoes do dono respondidas (limiar 3)']);
  assert.strictEqual(saude.LIMIARES_PADRAO.decisoesDoDono, 3);
});

test('T10-3: tres commits na sessao disparam, e dois nao', () => {
  const dois = saude.avaliar({ commitsFeitos: 2 });
  assert.strictEqual(dois.disparou, false);
  const tres = saude.avaliar({ commitsFeitos: 3 });
  assert.strictEqual(tres.disparou, true);
  assert.deepStrictEqual(tres.gatilhos, ['3 commits nesta sessao (limiar 3)']);
  assert.strictEqual(saude.LIMIARES_PADRAO.commits, 3);
});

test('T10-2/3: o projeto sobrescreve os dois limiares, e o aviso segue ASCII', () => {
  assert.strictEqual(saude.avaliar({ decisoesDoDono: 1 }, { decisoesDoDono: 1 }).disparou, true);
  assert.strictEqual(saude.avaliar({ commitsFeitos: 1 }, { commits: 1 }).disparou, true);
  const r = saude.avaliar({ decisoesDoDono: 5, commitsFeitos: 5 });
  assert.strictEqual(r.gatilhos.length, 2);
  assert.ok(/^[\x20-\x7E\n]+$/.test(r.aviso), 'aviso tem de ser ASCII (R5)');
});

test('T10-2/3: valor que nao e numero no estado nunca dispara (estado corrompido nao vira aviso)', () => {
  assert.strictEqual(saude.avaliar({ decisoesDoDono: { campo: 'x' }, commitsFeitos: 'muitos' }).disparou, false);
});

// ------------------------------- D412: o prompt do handoff vai ao chat

test('D412: arquivo de handoff = .md com data na frente e "handoff" no nome ou na pasta', () => {
  for (const p of [
    '.claude/esquadro/handoff/2026-10-10-esquadro-decisor-local-bateria-s35.md',
    'C:\\obra\\app\\.context\\plans\\2026-10-10-item4-fechado-handoff.md',
    '/c/proj/esquadro/.context/plans/2026-10-08-esquadro-pendencias-sequencia-unica-handoff.md',
    'plans/2026-10-10-HANDOFF-x.MD'
  ]) assert.strictEqual(saude.ehArquivoDeHandoff(p), true, p);
  for (const p of [
    'skills/handoff/SKILL.md',              // a skill, nao um handoff
    '.claude/esquadro/handoff/notas.md',     // sem data na frente
    'docs/handoff.md',
    '.context/plans/2026-10-10-plano.md',    // data sem "handoff"
    '.context/plans/2026-10-10-x-handoff.txt',
    'handoff/2026-10-10-x.md.bak',
    '', null, undefined, 42, { file_path: 'x' }
  ]) assert.strictEqual(saude.ehArquivoDeHandoff(p), false, String(p));
});

test('D412: bloco de codigo = cerca em linha propria com corpo nao vazio, de qualquer linguagem', () => {
  for (const t of [
    'Prompt:\n```\nRetomando o esquadro\n```',
    'Prompt:\n```text\nRetomando\nlinha 2\n```\nfim',
    '  ```md\n# titulo\n  ```',
    '~~~\nRetomando\n~~~',
    // revisao da sessao 41: a cerca sem fecho vai ate o fim do texto (CommonMark) - o prompt esta
    // visivel em bloco; fecho mais longo que a abertura fecha; fecho mais curto nao fecha; CRLF.
    '```\nabre e nunca fecha',
    '````\nRetomando\n`````',
    '```\nRetomando\n``\n',
    '```\r\nRetomando\r\n```\r\n',
    '```\n~~~\n',                     // cerca de outro caractere e corpo, nao fecho
    // ronda 2: cerca dentro de citacao e de item de lista (CommonMark mostra o bloco)
    '> ```\n> Retomando\n> ```',
    '- ```\n  Retomando\n  ```',
    '1. ```\n   Retomando\n   ```'
  ]) assert.strictEqual(saude.temBlocoDeCodigo(t), true, JSON.stringify(t));
  for (const t of [
    'sem bloco nenhum',
    'so `codigo` inline',
    '```\n   \n```',                 // corpo vazio
    'texto ```inline``` no meio',
    '```x``` e inline\nmais uma linha', // crase na info string: nao abre cerca (CommonMark)
    '```\n  \n',                     // sem fecho e corpo vazio
    '````\n\n`````',                 // fecho mais longo fecha: corpo vazio
    '```\r\n\r\n```\r\n',            // CRLF: o fecho fecha, corpo vazio
    '', null, undefined, 7
  ]) assert.strictEqual(saude.temBlocoDeCodigo(t), false, JSON.stringify(t));
});

// D417 (registro da revisao da sessao 41): as bordas do CommonMark que a 0.5.3 nao seguia.
test('D417: recuo da cerca ate 3 colunas (relativo ao item de lista), fim da citacao, linha so ">", NBSP', () => {
  for (const t of [
    '   ```\nRetomando\n   ```',                  // 3 espacos ainda e cerca
    '1. passo\n    ```\n    Retomando\n    ```',  // 4 espacos sob "1. " = 1 coluna dentro do item
    '- passo\n\n  ```\n  Retomando\n  ```',
    '```\n    ```\n',                              // fecho com 4 espacos e corpo, nao fecho
    '> ```\n> Retomando\n\nfim',                   // o corpo veio antes de a citacao acabar
    '> > ```\n> > Retomando\n> > ```',
    '> ```\n> > Retomando\n> ```',                 // `>` a mais dentro da citacao e corpo
    '```\n>\n```',                                 // linha so `>` fora de citacao e corpo
    '```\n> ```\n```',                             // `> ```` fora de citacao e corpo, nao fecho
    '```\n \n```'                             // NBSP e conteudo (CommonMark: branco e so espaco e tab)
  ]) assert.strictEqual(saude.temBlocoDeCodigo(t), true, JSON.stringify(t));
  for (const t of [
    'texto\n    ```\n    Retomando\n    ```',    // 4 espacos fora de lista nao abre cerca
    '    ```\nRetomando',
    '\t```\nRetomando',                           // tab = 4 colunas
    '> ```\n\nTexto qualquer depois',              // a citacao acabou com a cerca vazia
    '> ```\nTexto sem marca\n```',                 // idem; o ``` da ultima linha abre cerca vazia
    '> ```\n>\n> ```',                             // linha so `>` DENTRO da citacao e vazia
    '```\n \t \n```',
    '- item\n\nfora da lista\n\n    ```\n    Retomando\n    ```', // a lista acabou: 4 espacos e bloco recuado
    '1. item\n>     ```\n>     Retomando\n>     ```' // a citacao nao herda a coluna da lista de fora
  ]) assert.strictEqual(saude.temBlocoDeCodigo(t), false, JSON.stringify(t));
});

// Revisao da sessao 44: o tab depois de `>` conta a partir da coluna real (CommonMark), nao da 0.
test('D417: tab depois da marca de citacao - a coluna e a real, e o espaco opcional sai do tab', () => {
  for (const t of [
    '>\t```\n>\tRetomando\n>\t```',   // `>` na coluna 0, tab ate a 4: 3 colunas, 1 e o espaco opcional = recuo 2
    '> \t```\n> \tRetomando',          // espaco opcional, tab da coluna 2 ate a 4 = recuo 2
    '>    ```\n>    Retomando'          // controle: `>` + 4 espacos = espaco opcional + recuo 3 (ja era assim)
  ]) assert.strictEqual(saude.temBlocoDeCodigo(t), true, JSON.stringify(t));
  for (const t of [
    '>\t\t```\n>\t\tRetomando',        // 3 + 4 = 7 colunas, menos o espaco opcional = 6: bloco recuado
    '>     ```\n>     Retomando'        // controle: `>` + 5 espacos = recuo 4 (ja era assim)
  ]) assert.strictEqual(saude.temBlocoDeCodigo(t), false, JSON.stringify(t));
});

test('D417: arquivosTocados que nao e lista nunca dispara (estado corrompido nao vira aviso)', () => {
  assert.strictEqual(saude.avaliar({ arquivosTocados: 'x'.repeat(30) }).disparou, false);
  assert.strictEqual(saude.avaliar({ arquivosTocados: { length: 99 } }).disparou, false);
  const lista = Array.from({ length: 25 }, (_, i) => 'a' + i + '.js');
  assert.strictEqual(saude.avaliar({ arquivosTocados: lista }).disparou, true, 'controle: 25 arquivos disparam');
});

test('D412: com o prompt ja colado, a instrucao da saude nao manda colar de novo', () => {
  const g = ['3 decisoes do dono respondidas (limiar 3)'];
  const normal = saude.instrucaoAoModelo(g);
  assert.ok(normal.indexOf('/esquadro:handoff') !== -1 && /Cole o prompt/.test(normal), 'controle: ' + normal);
  for (const t of [saude.instrucaoAoModelo(g, true)]) {
    assert.ok(t.indexOf(g[0]) !== -1, 'tem de citar o gatilho: ' + t);
    assert.ok(/chat novo/.test(t), 'tem de mandar dizer que e hora de abrir chat novo: ' + t);
    assert.ok(!/Cole o prompt/.test(t), 'mandou colar de novo: ' + t);
    assert.ok(!/Rode \/esquadro:handoff/.test(t), 'mandou rodar o handoff de novo: ' + t);
    assert.ok(/nao cole/.test(t) && /acima/.test(t), 'tem de mandar apontar para o bloco acima: ' + t);
    assert.ok(/sigo/.test(t), 'tem de proibir o "sigo?": ' + t);
    assert.ok(/^[\x20-\x7E\n]+$/.test(t), 'tem de ser ASCII (R5): ' + JSON.stringify(t));
  }
  // so `true` muda: valor truthy de estado corrompido nao tira a ordem de colar
  assert.strictEqual(saude.instrucaoAoModelo(g, 'sim'), normal);
});

test('D412: o motivo do bloqueio diz o que fazer, como desligar, e e ASCII', () => {
  const m = saude.MOTIVO_HANDOFF_SEM_PROMPT;
  assert.ok(/handoff/.test(m) && /bloco/.test(m), m);
  assert.ok(m.indexOf('"portaoHandoff": false') !== -1, 'tem de dizer como desligar (D415): ' + m);
  assert.ok(/^[\x20-\x7E\n]+$/.test(m), 'tem de ser ASCII (R5): ' + JSON.stringify(m));
  assert.ok(saude.BALDES_DE_BLOQUEIO.indexOf('handoff_sem_prompt') !== -1, 'o balde novo nega: entra na soma');
});
