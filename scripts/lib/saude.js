'use strict';

// Gatilhos CONTAVEIS, do arquivo de regras do projeto. Basta UM; nao e preciso somar.
// O que nao da para contar (inflacao de contexto) nao vira gatilho fingido: fica de fora.
const LIMIARES_PADRAO = {
  turnosComTrabalho: 15,   // conversa longa com edicao a cada turno
  revisoesFechadas: 2,     // 2+ tarefas com revisao independente fechadas
  bloqueios: 6,            // soma dos disparos de portao: sinal de desgaste
  arquivosTocados: 25,     // diff largo demais para caber na cabeca
  decisoesDoDono: 3,       // T10-2: respostas do dono a AskUserQuestion
  commits: 3               // T10-3: git commit que passou (3, nao 1: o aviso sai uma vez por sessao)
};

/**
 * Todo balde de trava que NEGA. Balde novo que fique de fora daqui some do
 * gatilho de saude em silencio: o portao continua negando, e o sinal de "esta
 * sessao ja bateu demais na trave" para de contar aquela trave.
 *
 * Aconteceu de verdade quando as travas 7 e 8 entraram - por isso a lista virou
 * constante exportada, e ha um teste que a confere contra o que os portoes
 * realmente incrementam (test/baldes.test.js). Lista escrita a mao envelhece calada.
 */
const BALDES_DE_BLOQUEIO = [
  'fora_do_escopo', 'sem_escopo', 'comando_destrutivo', 'shell_idioma_errado',
  'fecho_sem_evidencia', 'subitem_pendente', 'outra_frente', 'intocavel',
  'token_fora_do_sistema', 'agente_caro_em_marcha_rapida',
  'criou_sem_buscar', 'catraca_afrouxada', 'cd_solto',
  // T11-1: estilo escrito por comando de shell (modulo de design, como o token_fora_do_sistema).
  'estilo_por_shell',
  // F6-04: nome de frente invalido e "Fora" declarado tinham o balde fora_do_escopo; agora cada um tem o seu.
  'frente_invalida', 'fora_declarado',
  // D412: handoff gravado no turno sem o prompt no chat.
  'handoff_sem_prompt'
];

function soma(contadores, chaves) {
  return chaves.reduce(function (t, k) { return t + ((contadores && contadores[k]) || 0); }, 0);
}

function avaliar(estado, limiares) {
  const e = estado || {};
  if (e.avisouSaude) return { disparou: false, gatilhos: [], aviso: null };

  const L = Object.assign({}, LIMIARES_PADRAO, limiares || {});
  const c = e.contadores || {};
  const gatilhos = [];

  if ((e.turnosComTrabalho || 0) >= L.turnosComTrabalho) {
    gatilhos.push(e.turnosComTrabalho + ' turnos com trabalho real (limiar ' + L.turnosComTrabalho + ')');
  }
  if ((c.revisao_fechada || 0) >= L.revisoesFechadas) {
    gatilhos.push((c.revisao_fechada || 0) + ' revisoes independentes fechadas (limiar ' + L.revisoesFechadas + ')');
  }
  const bloqueios = soma(c, BALDES_DE_BLOQUEIO);
  if (bloqueios >= L.bloqueios) {
    gatilhos.push(bloqueios + ' bloqueios de portao nesta sessao (limiar ' + L.bloqueios + ')');
  }
  // Array.isArray, como o typeof abaixo: texto ou objeto no estado corrompido nunca vira aviso.
  if ((Array.isArray(e.arquivosTocados) ? e.arquivosTocados.length : 0) >= L.arquivosTocados) {
    gatilhos.push(e.arquivosTocados.length + ' arquivos tocados (limiar ' + L.arquivosTocados + ')');
  }
  // typeof: estado corrompido (objeto, texto) nunca vira aviso.
  if (typeof e.decisoesDoDono === 'number' && e.decisoesDoDono >= L.decisoesDoDono) {
    gatilhos.push(e.decisoesDoDono + ' decisoes do dono respondidas (limiar ' + L.decisoesDoDono + ')');
  }
  if (typeof e.commitsFeitos === 'number' && e.commitsFeitos >= L.commits) {
    gatilhos.push(e.commitsFeitos + ' commits nesta sessao (limiar ' + L.commits + ')');
  }

  if (!gatilhos.length) return { disparou: false, gatilhos: [], aviso: null };

  const aviso = [
    'esquadro - hora de abrir chat novo. Gatilho contavel disparou:',
    gatilhos.map(function (g) { return '  - ' + g; }).join('\n'),
    'Rode /esquadro:handoff, cole o prompt pronto num chat novo, e continue de la.',
    'Se surgiu a duvida "ja e hora?", ja era.'
  ].join('\n');

  return { disparou: true, gatilhos: gatilhos, aviso: aviso };
}

