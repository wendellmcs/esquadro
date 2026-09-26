'use strict';

// Nove LENTES, nao nove copias do mesmo revisor.
// Nove copias acham o mesmo problema nove vezes; nove lentes acham nove classes de problema.
const LENTES = [
  { chave: 'correcao', titulo: 'Correcao e regressao',
    pergunta: 'Qual dos dois quebra? Entrada concreta que produz resultado errado, com arquivo:linha.' },
  { chave: 'escopo', titulo: 'Fidelidade ao pedido',
    pergunta: 'O que mudou alem do necessario? Renomeacao, extracao, formatacao junto de correcao funcional.' },
  { chave: 'estados', titulo: 'Estados obrigatorios',
    pergunta: 'Erro, vazio, carregando, limite e timeout estao tratados, ou so o caso feliz?' },
  { chave: 'borda', titulo: 'Entrada e borda',
    pergunta: 'null, string vazia, lista vazia, numero negativo, unicode, caminho com espaco, arquivo enorme.' },
  { chave: 'seguranca', titulo: 'Seguranca e dado sensivel',
    pergunta: 'Segredo em texto, log com dado do usuario, entrada nao validada que vira comando ou caminho.' },
  { chave: 'manutencao', titulo: 'Legibilidade e manutencao',
    pergunta: 'O que um leitor novo entende errado? Nome que mente, funcao que faz duas coisas, erro engolido.' },
  { chave: 'microcopy', titulo: 'Texto que o usuario le',
    pergunta: 'Mensagem que nao diz o que fazer a seguir, jargao, ingles solto, tom que culpa o usuario.' },
  { chave: 'medidor', titulo: 'Mexeram no medidor',
    pergunta: 'Teste, baseline, threshold, skip ou mock mudaram junto com o codigo que eles cobrem?' },
  { chave: 'design', titulo: 'Fidelidade ao design system',
    pergunta: 'Cite o token literal ou a tela irmã de referência. Valor cru, gradiente, sombra larga, card aninhado ou tipografia fluida onde o sistema nao os tem. Sem citar token ou coordenada, o veredito nao conta.' }
];

// D121 mediu: 3 exatas, 1 parcial, 4 contra 4 sem contraparte. A causa nao e
// descuido - a familia de cima e de CODIGO, esta e de TELA. Decisao 8 (2026-09-23):
// convivem declaradas, nao se fundem. Chaves com sufixo para nunca colidir.
const LENTES_UI = [
  { chave: 'ui-design', titulo: 'Fidelidade ao design system', pergunta: 'Cite o token literal ou a tela irma de referencia. Valor cru, gradiente, sombra larga, card aninhado ou tipografia fluida onde o sistema nao os tem.' },
  { chave: 'ui-estados', titulo: 'Estados obrigatorios', pergunta: 'Carregando, vazio, erro e limite estao desenhados, ou so o caso cheio?' },
  { chave: 'ui-responsivo', titulo: 'Responsividade e overflow', pergunta: 'Em qual largura o conteudo vaza, corta ou empilha errado? Diga a largura e o elemento.' },
  { chave: 'ui-a11y', titulo: 'Acessibilidade', pergunta: 'Contraste, alvo de toque, foco visivel, ordem de tabulacao, rotulo de campo e de botao de icone.' },
  { chave: 'ui-microcopy', titulo: 'Microcopy', pergunta: 'Texto que nao diz o que fazer a seguir, jargao, ingles solto, tom que culpa quem le.' },
  { chave: 'ui-antiref', titulo: 'Anti-referencias visuais', pergunta: 'O que parece template generico em vez do produto? Cite o elemento e a tela irma que faz melhor.' },
  { chave: 'ui-correcao', titulo: 'Correcao visual e regressao', pergunta: 'O que funcionava e parou de aparecer, ou aparece em lugar errado? Cite viewport e coordenada.' },
  { chave: 'ui-governanca', titulo: 'Governanca e permissao', pergunta: 'Superficie restrita renderizada sem a permissao que a habilita, ou dado sensivel visivel no print.' }
];

const FAMILIAS = { codigo: LENTES, ui: LENTES_UI };

/**
 * A regra de despacho da spec (decisao 8), a mesma da tabela do /esquadro:revisar: so codigo,
 * as 9; so tela, as 8; os dois, as 17. Nada declarado e duvida, e na duvida vao as duas
 * familias - nunca nenhuma, que seria uma revisao sem voto.
 */
function familiasPara(tocaCodigo, tocaTela) {
  if (tocaCodigo && !tocaTela) return ['codigo'];
  if (tocaTela && !tocaCodigo) return ['ui'];
  return ['codigo', 'ui'];
}

