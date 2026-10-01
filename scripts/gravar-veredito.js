#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const config = require('./lib/config.js');
const glob = require('./lib/glob.js');
const texto = require('./lib/texto.js');
const veredito = require('./lib/veredito.js');

// 0.3.4, item 1 (D264, D287): o veredito do inspetor e gravado por hook, em vez de a mao.
// Dois pontos de entrada, porque o Claude Code entrega o relatorio do subagente por dois caminhos:
//   - SubagentStop: o relatorio e `last_assistant_message` (payload real medido no claude 2.1.258);
//   - PostToolUse de SubagentHandback: o relatorio e `tool_input.message` (formato da documentacao;
//     a partir da 2.1.271, no modo auto, o `last_assistant_message` traz so o texto de encerramento).
// NUNCA barra: sai sempre com 0 e nunca emite `decision` (no SubagentStop, `block` faria o inspetor
// continuar). NUNCA cala: o que nao foi gravado vira `systemMessage` com a causa. NUNCA sobrescreve.

const AGENTE = 'esquadro:inspetor';
// revisao/<id>/<n>/vereditos (formato novo) ou revisao/<n>/vereditos (formato da 0.3.0).
const PASTA_DE_RONDA = /(?:^|\/)\.claude\/esquadro\/revisao\/[^/]+(?:\/[^/]+)?\/vereditos$/i;
const TODAS_AS_LENTES = veredito.LENTES.concat(veredito.LENTES_UI);

function normal(s) { return String(s).trim().toLowerCase(); }

/** O nome do arquivo: a chave da lente. O titulo so vale quando as duas familias nao o dividem. */
function chaveDaLente(nome) {
  if (typeof nome !== 'string') return null;
  const porChave = TODAS_AS_LENTES.filter(function (l) { return normal(l.chave) === normal(nome); });
  if (porChave.length === 1) return porChave[0].chave;
  const porTitulo = TODAS_AS_LENTES.filter(function (l) { return normal(l.titulo) === normal(nome); });
  return porTitulo.length === 1 ? porTitulo[0].chave : null;
}

