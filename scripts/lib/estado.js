'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const texto = require('./texto.js');

function raiz() {
  return path.join(process.env.ESQUADRO_TMP || os.tmpdir(), 'esquadro');
}

/** session_id vira nome de arquivo seguro: nada de '..' nem de barra. */
function caminhoSessao(sessionId) {
  const id = String(sessionId || 'sem-sessao').replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(raiz(), id + '.json');
}

function ler(sessionId) {
  try {
    const bruto = fs.readFileSync(caminhoSessao(sessionId), 'utf8');
    const obj = JSON.parse(texto.semBom(bruto));
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    return {};
  }
}

function gravar(sessionId, estado) {
  fs.mkdirSync(raiz(), { recursive: true });
  fs.writeFileSync(caminhoSessao(sessionId), JSON.stringify(estado || {}), 'utf8');
}

function alterar(sessionId, fn) {
  const atual = ler(sessionId);
  const novo = fn(atual) || atual;
  gravar(sessionId, novo);
  return novo;
}

function limpar(sessionId) {
  try { fs.rmSync(caminhoSessao(sessionId), { force: true }); } catch (e) { /* ja nao existe */ }
}

/**
 * O estado tem dois tempos de vida, e todo campo que um script grava nele esta numa
 * destas duas listas - um teste le os scripts e reprova o campo que nao estiver. O
 * fecho do turno regrava o estado so com o que e da SESSAO, e campo fora da lista
 * morria calado a cada turno (rondas 1 e 2 do Passo 8b).
 *
 * CAMPOS_DA_SESSAO: o fecho os carrega como estao - os avisos de "uma vez por sessao"
 * e os registros. Os que o proprio fecho recalcula (turnosComTrabalho, gitAbertura,
 * arquivosTocados, contadoresSessao, avisouSaude) nao entram: sao dele.
 * CAMPOS_DO_TURNO: morrem no fecho, de proposito.
 */
const CAMPOS_DA_SESSAO = ['avisouSemConfig', 'avisouTipoErrado', 'avisouApelido', 'gatilho3', 'abertoEm'];
const CAMPOS_DO_TURNO = ['trabalhoReal', 'bloqueouNesteTurno', 'buscouNesteTurno', 'contadores',
  'ultimaFerramenta'];

/** Os campos da sessao que este estado tem, para o fecho carregar adiante. */
function camposDaSessao(s) {
  const dados = {};
  for (const chave of CAMPOS_DA_SESSAO) if (s && s[chave] !== undefined) dados[chave] = s[chave];
  return dados;
}

/** D14: cada trava conta quantas vezes disparou. Contagem do turno vive na sessao. */
function incrementar(sessionId, chave) {
  const novo = alterar(sessionId, function (s) {
    s.contadores = s.contadores || {};
    s.contadores[chave] = (s.contadores[chave] || 0) + 1;
    return s;
  });
  return novo.contadores[chave];
}

/**
 * Descarrega os contadores do turno no arquivo duravel do projeto.
 * So grava se .claude/esquadro/ ja existir: projeto sem esquadro nao e poluido.
 * Escrita atomica (D30): escreve em .tmp e renomeia. Preserva arquivo corrompido.
 */
function descarregar(cwd, contadores) {
  if (!cwd || !contadores) return false;
  const pasta = path.join(cwd, '.claude', 'esquadro');
  if (!fs.existsSync(pasta)) return false;
  const arquivo = path.join(pasta, 'contadores.json');
  let dados = {};
  try {
    const parsed = JSON.parse(texto.semBom(fs.readFileSync(arquivo, 'utf8')));
    // JSON valido mas nao-objeto (numero, string, booleano, array, null) nao serve de
    // acumulador de contadores: cai no mesmo caminho de recuperacao do JSON invalido.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('contadores.json nao e um objeto');
    }
    dados = parsed;
  } catch (e) {
    // Preservar arquivo corrompido com sufixo .corrompido antes de recomeçar
    try { fs.renameSync(arquivo, arquivo + '.corrompido'); } catch (renameError) { /* nao conseguiu preservar, segue mesmo assim */ }
    dados = {};
  }
  for (const chave of Object.keys(contadores)) {
    dados[chave] = (dados[chave] || 0) + contadores[chave];
  }
  // Escrita atomica: escrever em temporario e renomear por cima do definitivo
  const temp = arquivo + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(dados, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, arquivo);
  return true;
}

module.exports = { caminhoSessao, ler, gravar, alterar, limpar, CAMPOS_DA_SESSAO, CAMPOS_DO_TURNO,
  camposDaSessao, incrementar, descarregar };
