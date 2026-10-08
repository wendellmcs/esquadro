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
 * realmente incrementam. Lista escrita a mao envelhece calada.
 */
const BALDES_DE_BLOQUEIO = [
  'fora_do_escopo', 'sem_escopo', 'comando_destrutivo', 'shell_idioma_errado',
  'fecho_sem_evidencia', 'subitem_pendente', 'outra_frente', 'intocavel',
  'token_fora_do_sistema', 'agente_caro_em_marcha_rapida',
  'criou_sem_buscar', 'catraca_afrouxada', 'cd_solto',
  // F6-04: nome de frente invalido e "Fora" declarado tinham o balde fora_do_escopo; agora cada um tem o seu.
  'frente_invalida', 'fora_declarado'
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
  if ((e.arquivosTocados ? e.arquivosTocados.length : 0) >= L.arquivosTocados) {
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
 */
function instrucaoAoModelo(gatilhos) {
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

module.exports = { LIMIARES_PADRAO, BALDES_DE_BLOQUEIO, avaliar, instrucaoAoModelo, perguntaSobreSaude,
  INSTRUCAO_DA_PERGUNTA };
