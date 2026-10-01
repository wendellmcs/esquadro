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

// Limite de CARGA do MEMORY.md, da documentacao oficial do Claude Code (memory.md): so as
// primeiras 200 linhas ou 25 KB entram na sessao, o que vier primeiro. NAO e o teto de
// instrucao do limites.json (esse e medido por nos, e nao soma o MEMORY.md): e o da doc.
// "25 KB": a doc nao diz se sao 25.000 ou 25.600 bytes. Usamos 25.000, o menor, que avisa antes.
const CARGA_LINHAS = 200;
const CARGA_BYTES = 25000;
const CARGA_FONTE = 'documentacao oficial do Claude Code, memory.md: carrega as primeiras 200 linhas ou 25 KB do MEMORY.md, o que vier primeiro';
const CARGA_NOTA = '"25 KB" lido como 25.000 bytes; a doc nao diz se sao 25.000 ou 25.600 (o menor avisa antes)';
const METODO_MEMORIA = 'linha = trecho terminado em \\n (o \\n final nao abre linha nova; \\r do fim nao conta no tamanho da linha); bytes em UTF-8, do arquivo inteiro; fora da carga = linhas depois da 200a e bytes depois dos 25.000';

function naoMedida(causa, motivo, caminho) {
  const m = { medida: false, causa: causa, motivo: motivo };
  if (caminho) m.caminho = caminho;
  return m;
}

// Mede o MEMORY.md contra o limite de carga. Nunca some calada: sem caminho ou sem leitura
// devolve "nao medida" com a causa. O caminho vem de quem chama (a skill), nunca adivinhado.
function medirMemoria(caminho) {
  if (!caminho) {
    return naoMedida('sem-caminho', 'nao medida: nenhum caminho do MEMORY.md foi passado (argumento --memoria <caminho>)');
  }
  let buf;
  try {
    buf = fs.readFileSync(caminho);
  } catch (e) {
    const codigo = (e && e.code) || 'ERRO';
    return naoMedida(codigo, 'nao medida: nao consegui ler ' + caminho + ' (' + codigo + '); confira o caminho passado em --memoria', caminho);
  }

  const bytes = buf.length;
  // inicios[i] = posicao do primeiro byte da linha i+1. O \n final nao abre linha nova.
  const inicios = bytes > 0 ? [0] : [];
  for (let i = 0; i < bytes - 1; i++) {
    if (buf[i] === 10) inicios.push(i + 1);
  }
  const linhas = inicios.length;

  let maior = { numero: 0, bytes: 0 };
  for (let i = 0; i < linhas; i++) {
    let fim = i + 1 < linhas ? inicios[i + 1] : bytes;
    if (fim > inicios[i] && buf[fim - 1] === 10) fim--;
    if (fim > inicios[i] && buf[fim - 1] === 13) fim--;
    const tam = fim - inicios[i];
    if (tam > maior.bytes) maior = { numero: i + 1, bytes: tam };
  }

  const estouraLinhas = linhas > CARGA_LINHAS;
  const estouraBytes = bytes > CARGA_BYTES;
  let primeiro = null;
  if (estouraLinhas && estouraBytes) primeiro = inicios[CARGA_LINHAS] < CARGA_BYTES ? 'linhas' : 'bytes';
  else if (estouraLinhas) primeiro = 'linhas';
  else if (estouraBytes) primeiro = 'bytes';

  return {
    medida: true,
    caminho: caminho,
    linhas: linhas,
    bytes: bytes,
    maiorLinha: maior,
    limite: { linhas: CARGA_LINHAS, bytes: CARGA_BYTES, fonte: CARGA_FONTE, nota: CARGA_NOTA },
    cabe: !estouraLinhas && !estouraBytes,
    primeiro: primeiro,
    foraDaCarga: { linhas: Math.max(0, linhas - CARGA_LINHAS), bytes: Math.max(0, bytes - CARGA_BYTES) },
    metodo: METODO_MEMORIA
  };
}

// `opcoes.memoria`: caminho do MEMORY.md, passado pela skill. A medida sai a parte, na chave
// `memoria`; o teto de instrucao (`peso`) nao a soma (D288).
function auditar(cwd, projeto, opcoes) {
  const skills = lerSkills(cwd);
  const caminhoMemoria = opcoes && opcoes.memoria ? path.resolve(cwd, String(opcoes.memoria)) : null;
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
    delegaveis: ambiente.detectar(cwd).delegaveis,
    memoria: medirMemoria(caminhoMemoria)
  };
}

module.exports = {
  VAZIAS, CARGA_LINHAS, CARGA_BYTES, normalizar, termos, sobreposicoes, contradicoes, medirMemoria, auditar
};