/**
 * T10-1 (D357): o texto que vai ao MODELO quando a saude dispara (additionalContext do Stop).
 * O aviso de `avaliar` e para o usuario; este e a ordem para o Claude agir na mesma resposta.
 * D412: com `promptJaColado === true` (o turno gravou o handoff e a resposta final ja tem o bloco)
 * a ordem nao manda rodar nem colar de novo - mandar colar sem olhar a resposta era a duplicacao
 * que a decisao 650 da extensao tentou evitar tirando a ordem de colar.
 * So o booleano `true` muda a ordem, de proposito: um valor truthy qualquer (estado corrompido) cai
 * na ordem de colar. Na duvida, colar duas vezes custa menos que o prompt nao chegar ao chat.
 */
function instrucaoAoModelo(gatilhos, promptJaColado) {
  if (promptJaColado === true) {
    return [
      'esquadro: gatilho contavel de saude do contexto disparou. E hora de abrir chat novo.',
      (gatilhos || []).map(function (g) { return '  - ' + g; }).join('\n'),
      'O prompt do handoff ja esta no bloco de codigo da sua resposta acima: nao rode o handoff de novo e',
      'nao cole o bloco outra vez. Nesta mesma resposta, diga ao usuario, com todas as letras, que e hora',
      'de abrir chat novo, cite o gatilho acima que disparou e aponte para o bloco acima.',
      'Nao pergunte "sigo?" antes de oferecer a troca: a troca vem primeiro.'
    ].join('\n');
  }
  return [
    'esquadro: gatilho contavel de saude do contexto disparou. E hora de abrir chat novo.',
    (gatilhos || []).map(function (g) { return '  - ' + g; }).join('\n'),
    'Faca agora, nesta mesma resposta:',
    '1. Rode /esquadro:handoff.',
    '2. Diga ao usuario, com todas as letras, que e hora de abrir chat novo, e cite o gatilho acima que disparou.',
    '3. Cole o prompt pronto do handoff no chat, em bloco de codigo (nao basta gravar no arquivo).',
    'Nao pergunte "sigo?" antes de oferecer a troca: a troca vem primeiro.'
  ].join('\n');
}

const NOME_DA_SAUDE = '(?:contexto|memoria|context(?: window)?|memory)';
const ESTADO_DA_SAUDE = '(?:bom|boa|ok|okay|cheio|cheia|lotado|lotada|estourando|saudavel|aguenta|aguentando|full|fine|healthy|good|enough)';
const PERGUNTAS_DE_SAUDE = [
  // "o contexto esta bom?", "contexto ta cheio?", "sua memoria esta ok?", "is your context getting full?"
  new RegExp('\\b' + NOME_DA_SAUDE + '\\s+(?:\\w+\\s+){0,2}?' + ESTADO_DA_SAUDE + '\\b'),
  // "como esta a memoria?", "how is your context?", "how is the context window doing?"
  new RegExp('\\b(?:como\\s+(?:esta|ta|anda)|how(?:\'s|s| is| are))\\s+(?:\\w+\\s+){0,2}?' + NOME_DA_SAUDE +
    '\\s*(?:doing|going|looking|\\?|$)')
];

