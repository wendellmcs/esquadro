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
// D442/11 (M-22): o motor manda percentual com casas (37.29999); a tela mostra inteiro.
function pct(n) { return Math.round(n) + '%'; }
// D442/11 (M-15, M-18, M-19): gatilho sem nome, valor ou limiar nao entra na conta nem na lista.
function gatilhoInteiro(g) { return !!g && typeof g.nome === 'string' && g.nome !== '' && num(g.valor) && num(g.limiar); }

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
  // D442/11 (M-16, M-21): janela sem `kind` virava o nome "undefined"; sem nome, fica de fora.
  return lista.filter(function (j) { return j && num(j.percentUsed) && typeof j.kind === 'string' && j.kind !== ''; }).map(function (j) {
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
// D442/11 (M-20): subida minuscula (ruido de float) dava "~Infinity turnos"; sem conta finita, null (omite).
function turnosAte(falta, porTurno) {
  const n = Math.max(0, Math.floor(falta / porTurno));
  return isFinite(n) ? n : null;
}

function previsao(uso, amostras) {
  const lista = Array.isArray(amostras) ? amostras : [];
  const partes = [];
  const ctx = uso && uso.context;
  const porTurno = subidaMedia(lista, 'tokens');
  const nCtx = porTurno && ctx && num(ctx.tokens) && num(ctx.window) ? turnosAte(ctx.window - ctx.tokens, porTurno) : null;
  if (nCtx !== null) {
    partes.push({ curta: null, longa: 'contexto chega ao fim em ~' + nCtx + ' turnos' });
  }
  const pct5h = subidaMedia(lista, 'cincoH');
  const j5 = janelas(uso).find(function (j) { return j.kind === 'five_hour'; });
  const n = pct5h && j5 ? turnosAte(100 - j5.pct, pct5h) : null;
  if (n !== null) {
    partes.push({ curta: '5h acaba em ~' + n + ' turnos', longa: 'janela 5h acaba em ~' + n + ' turnos' });
  }
  return partes;
}

const SESSOES_DA_MEDIA = 5;    // pedido 31: media das ultimas 5 sessoes
const MINIMO_DE_SESSOES = 2;

/**
 * Pedido 31: quanto cada sessao anterior gastou de cada janela (historico que o mod guarda no $.store, ver
 * gasto.guardarSessao). Entra a sessao que nao e a atual, teve 2+ medidas e nao cruzou a renovacao; as 5 mais
 * recentes. Devolve { kind: { media, k } } so com 2+ sessoes.
 */
function mediaPorSessao(historico, atual) {
  const h = historico && typeof historico === 'object' ? historico : {};
  const r = {};
  for (const kind of ['five_hour', 'seven_day']) {
    const deltas = Object.keys(h).filter(function (id) { return id !== atual; }).map(function (id) {
      const s = h[id];
      const j = s && s.janelas && typeof s.janelas === 'object' ? s.janelas[kind] : null;
      if (!j || !num(s.t) || !(s.medidas >= 2) || !num(j.ini) || !num(j.fim) || j.fim < j.ini) return null;
      if (j.resetIni !== j.resetFim) return null;
      return { t: s.t, d: j.fim - j.ini };
    }).filter(Boolean).sort(function (a, b) { return b.t - a.t; }).slice(0, SESSOES_DA_MEDIA);
    if (deltas.length < MINIMO_DE_SESSOES) continue;
    // media zero passa: turnosAte da null (nao divide por zero) e a previsao se omite
    r[kind] = { media: deltas.reduce(function (t, x) { return t + x.d; }, 0) / deltas.length, k: deltas.length };
  }
  return r;
}

/** Pedido 31 (D520): o gasto do mes vem pronto do sessao.js (gasto.gastoDoMes); torto = sem gasto. */
function gastoValido(g) {
  return g && typeof g === 'object' && num(g.usd) && num(g.real) && num(g.estimado) ? g : null;
}

function linhaDaSessao(entrada) {
  const e = entrada || {};
  const uso = e.uso && typeof e.uso === 'object' ? e.uso : null;
  const medidas = (Array.isArray(e.medidas) ? e.medidas : []).filter(gatilhoInteiro);
  const cruzados = medidas.filter(function (g) { return g.cruzou; });
  const avisou = e.avisouSaude === true;
  const cruzou = avisou || cruzados.length > 0;
  const prev = previsao(uso, e.amostras);
  const porSessao = mediaPorSessao(e.historico, e.sessao);
  const handoffs = function (j) {
    const m = porSessao[j.kind];
    return m ? turnosAte(100 - j.pct, m.media) : null;
  };
  const gasto = gastoValido(e.gasto);

  // Pedido 32: a barra na ordem esquadro | plano | contexto | 5h | semana | mes | sessao | troca.
  const curta = ['esquadro'];
  if (typeof e.planoCurto === 'string' && e.planoCurto) curta.push(e.planoCurto);
  const ctx = uso && uso.context;
  if (ctx && num(ctx.percent)) curta.push('contexto ' + pct(ctx.percent));
  for (const j of janelas(uso)) {
    const extra = [j.quando && j.kind === 'five_hour' ? 'renova ' + j.quando : null,
      handoffs(j) !== null ? '~' + handoffs(j) + ' handoffs' : null].filter(Boolean);
    curta.push(j.nome + ' ' + pct(j.pct) + (extra.length ? ' (' + extra.join(', ') + ')' : ''));
  }
  // Pedido 31: o mes ao lado do semanal, a sessao depois; "+" e "(contando)" enquanto a leitura das transcricoes segue.
  if (gasto) curta.push('mes US$ ' + Math.round(gasto.usd) + (gasto.pendentes > 0 ? '+ (contando)' : ''));
  if (uso && uso.cost && num(uso.cost.usd)) curta.push('sessao US$ ' + uso.cost.usd.toFixed(2));
  for (const p of prev) if (p.curta) curta.push(p.curta);
  // D468/D490 (M2): o gatilho calado pelo modo continuo nao pode disparar, entao nao entra no "de N".
  const podem = medidas.filter(function (g) { return g.calado !== true; }).length;
  if (avisou) curta.push('troca: aviso ja dado -> /esquadro:handoff');
  else if (cruzados.length) curta.push('troca: ' + cruzados.length + ' de ' + podem + ' cruzou -> /esquadro:handoff');
  else curta.push('troca: 0 de ' + podem + ' gatilhos');

  const longa = ['medidor da sessao'];
  if (ctx && num(ctx.percent)) {
    longa.push('contexto: ' + pct(ctx.percent) + (num(ctx.tokens) && num(ctx.window) ? ' (' + ctx.tokens + ' de ' + ctx.window + ' tokens)' : ''));
  } else {
    longa.push('contexto: sem leitura ainda (o motor mede depois da 1a resposta)');
  }
  const js = janelas(uso);
  if (js.length) {
    for (const j of js) longa.push('janela ' + j.nome + ': ' + pct(j.pct) + ' usada' + (j.quando ? ', renova ' + j.quando : ''));
  } else {
    longa.push('janelas de limite: sem leitura (fora de assinatura, ou antes da 1a resposta)');
  }
  if (uso && uso.cost && num(uso.cost.usd)) longa.push('custo da sessao: US$ ' + uso.cost.usd.toFixed(2));
  if (gasto) {
    longa.push('gasto do mes (desde ' + gasto.desde + '): US$ ' + gasto.usd.toFixed(2) + ' = US$ ' + gasto.real.toFixed(2) +
      ' real das sessoes medidas + US$ ' + gasto.estimado.toFixed(2) + ' estimado das transcricoes' +
      (gasto.pendentes > 0 ? ' (contando: faltam ' + gasto.pendentes + ' arquivos de transcricao; o total completa sozinho nas proximas medidas)' : '') +
      '; em assinatura e valor equivalente de API, nao cobranca');
  }
  // A previsao da longa: a dos turnos (previsao) e a das sessoes anteriores (handoffs), numa lista so dela.
  const previsoes = prev.map(function (p) { return p.longa; });
  for (const j of js) {
    const n = handoffs(j);
    if (n === null) continue;
    const m = porSessao[j.kind];
    // media abaixo de 1% com uma casa: "0%" diria que a sessao nao gasta nada
    previsoes.push('janela ' + j.nome + ' acaba em ~' + n + ' handoffs (media de ' +
      (m.media >= 1 ? pct(m.media) : m.media.toFixed(1) + '%') +
      ' por sessao, nas ultimas ' + m.k + ' sessoes)');
  }
  longa.push(previsoes.length
    ? 'previsao: ' + previsoes.join('; ')
    : 'previsao: sem dado ainda (precisa de ' + MINIMO_DE_SUBIDAS + ' turnos com consumo)');
  longa.push('troca de chat (basta 1 gatilho):');
  for (const g of medidas) {
    // D468: o gatilho calado pelo modo continuo aparece, mas sem "cruzou".
    longa.push('  - ' + g.nome + ': ' + g.valor + ' de ' + g.limiar +
      (g.calado === true ? '  (modo continuo: nao dispara)' : g.cruzou ? '  <- cruzou' : ''));
  }
  if (avisou) longa.push('  (o aviso de troca ja foi dado nesta sessao; os contadores recomecam depois dele)');
  // D442/2: o painel do VS Code le a longa como Markdown; sem a linha em branco, o "o que fazer" emendava
  // no ultimo item da lista.
  longa.push('');
  longa.push(cruzou
    ? 'o que fazer: rode /esquadro:handoff e cole o prompt pronto num chat novo.'
    : 'o que fazer: nada por ora.');

  return { curta: curta.join(' | '), longa: longa.join('\n'), cruzou: cruzou };
}

module.exports = { linhaDaSessao };
