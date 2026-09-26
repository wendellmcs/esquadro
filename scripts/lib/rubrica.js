'use strict';
const regraLib = require('./regra.js');

// Criterio 3: a descricao tem de dizer QUANDO usar.
const RE_QUANDO = /\b(use quando|use no|use ao|use antes|use depois|quando (voce|o agente|a tarefa))/i;
const RE_DESCRICAO = /^description:\s*(.+)$/im;
const RE_NAO_PROMETE = /^#{1,6}\s.*n[aã]o\s+(promete|garante|faz)\b/im;

function conferir(texto) {
  const t = String(texto == null ? '' : texto);
  const erros = [];

  const d = t.match(RE_DESCRICAO);
  if (!d) erros.push('criterio 3: frontmatter sem description');
  else if (!RE_QUANDO.test(d[1])) {
    erros.push('criterio 3: a description diz o que a skill faz, nao QUANDO usar. E a unica linha que decide se ela e invocada.');
  }

  if (!RE_NAO_PROMETE.test(t)) {
    erros.push('criterio 6: falta a secao do que a skill NAO promete. Dito agora, nao descoberto no fim.');
  }

  // Criterio 1: item de lista que parece regra tem de ter gatilho.
  const linhas = t.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!/^[-*+]\s+/.test(l)) continue;
    const corpo = l.replace(/^[-*+]\s+/, '');
    if (!/^(nunca|sempre|proibido|n[aã]o\s+fa[cç]a|jamais)\b/i.test(corpo)) continue;
    if (regraLib.SETA.test(corpo)) continue;
    erros.push('criterio 1, linha ' + (i + 1) + ': proibicao solta sem gatilho. Reescreva como "<gatilho> -> <acao>": ' + corpo.slice(0, 60));
  }

  return { ok: erros.length === 0, erros: erros };
}

module.exports = { RE_QUANDO, conferir };