/**
 * T10-4 (D357): o usuario perguntou se o contexto/memoria da conversa esta bom? Conservador de
 * proposito: precisa do substantivo E de um termo de estado, E de cara de pergunta - "adicione
 * contexto ao README" e "memory leak no modulo" nao disparam. A pergunta E a resposta.
 */
function perguntaSobreSaude(prompt) {
  if (typeof prompt !== 'string') return false;
  const t = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return false;
  const temCaraDePergunta = t.indexOf('?') !== -1 ||
    /^(?:como|how|is|are|esta|ta|ainda|qual)\b/.test(t) ||
    new RegExp('^(?:o |a |seu |sua |esse |essa |your |the |this )?' + NOME_DA_SAUDE + ' (?:esta|ta|ainda)\\b').test(t);
  if (!temCaraDePergunta) return false;
  return PERGUNTAS_DE_SAUDE.some(function (re) { return re.test(t); });
}

/** T10-4: o que o modelo recebe quando o usuario pergunta pela saude do contexto. */
const INSTRUCAO_DA_PERGUNTA = [
  'esquadro: o usuario perguntou se o contexto/memoria desta conversa esta bom. A pergunta E a resposta:',
  'e hora de trocar de chat. Faca agora, nesta mesma resposta:',
  '1. Rode /esquadro:handoff.',
  '2. Diga ao usuario, com todas as letras, que e hora de abrir chat novo, e por que (ele perguntou).',
  '3. Cole o prompt pronto do handoff no chat, em bloco de codigo.',
  'Nao responda "esta tudo bem" nem pergunte "sigo?" antes de oferecer a troca.'
].join('\n');

/**
 * D412: arquivo de handoff = `.md` com data AAAA-MM-DD- na frente do nome e "handoff" no nome
 * (`<data>-<slug>-handoff.md`, o padrao dos planos) ou na pasta (`handoff/<data>-<slug>.md`, onde
 * a skill grava, skills/handoff/SKILL.md:25). A data exclui a propria skill (`handoff/SKILL.md`).
 */
function ehArquivoDeHandoff(caminho) {
  if (typeof caminho !== 'string' || !caminho) return false;
  const partes = caminho.replace(/\\/g, '/').split('/');
  const nome = partes[partes.length - 1];
  const pasta = partes.length > 1 ? partes[partes.length - 2] : '';
  if (!/^\d{4}-\d{2}-\d{2}-.*\.md$/i.test(nome)) return false;
  return /handoff/i.test(nome) || /^handoff$/i.test(pasta);
}

/**
 * D412: a resposta tem bloco de codigo? Cerca de ``` ou ~~~ em linha propria, de qualquer
 * linguagem, com corpo nao vazio. Nao confere que o bloco e o prompt: o portao le texto, nao
 * intencao (a D412 fala em "nao tem bloco de codigo").
 * Fecho como no CommonMark: mesmo caractere, comprimento >= o da abertura, so espaco depois; sem
 * fecho, o bloco vai ate o fim do texto (o prompt aparece em bloco do mesmo jeito). Uma passada
 * por linha: sem regex com retrorreferencia, que custava o texto inteiro por cerca aberta.
 * A cerca pode vir dentro de citacao (`> `) ou de item de lista (`- `, `1. `); cerca de crases com
 * crase no resto da linha de abertura nao abre (e codigo inline, CommonMark).
 * Bordas do CommonMark (D417): a cerca tem no maximo 3 colunas de recuo, contadas a partir do
 * conteudo do item de lista em que esta (4 ou mais e bloco recuado, nao cerca); a cerca aberta
 * numa citacao fecha quando a citacao acaba; dentro da cerca, so os `>` da citacao dela saem da
 * linha (os outros sao corpo); e linha em branco e so espaco e tab (NBSP e conteudo).
 */
