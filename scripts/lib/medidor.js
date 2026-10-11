'use strict';

// Bloco M / M1 (D435): o texto do medidor da sessao. Puro: recebe o que o motor mediu
// ($.session.usage(), sem breakdown - nada abre rede, D148), as amostras por turno e os
// gatilhos de saude.medir; devolve a linha de status, a resposta do comando e se a troca
// de chat ja cruzou. Texto de gancho fica ASCII (R5). Campo que o motor nao deu e omitido:
// numero inventado e pior que numero nenhum.

const NOME_DA_JANELA = { five_hour: '5h', seven_day: 'semana', spend_limit: 'gasto' };
const MINIMO_DE_SUBIDAS = 2;   // previsao so com 2+ turnos que subiram
const JANELA_DA_MEDIA = 5;     // media das ultimas 5 subidas

function num(v) { return typeof v === 'number' && isFinite(v); }
function dois(n) { return String(n).padStart(2, '0'); }

function hora(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return dois(d.getHours()) + ':' + dois(d.getMinutes());
}

function dia(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1);
}

function janelas(uso) {
  const lista = uso && Array.isArray(uso.rateLimits) ? uso.rateLimits : [];
  return lista.filter(function (j) { return j && num(j.percentUsed); }).map(function (j) {
    const nome = NOME_DA_JANELA[j.kind] || String(j.kind);
    // a de 5h renova no mesmo dia (hora basta); as outras, pelo dia e hora
    const quando = j.resetsAt ? (j.kind === 'five_hour' ? hora(j.resetsAt) : [dia(j.resetsAt), hora(j.resetsAt)].filter(Boolean).join(' ')) : null;
    return { kind: j.kind, nome: nome, pct: j.percentUsed, quando: quando || null };
  });
}

/** Media das ultimas subidas positivas de `campo` entre amostras seguidas; null sem 2 subidas. */
function subidaMedia(amostras, campo) {
  const subidas = [];
  for (let i = 1; i < amostras.length; i++) {
    const a = amostras[i - 1] && amostras[i - 1][campo];
    const b = amostras[i] && amostras[i][campo];
    if (num(a) && num(b) && b > a) subidas.push(b - a);
  }
  if (subidas.length < MINIMO_DE_SUBIDAS) return null;
  const ultimas = subidas.slice(-JANELA_DA_MEDIA);
  return ultimas.reduce(function (t, v) { return t + v; }, 0) / ultimas.length;
}

// Turnos que faltam: nunca negativo (contexto ou janela ja passados do fim = ~0 turnos).
function turnosAte(falta, porTurno) { return Math.max(0, Math.floor(falta / porTurno)); }

function previsao(uso, amostras) {
  const lista = Array.isArray(amostras) ? amostras : [];
  const partes = [];
  const ctx = uso && uso.context;
  const porTurno = subidaMedia(lista, 'tokens');
  if (porTurno && ctx && num(ctx.tokens) && num(ctx.window)) {
    partes.push({ curta: null, longa: 'contexto chega ao fim em ~' + turnosAte(ctx.window - ctx.tokens, porTurno) + ' turnos' });
  }
  const pct5h = subidaMedia(lista, 'cincoH');
  const j5 = janelas(uso).find(function (j) { return j.kind === 'five_hour'; });
  if (pct5h && j5) {
    const n = turnosAte(100 - j5.pct, pct5h);
    partes.push({ curta: '5h acaba em ~' + n + ' turnos', longa: 'janela 5h acaba em ~' + n + ' turnos' });
  }
  return partes;
}

function linhaDaSessao(entrada) {
  const e = entrada || {};
  const uso = e.uso && typeof e.uso === 'object' ? e.uso : null;
  const medidas = Array.isArray(e.medidas) ? e.medidas : [];
  const cruzados = medidas.filter(function (g) { return g && g.cruzou; });
  const avisou = e.avisouSaude === true;
  const cruzou = avisou || cruzados.length > 0;
  const prev = previsao(uso, e.amostras);

  const curta = ['esquadro'];
  const ctx = uso && uso.context;
  if (ctx && num(ctx.percent)) curta.push('contexto ' + ctx.percent + '%');
  for (const j of janelas(uso)) curta.push(j.nome + ' ' + j.pct + '%' + (j.quando && j.kind === 'five_hour' ? ' (renova ' + j.quando + ')' : ''));
  if (uso && uso.cost && num(uso.cost.usd)) curta.push('US$ ' + uso.cost.usd.toFixed(2));
  for (const p of prev) if (p.curta) curta.push(p.curta);
  if (avisou) curta.push('troca: aviso ja dado -> /esquadro:handoff');
  else if (cruzados.length) curta.push('troca: ' + cruzados.length + ' de ' + medidas.length + ' cruzou -> /esquadro:handoff');
  else curta.push('troca: 0 de ' + medidas.length + ' gatilhos');

  const longa = ['medidor da sessao'];
  if (ctx && num(ctx.percent)) {
    longa.push('contexto: ' + ctx.percent + '%' + (num(ctx.tokens) && num(ctx.window) ? ' (' + ctx.tokens + ' de ' + ctx.window + ' tokens)' : ''));
  } else {
    longa.push('contexto: sem leitura ainda (o motor mede depois da 1a resposta)');
  }
  const js = janelas(uso);
  if (js.length) {
    for (const j of js) longa.push('janela ' + j.nome + ': ' + j.pct + '% usada' + (j.quando ? ', renova ' + j.quando : ''));
  } else {
    longa.push('janelas de limite: sem leitura (fora de assinatura, ou antes da 1a resposta)');
  }
  if (uso && uso.cost && num(uso.cost.usd)) longa.push('custo da sessao: US$ ' + uso.cost.usd.toFixed(2));
  longa.push(prev.length
    ? 'previsao: ' + prev.map(function (p) { return p.longa; }).join('; ')
    : 'previsao: sem dado ainda (precisa de ' + MINIMO_DE_SUBIDAS + ' turnos com consumo)');
  longa.push('troca de chat (basta 1 gatilho):');
  for (const g of medidas) {
    if (!g) continue;
    longa.push('  - ' + g.nome + ': ' + g.valor + ' de ' + g.limiar + (g.cruzou ? '  <- cruzou' : ''));
  }
  if (avisou) longa.push('  (o aviso de troca ja foi dado nesta sessao; os contadores recomecam depois dele)');
  longa.push(cruzou
    ? 'o que fazer: rode /esquadro:handoff e cole o prompt pronto num chat novo.'
    : 'o que fazer: nada por ora.');

  return { curta: curta.join(' | '), longa: longa.join('\n'), cruzou: cruzou };
}

module.exports = { linhaDaSessao };