/** Tira o objeto JSON da mensagem: bloco de codigo, a mensagem inteira, ou do primeiro { ao ultimo }. */
function extrairJson(mensagem) {
  const candidatos = [];
  const cerca = /```[a-z]*\s*([\s\S]*?)```/gi;
  let m;
  while ((m = cerca.exec(mensagem)) !== null) candidatos.push(m[1]);
  candidatos.push(mensagem);
  const i = mensagem.indexOf('{');
  const f = mensagem.lastIndexOf('}');
  if (i !== -1 && f > i) candidatos.push(mensagem.slice(i, f + 1));
  for (const c of candidatos) {
    try {
      const obj = JSON.parse(c.trim());
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch (e) { /* proximo candidato */ }
  }
  return null;
}

function ehArquivo(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function ehPasta(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

/** D287: a pasta vem do JSON do inspetor; so vale se for a `vereditos` de uma ronda de verdade. */
function pastaDaRonda(campo, raiz) {
  if (typeof campo !== 'string' || campo.trim() === '') {
    return { erro: 'o veredito nao traz o campo "vereditos" (a pasta da ronda que o briefing passou)' };
  }
  const abs = path.resolve(raiz, campo.trim());
  if (!PASTA_DE_RONDA.test(glob.normalizar(abs))) {
    return { erro: '"' + campo.trim() + '" nao e a pasta vereditos de uma ronda em .claude/esquadro/revisao/' };
  }
  const ronda = path.dirname(abs);
  if (!ehArquivo(path.join(ronda, 'A.txt')) || !ehArquivo(path.join(ronda, 'B.txt'))) {
    return { erro: 'a pasta da ronda de "' + campo.trim() + '" nao tem A.txt e B.txt ao lado, entao nao parece uma ronda' };
  }
  if (!ehPasta(abs)) return { erro: 'a pasta vereditos da ronda "' + campo.trim() + '" nao existe' };
  return { pasta: abs };
}

/** O que fazer quando o hook nao gravou: o arquivo (ou o molde dele), como manda a skill revisar, Passo 2. */
function comoGravar(lente, destino) {
  const chave = lente ? chaveDaLente(lente) : null;
  const arquivo = (chave || '<lente>') + '.json';
  return 'Grave esta lente a mao: salve o JSON do inspetor como ' +
    (destino ? path.join(destino, arquivo) : '<pasta vereditos da ronda>/' + arquivo) + ' (skill revisar, Passo 2).';
}

function aviso(causa, lente, destino) {
  return 'esquadro: nao gravei o veredito' + (lente ? ' da lente ' + lente : '') + ': ' + causa + '. ' + comoGravar(lente, destino);
}

function semPasta(vd) {
  const copia = Object.assign({}, vd);
  delete copia.vereditos;
  return copia;
}

/** Grava o veredito e devolve o aviso (texto), ou null quando gravou ou quando ja estava gravado igual. */
function avisoDaGravacao(mensagem, raiz) {
  if (typeof mensagem !== 'string' || mensagem.trim() === '') return aviso('a resposta do inspetor veio vazia');
  const vd = extrairJson(mensagem);
  if (!vd) return aviso('nao achei o JSON do veredito na resposta do inspetor');
  const erros = veredito.errosDoVeredito(vd);
  if (erros.length) return aviso('veredito invalido (' + erros.join('; ') + ')', typeof vd.lente === 'string' ? vd.lente : null);
  const lente = chaveDaLente(vd.lente);
  if (!lente) return aviso('lente desconhecida: "' + String(vd.lente).slice(0, 60) + '"');
  const onde = pastaDaRonda(vd.vereditos, raiz);
  if (onde.erro) return aviso(onde.erro, lente);

  const arquivo = path.join(onde.pasta, lente + '.json');
  try {
    // wx: nunca por cima de arquivo que ja esta la, nem se dois inspetores chegarem juntos.
    fs.writeFileSync(arquivo, JSON.stringify(vd, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return null;
  } catch (e) {
    if (!e || e.code !== 'EEXIST') return aviso('erro ao escrever ' + arquivo + ' (' + (e && (e.code || e.message)) + ')', lente);
  }
  let atual;
  try { atual = JSON.parse(texto.semBom(fs.readFileSync(arquivo, 'utf8'))); } catch (e) {
    return aviso('ja existe ' + lente + '.json e nao consegui le-lo (' + (e && (e.code || e.message)) + '); nao sobrescrevi', lente, onde.pasta);
  }
  if (util.isDeepStrictEqual(semPasta(atual), semPasta(vd))) return null;
  return aviso('ja existe ' + lente + '.json com outro conteudo; nao sobrescrevi', lente, onde.pasta);
}

/** Marca por inspetor, fora do estado da sessao (que tem lista fechada de campos) e fora de vereditos/. */
function marcaDoInspetor(e) {
  if (typeof e.agent_id !== 'string' || e.agent_id === '') return null;
  const limpo = function (s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '-'); };
  const base = estado.caminhoSessao(e.session_id);
  return path.join(path.dirname(base), path.basename(base, '.json') + '.veredito-' + limpo(e.agent_id) + '.marca');
}

// Aviso de quando a marca do handback nao se grava: sem ela o SubagentStop nao sabe que o handback ja avisou.
const MARCA_FALHOU = 'Nao consegui gravar a marca deste inspetor: o aviso pode se repetir quando o subagente terminar.';

/** A resposta do inspetor, conforme o evento: SubagentStop ou handback (o resto nao e deste script). */
function mensagemDe(e) {
  if (e.hook_event_name === 'SubagentStop') return e.last_assistant_message;
  if (e.hook_event_name === 'PostToolUse') {
    if (e.tool_name && e.tool_name !== 'SubagentHandback') return undefined;
    return e.tool_input && typeof e.tool_input === 'object' ? e.tool_input.message : undefined;
  }
  return undefined;
}

/** A lente do JSON da resposta, para o aviso de excecao; null quando a resposta nao se le. Nunca lanca. */
function lenteDaResposta(e) {
  try {
    const mensagem = mensagemDe(e);
    const vd = typeof mensagem === 'string' ? extrairJson(mensagem) : null;
    return vd && typeof vd.lente === 'string' && vd.lente.trim() ? vd.lente.trim().slice(0, 60) : null;
  } catch (x) { return null; }
}

function tratar(e) {
  if (e.agent_type !== AGENTE) return null;
  if (e.hook_event_name !== 'SubagentStop' && e.hook_event_name !== 'PostToolUse') return null;
  if (e.hook_event_name === 'PostToolUse' && e.tool_name && e.tool_name !== 'SubagentHandback') return null;
  const mensagem = mensagemDe(e);

  const marca = marcaDoInspetor(e);
  // O handback vem antes do SubagentStop e ja tratou este inspetor (gravou, ou avisou): o
  // `last_assistant_message` desse caminho e so texto de encerramento, e avisar de novo seria ruido.
  if (e.hook_event_name === 'SubagentStop' && marca && fs.existsSync(marca)) return null;

  const raiz = config.raizDoProjeto(typeof e.cwd === 'string' && e.cwd ? e.cwd : process.cwd());
  const resultado = avisoDaGravacao(mensagem, raiz);

  if (e.hook_event_name === 'PostToolUse' && marca) {
    try { fs.mkdirSync(path.dirname(marca), { recursive: true }); fs.writeFileSync(marca, '1', 'utf8'); } catch (x) {
      // so perde o silencio: o SubagentStop vai ler de novo. Se ha aviso, diz que ele pode vir duas vezes.
      if (resultado) return resultado + ' ' + MARCA_FALHOU;
    }
  }
  return resultado;
}

io.blindar(function () {
  io.lerEntrada(function (e) {
    let resultado;
    try { resultado = tratar(e); } catch (erro) {
      const lente = lenteDaResposta(e);
      resultado = 'esquadro: nao consegui gravar o veredito ' +
        (lente ? 'da lente ' + lente : '(nao soube qual lente: a resposta do inspetor nao trazia um JSON legivel)') +
        ' - erro inesperado (' + (erro && erro.message) + '). ' + comoGravar(lente, null);
    }
    if (resultado) process.stderr.write(resultado + '\n');
    io.permitir(resultado ? { systemMessage: resultado } : undefined);
  });
});