function temBlocoDeCodigo(texto) {
  if (typeof texto !== 'string') return false;
  let cerca = null;   // { marca, nivel, base }: a cerca aberta, o nivel de citacao e a coluna da lista dela
  let corpo = false;
  let lista = 0;      // coluna do conteudo do ultimo item de lista fora de cerca (0 = fora de lista)
  let nivelDaLista = 0;
  for (const bruta of texto.split(/\r?\n/)) {
    if (cerca !== null) {
      const d = tirarCitacao(bruta, cerca.nivel);
      if (d.nivel === cerca.nivel) {
        const f = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(d.resto);
        if (f && largura(recuoDe(d.resto)) - cerca.base <= 3 &&
            f[1][0] === cerca.marca[0] && f[1].length >= cerca.marca.length) {
          if (corpo) return true;
          cerca = null;
        } else if (/[^ \t]/.test(d.resto)) {
          corpo = true;
        }
        continue;
      }
      // a citacao acabou: a cerca fecha com ela, e a linha segue como texto de fora
      if (corpo) return true;
      cerca = null;
    }
    const c = tirarCitacao(bruta, Infinity);
    if (c.nivel !== nivelDaLista) { lista = 0; nivelDaLista = c.nivel; }
    if (!/[^ \t]/.test(c.resto)) continue;
    const recuo = largura(recuoDe(c.resto));
    if (lista && recuo < lista) lista = 0;
    let base = lista;
    let resto = c.resto;
    const item = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/.exec(resto);
    if (item && recuo - base <= 3) {
      lista = largura(item[0]);
      base = lista;
      resto = ' '.repeat(base) + resto.slice(item[0].length);
    }
    const a = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(resto);
    if (a && largura(recuoDe(resto)) - base <= 3 && !(a[1][0] === '`' && a[2].indexOf('`') !== -1)) {
      cerca = { marca: a[1], nivel: c.nivel, base: base };
      corpo = false;
    }
  }
  return cerca !== null && corpo;
}

function recuoDe(linha) { return /^[ \t]*/.exec(linha)[0]; }

/** Colunas que o texto ocupa, com o tab ate a proxima parada de 4 (CommonMark). */
function largura(texto) {
  let col = 0;
  for (const ch of texto) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
}

/**
 * Tira ate `max` marcas de citacao (`>` com ate 3 espacos antes e 1 opcional depois). O tab do
 * prefixo vira espacos pela coluna real antes (CommonMark): `>\t` deixa 3 colunas, e o espaco
 * opcional sai de uma delas.
 */
function tirarCitacao(linha, max) {
  let resto = expandirPrefixo(linha);
  let nivel = 0;
  while (nivel < max) {
    const m = /^ {0,3}> ?/.exec(resto);
    if (!m) break;
    resto = resto.slice(m[0].length);
    nivel++;
  }
  return { resto: resto, nivel: nivel };
}

/** Troca cada tab do prefixo de espaco, tab e `>` por espacos ate a proxima parada de 4. */
function expandirPrefixo(linha) {
  let saida = '';
  let col = 0;
  let i = 0;
  for (; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '\t') { saida += ' '.repeat(4 - (col % 4)); col += 4 - (col % 4); }
    else if (ch === ' ' || ch === '>') { saida += ch; col++; }
    else break;
  }
  return saida + linha.slice(i);
}

// D412/D415. R5: ASCII puro - chega ao Claude como motivo do bloqueio.
const MOTIVO_HANDOFF_SEM_PROMPT = [
  'esquadro - portao de fecho (prompt do handoff).',
  '',
  'Voce gravou um arquivo de handoff neste turno e a sua resposta final nao tem bloco de codigo.',
  'O prompt pronto tem de chegar ao chat, nao so ao arquivo: cole-o agora num bloco de codigo',
  '(tres crases ou tres tis), nesta resposta final - uma vez so. O portao le so a resposta final:',
  'se o bloco ficou numa mensagem anterior deste turno, ele nao a ve.',
  '',
  'Para desligar este portao no projeto: "portaoHandoff": false em .claude/esquadro/projeto.json.'
].join('\n');

module.exports = { LIMIARES_PADRAO, BALDES_DE_BLOQUEIO, avaliar, instrucaoAoModelo, perguntaSobreSaude,
  INSTRUCAO_DA_PERGUNTA, ehArquivoDeHandoff, temBlocoDeCodigo, MOTIVO_HANDOFF_SEM_PROMPT };