const SEVERIDADES = ['P0', 'P1', 'P2'];

// Ronda 1 do 8c.5: a lente entra na chave. Dois defeitos de lentes diferentes na mesma
// linha sao dois achados; a mesma lente repetindo o mesmo lugar segue sendo um. A
// severidade continua primeiro: o motivo do teto conta os abertos pelo prefixo P0| e P1|.
function chaveAchado(a, lente) {
  return [a.severidade, a.arquivo, a.linha, lente].join('|');
}

// D223 e D228 (ronda 2 do 8c.10): o que invalida o veredito inteiro, e nao so um achado. O
// apurar-ronda.js para nestes, como no ilegivel, e o apurar os recusa; o validarVeredito os
// devolve junto dos erros de achado, que so descartam o achado.
function errosDoVeredito(vd) {
  if (!vd || typeof vd !== 'object') return ['veredito nao e objeto'];
  const erros = [];
  if (!vd.lente) erros.push('veredito sem lente');
  if (['A', 'B', 'empate'].indexOf(vd.melhor) === -1) erros.push('melhor tem de ser A, B ou empate');
  if (!Array.isArray(vd.achados)) erros.push('achados tem de ser lista, vazia quando nao ha achado');
  return erros;
}

function validarVeredito(vd) {
  const erros = errosDoVeredito(vd);
  const validos = [];
  if (!vd || typeof vd !== 'object') return { ok: false, erros: erros, achadosValidos: [] };

  for (const a of (vd.achados || [])) {
    if (SEVERIDADES.indexOf(a && a.severidade) === -1) {
      erros.push('achado com severidade invalida: ' + (a && a.severidade));
      continue;
    }
    // Anti-teatro: sem arquivo:linha, o voto nao conta.
    if (!a.arquivo || !Number.isInteger(a.linha)) {
      erros.push('achado sem arquivo:linha, descartado: ' + String(a.descricao).slice(0, 60));
      continue;
    }
    if (!a.descricao || String(a.descricao).trim() === '') {
      erros.push('achado sem descricao, descartado');
      continue;
    }
    validos.push(a);
  }
  return { ok: erros.length === 0, erros: erros, achadosValidos: validos };
}

const TETO = 3;

/**
 * rondas: lista de rondas; cada ronda e uma lista de vereditos.
 * Ronda seca = zero achado NOVO de P1 ou acima.
 */
function apurar(rondas) {
  const vistos = new Set();
  let secas = 0;
  let novosDaUltima = [];
  const placar = { A: 0, B: 0, empate: 0 };

  rondas.forEach(function (ronda, indice) {
    const novos = [];
    for (const vd of ronda) {
      // D230: o que nao e veredito nao e voto sem achado - seria ronda seca por falta de voto. O
      // apurar-ronda.js para antes de chegar aqui; quem chamar direto recebe o erro, com o motivo.
      const invalido = errosDoVeredito(vd);
      if (invalido.length) throw new Error('veredito que nao e veredito na ronda ' + (indice + 1) + ': ' + invalido.join('; '));
      const r = validarVeredito(vd);
      if (indice === rondas.length - 1 && vd && placar[vd.melhor] !== undefined) placar[vd.melhor] += 1;
      for (const a of r.achadosValidos) {
        const k = chaveAchado(a, vd.lente);
        if (vistos.has(k)) continue;
        vistos.add(k);
        if (a.severidade === 'P0' || a.severidade === 'P1') novos.push(a);
      }
    }
    if (novos.length === 0) secas += 1; else secas = 0;
    if (indice === rondas.length - 1) novosDaUltima = novos;
  });

  const ronda = rondas.length;
  const abertos = Array.from(vistos).filter(function (k) { return k.indexOf('P0|') === 0 || k.indexOf('P1|') === 0; });

  if (secas >= 2) {
    return { ronda: ronda, secas: secas, encerrar: true,
      motivo: 'duas rondas secas seguidas: aprovado', novos: novosDaUltima, placar: placar };
  }
  if (ronda >= TETO) {
    return { ronda: ronda, secas: secas, encerrar: true,
      motivo: 'teto de ' + TETO + ' rondas com ' + abertos.length + ' achado(s) P0/P1: para aqui e leva ao dono com 3 opcoes; o que sobrar vira registro',
      novos: novosDaUltima, placar: placar };
  }
  return { ronda: ronda, secas: secas, encerrar: false,
    motivo: 'ronda ' + (ronda + 1) + ' chama so as lentes que acharam P0/P1',
    novos: novosDaUltima, placar: placar };
}

module.exports = { LENTES, LENTES_UI, FAMILIAS, familiasPara, SEVERIDADES, TETO, chaveAchado, errosDoVeredito,
  validarVeredito, apurar };
