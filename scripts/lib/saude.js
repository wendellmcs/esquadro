'use strict';

// Gatilhos CONTAVEIS, do arquivo de regras do projeto. Basta UM; nao e preciso somar.
// O que nao da para contar (inflacao de contexto) nao vira gatilho fingido: fica de fora.
const LIMIARES_PADRAO = {
  turnosComTrabalho: 15,   // conversa longa com edicao a cada turno
  revisoesFechadas: 2,     // 2+ tarefas com revisao independente fechadas
  bloqueios: 6,            // soma dos disparos de portao: sinal de desgaste
  arquivosTocados: 25      // diff largo demais para caber na cabeca
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
  'criou_sem_buscar', 'catraca_afrouxada'
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

  if (!gatilhos.length) return { disparou: false, gatilhos: [], aviso: null };

  const aviso = [
    'esquadro - hora de abrir chat novo. Gatilho contavel disparou:',
    gatilhos.map(function (g) { return '  - ' + g; }).join('\n'),
    'Rode /esquadro:handoff, cole o prompt pronto num chat novo, e continue de la.',
    'Se surgiu a duvida "ja e hora?", ja era.'
  ].join('\n');

  return { disparou: true, gatilhos: gatilhos, aviso: aviso };
}

module.exports = { LIMIARES_PADRAO, BALDES_DE_BLOQUEIO, avaliar };
