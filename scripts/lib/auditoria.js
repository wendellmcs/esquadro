'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ambiente = require('./ambiente.js');
const instrucoes = require('./instrucoes.js');
const regraLib = require('./regra.js');
const rubrica = require('./rubrica.js');

const VAZIAS = new Set([
  'use', 'quando', 'para', 'com', 'sem', 'que', 'uma', 'um', 'o', 'a', 'os', 'as', 'de', 'do', 'da',
  'em', 'no', 'na', 'ao', 'e', 'ou', 'se', 'por', 'the', 'when', 'for', 'and', 'usuario', 'projeto',
  'coisa', 'precisar', 'pedir', 'fazer', 'ver', 'outra', 'no', 'antes', 'depois'
]);

function normalizar(t) {
  return String(t == null ? '' : t).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

function termos(descricao) {
  return new Set(normalizar(descricao).filter(function (p) { return p.length > 3 && !VAZIAS.has(p); }));
}

function sobreposicoes(skills) {
  const achados = [];
  const lista = (skills || []).map(function (s) { return { nome: s.nome, t: termos(s.descricao) }; });
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const comuns = Array.from(lista[i].t).filter(function (x) { return lista[j].t.has(x); });
      if (comuns.length >= 1) achados.push({ a: lista[i].nome, b: lista[j].nome, termos: comuns });
    }
  }
  return achados;
}

function contradicoes(regras) {
  const porGatilho = new Map();
  for (const r of (regras || [])) {
    const chave = normalizar(r.gatilho).join(' ');
    if (!chave) continue;
    if (!porGatilho.has(chave)) porGatilho.set(chave, new Set());
    porGatilho.get(chave).add(String(r.acao).trim());
  }
  const achados = [];
  for (const [gatilho, acoes] of porGatilho) {
    if (acoes.size > 1) achados.push({ gatilho: gatilho, acoes: Array.from(acoes) });
  }
  return achados;
}

function lerSkills(cwd) {
  const nomes = ambiente.detectar(cwd).skills;
  return nomes.map(function (nome) {
    let descricao = '';
    let texto = '';
    try {
      texto = fs.readFileSync(path.join(cwd, '.claude', 'skills', nome, 'SKILL.md'), 'utf8');
      const m = texto.match(/^description:\s*(.+)$/im);
      if (m) descricao = m[1];
    } catch (e) { /* skill sem SKILL.md legivel */ }
    return { nome: nome, descricao: descricao, texto: texto };
  });
}

function auditar(cwd, projeto) {
  const skills = lerSkills(cwd);
  let regras = [];
  try { regras = regraLib.parseRegras(fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'regras.md'), 'utf8')); }
  catch (e) { regras = []; }

  const foraDaRubrica = [];
  for (const s of skills) {
    if (!s.texto) continue;
    const r = rubrica.conferir(s.texto);
    if (!r.ok) foraDaRubrica.push({ skill: s.nome, erros: r.erros });
  }

  return {
    peso: instrucoes.contar(cwd, projeto || {}),
    skills: skills.map(function (s) { return s.nome; }),
    sobreposicoes: sobreposicoes(skills),
    contradicoes: contradicoes(regras),
    foraDaRubrica: foraDaRubrica,
    delegaveis: ambiente.detectar(cwd).delegaveis
  };
}

module.exports = { VAZIAS, normalizar, termos, sobreposicoes, contradicoes, auditar };
