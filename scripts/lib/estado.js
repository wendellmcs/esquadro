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
  // D244/defeito 11: no Windows, ler no instante do rename de outro processo da EPERM/EBUSY, e
  // o caminho de reserva do gravar (escrita direta) deixa o arquivo vazio por um instante - medido:
  // 1 leitura de 0 bytes a cada ~8000 contra um escritor. Nada disso e "sem estado": tenta de
  // novo. So a AUSENCIA do arquivo (ENOENT) e resposta imediata; JSON que segue quebrado depois
  // das tentativas vira {} como antes.
  for (let i = 0; ; i++) {
    try {
      const bruto = fs.readFileSync(caminhoSessao(sessionId), 'utf8');
      const obj = JSON.parse(texto.semBom(bruto));
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      if ((e && e.code === 'ENOENT') || i >= 40) return {};
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
}

function dormir(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * D244/defeito 11: gravacao ATOMICA. Escrever direto no arquivo deixava um leitor paralelo ver
 * JSON pela metade - e `ler` devolve {} no JSON invalido, zerando o estado da sessao inteiro.
 * Escreve num temporario e renomeia; no Windows o rename pode dar EPERM/EBUSY enquanto outro
 * processo le, entao tenta de novo algumas vezes antes de cair na escrita direta de antes.
 */
function gravar(sessionId, estado) {
  fs.mkdirSync(raiz(), { recursive: true });
  const destino = caminhoSessao(sessionId);
  const dados = JSON.stringify(estado || {});
  const temp = destino + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  fs.writeFileSync(temp, dados, 'utf8');
  for (let i = 0; i < 100; i++) {
    try { fs.renameSync(temp, destino); return; } catch (e) {
      if (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES') break;
      dormir(5);
    }
  }
  try { fs.rmSync(temp, { force: true }); } catch (e) { /* ja foi */ }
  fs.writeFileSync(destino, dados, 'utf8');
}

// D244/defeito 11: trava por sessao para o ler-mudar-gravar. Hooks de um disparo paralelo
// (varios Agent no mesmo turno) rodam ao mesmo tempo, e sem trava um gravava por cima do outro.
const PRAZO_TRAVA_MS = 2000;
const TRAVA_VELHA_MS = 10000;

function caminhoTrava(sessionId) {
  return caminhoSessao(sessionId) + '.trava';
}

/** true = travou. false = nao conseguiu no prazo: quem chama grava mesmo assim. */
function travar(sessionId) {
  fs.mkdirSync(raiz(), { recursive: true });
  const trava = caminhoTrava(sessionId);
  const limite = Date.now() + PRAZO_TRAVA_MS;
  for (;;) {
    try { fs.closeSync(fs.openSync(trava, 'wx')); return true; } catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EPERM' && e.code !== 'EBUSY') return false;
      // Trava de processo que morreu sem soltar: velha demais, e tomada.
      try {
        if (Date.now() - fs.statSync(trava).mtimeMs > TRAVA_VELHA_MS) { fs.rmSync(trava, { force: true }); continue; }
      } catch (x) { continue; }
      if (Date.now() > limite) return false;
      dormir(3 + Math.floor(Math.random() * 7));
    }
  }
}

function soltar(sessionId) {
  try { fs.rmSync(caminhoTrava(sessionId), { force: true }); } catch (e) { /* ja foi */ }
}

function alterar(sessionId, fn) {
  const travou = travar(sessionId);
  try {
    const atual = ler(sessionId);
    const novo = fn(atual) || atual;
    // Sem a trava (prazo de 2 s estourado), grava mesmo assim, como antes da D244: parar o
    // portao por causa do contador seria pior. Neste caso raro, um disparo pode se perder.
    gravar(sessionId, novo);
    return novo;
  } finally {
    if (travou) soltar(sessionId);
  }
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
const CAMPOS_DA_SESSAO = ['avisouSemConfig', 'avisouTipoErrado', 'avisouApelido', 'gatilho3', 'abertoEm',
  'frente', 'avisouTabelaShell'];
const CAMPOS_DO_TURNO = ['trabalhoReal', 'bloqueouNesteTurno', 'buscouNesteTurno', 'contadores'];

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
    // Preservar arquivo corrompido com sufixo .corrompido antes de recomecar
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

module.exports = { caminhoSessao, caminhoTrava, ler, gravar, alterar, limpar, CAMPOS_DA_SESSAO, CAMPOS_DO_TURNO,
  camposDaSessao, incrementar, descarregar };
