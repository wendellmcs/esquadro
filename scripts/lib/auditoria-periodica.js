'use strict';

/**
 * Bloco A2 (D426): a auditoria (lib/auditoria.js) roda sozinha na abertura da sessao, no maximo 1 vez a
 * cada N dias por projeto, e so fala do que passou do teto. Tudo certo = silencio (string vazia); desde o plano 091
 * T6, com nada a cortar mas com ordens disparadas desde a auditoria anterior, sai so a retroalimentacao delas; e,
 * quando a auditoria falha, a linha "falhou" sai com a retroalimentacao junto (a foto das ordens avanca na marca).
 *
 * Por que aqui e nao no abertura.js: o gancho so liga a funcao; o que decide "e hora?" e "vale avisar?"
 * mora em funcoes que recebem `agora` e `auditar` por parametro, para o teste nao esperar dias nem
 * depender do disco real. Sem rede: so le arquivos do projeto e grava a marca.
 *
 * Regras de desenho:
 * - So roda com projeto.json carregado. Sem ele a auditoria varreria o repositorio inteiro (caro) e a
 *   marca criaria .claude/esquadro/ num projeto que nunca foi configurado.
 * - A marca (.claude/esquadro/auditoria.json, { "ultima": "<ISO>", "ordens": { <foto dos contadores de ordem> } })
 *   e gravada DEPOIS de auditar, tenha
 *   avisado ou nao, e tambem quando a auditoria falha: repetir o custo e o ruido a cada abertura seria
 *   pior que esperar os N dias. Marca ilegivel ou ausente = vencida. Data no futuro (relogio voltou) =
 *   vencida tambem: tratar como "nunca mais" calaria a auditoria ate o relogio alcancar a data.
 * - "Skill parada": a data de cada SKILL.md e a do ULTIMO COMMIT que o tocou, lida com um unico
 *   `git log` por auditoria (git.ultimasMudancas). O mtime sozinho mentia: clone ou checkout o poe em
 *   "agora" e a skill parada ha anos sumia do aviso por ate 90 dias. Reserva pelo mtime: arquivo sem
 *   commit (nao rastreado) e git ausente, fora de repo, sem commit ou com timeout. Limite conhecido:
 *   edicao ainda nao commitada num arquivo rastreado conta pela data do commit (ver-a exigiria um
 *   segundo processo, `git status`).
 *   Outro limite conhecido: clone raso (`git clone --depth 1`) so tem o commit mais recente, entao todo
 *   arquivo rastreado leva a data desse commit (nem o git nem o mtime guardam a data antiga) e uma skill
 *   parada ha anos some do aviso. Este modulo nao detecta isso; quem audita um clone raso deve buscar o
 *   historico inteiro antes (`git fetch --unshallow`).
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.js');
const textoLib = require('./texto.js');
const gitLib = require('./git.js');

const CHAVE = 'auditarNaAbertura';
const MARCA = 'auditoria.json';
const PADROES = { diasEntreAuditorias: 7, diasSkillParada: 90 };
const MAX_POR_CATEGORIA = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

function ehObjeto(p) {
  return !!p && typeof p === 'object' && !Array.isArray(p);
}

/** Ligado por padrao. So `false` desliga (como sugerirAprender e qualidadeDeResposta). */
function ligada(projeto) {
  return !(ehObjeto(projeto) && projeto[CHAVE] === false);
}

/** Dias de `limiares.<nome>` quando e numero positivo; senao o padrao. */
function dias(projeto, nome) {
  const l = ehObjeto(projeto) && ehObjeto(projeto.limiares) ? projeto.limiares[nome] : undefined;
  return typeof l === 'number' && isFinite(l) && l > 0 ? l : PADROES[nome];
}

function emMs(agora) {
  // Date invalido (getTime() = NaN) cai no relogio, como numero invalido: NaN nunca vence a marca e
  // faz o toISOString da marca lancar RangeError (engolido), entao a auditoria nunca mais rodaria.
  if (agora instanceof Date) { const ms = agora.getTime(); return isFinite(ms) ? ms : Date.now(); }
  return typeof agora === 'number' && isFinite(agora) ? agora : Date.now();
}

/** Instante da ultima auditoria, em ms; null se a marca nao existe ou nao se le. */
function lerMarca(cwd) {
  try {
    const m = JSON.parse(textoLib.semBom(fs.readFileSync(config.caminhoEmEsquadro(cwd, MARCA), 'utf8')));
    const t = ehObjeto(m) ? Date.parse(m.ultima) : NaN;
    return isFinite(t) ? t : null;
  } catch (e) {
    return null;
  }
}

/** Ja passaram N dias desde a ultima? Marca ausente, ilegivel ou no futuro conta como vencida. */
function vencida(cwd, projeto, agora) {
  const ultima = lerMarca(cwd);
  if (ultima === null) return true;
  const t = emMs(agora);
  if (ultima > t) return true;
  return t - ultima >= dias(projeto, 'diasEntreAuditorias') * DIA_MS;
}

/** Plano 091 T6: a foto dos contadores de ordem que a auditoria anterior guardou na marca; sem ela, null. */
function lerFoto(cwd) {
  try {
    const m = JSON.parse(textoLib.semBom(fs.readFileSync(config.caminhoEmEsquadro(cwd, MARCA), 'utf8')));
    return ehObjeto(m) && ehObjeto(m.ordens) ? m.ordens : null;
  } catch (e) {
    return null;
  }
}

/**
 * Grava a marca (e, desde o plano 091 T6, a foto `ordens` dos contadores de ordem). Falhar nao pode derrubar nem avisar
 * nada: a proxima abertura apenas audita de novo.
 */
function gravarMarca(cwd, agora, ordens) {
  try {
    const alvo = config.caminhoEmEsquadro(cwd, MARCA);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    const marca = { ultima: new Date(emMs(agora)).toISOString() };
    if (ehObjeto(ordens)) marca.ordens = ordens;
    fs.writeFileSync(alvo, JSON.stringify(marca) + '\n', 'utf8');
  } catch (e) { /* sem marca: a proxima abertura audita de novo */ }
}

const ACHOU = ' achou o que cortar:';

/** O aviso traz a ordem de cortar? (Retroalimentacao sozinha nao acende o botao do auditar nem conta a ordem.) */
function pedeCorte(texto) {
  return typeof texto === 'string' && texto.indexOf(ACHOU) !== -1;
}

/**
 * Skills do projeto cujo SKILL.md nao muda ha `limite` dias ou mais. Data = ultimo commit que tocou o
 * arquivo (1 git log); sem commit para ele, ou sem git, o mtime. Sem arquivo = nao entra.
 */
function skillsParadas(cwd, nomes, agora, limite) {
  const t = emMs(agora);
  const achadas = [];
  const lista = Array.isArray(nomes) ? nomes : [];
  const commits = lista.length ? gitLib.ultimasMudancas(cwd, '.claude/skills') : null;
  for (const nome of lista) {
    try {
      const arquivo = path.join(cwd, '.claude', 'skills', String(nome), 'SKILL.md');
      const mtimeMs = fs.statSync(arquivo).mtimeMs;
      const doGit = commits ? commits.get('.claude/skills/' + String(nome) + '/SKILL.md') : undefined;
      const m = typeof doGit === 'number' ? doGit : mtimeMs;
      if (t - m >= limite * DIA_MS) achadas.push({ nome: String(nome), dias: Math.floor((t - m) / DIA_MS) });
    } catch (e) { /* skill sem SKILL.md legivel: a auditoria ja diz */ }
  }
  return achadas;
}

/** O texto sai por gancho: ASCII puro, uma linha, sem quebra no meio de um item. */
function ascii(valor) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '?').trim();
}

function lista(itens) {
  const nomes = itens.map(ascii);
  if (nomes.length <= MAX_POR_CATEGORIA) return nomes.join('; ');
  return nomes.slice(0, MAX_POR_CATEGORIA).join('; ') + '; e mais ' + (nomes.length - MAX_POR_CATEGORIA);
}

/** Monta as linhas de aviso a partir do relatorio. Vazio quando nada passou do teto. */
function itens(relatorio, paradas, limiteSkill, semGatilho) {
  const r = relatorio || {};
  const saida = [];
  if (r.peso && r.peso.estourou) {
    saida.push('peso de instrucao ' + ascii(r.peso.total) + ' acima do teto ' + ascii(r.peso.teto));
  }
  // So objetos entram: `null` no meio (s.a / c.gatilho) lancaria e trocaria o aviso valido por "falhou".
  const sobre = Array.isArray(r.sobreposicoes) ? r.sobreposicoes.filter(ehObjeto) : [];
  if (sobre.length) {
    saida.push('skills que se sobrepoem (' + sobre.length + '): ' +
      lista(sobre.map(function (s) { return s.a + ' x ' + s.b; })));
  }
  const contra = Array.isArray(r.contradicoes) ? r.contradicoes.filter(ehObjeto) : [];
  if (contra.length) {
    saida.push('regras que se contradizem (' + contra.length + ' gatilho' + (contra.length > 1 ? 's' : '') + '): ' +
      lista(contra.map(function (c) { return c.gatilho; })));
  }
  if (paradas.length) {
    saida.push('skills sem mudanca ha ' + ascii(limiteSkill) + ' dias ou mais (' + paradas.length + '): ' +
      lista(paradas.map(function (s) { return s.nome + ' (' + s.dias + ' dias)'; })));
  }
  // Plano 091 #8 (mock D559): atalho sem "trocar quando" vira divida esquecida; entra no que cortar.
  if (semGatilho.length) {
    saida.push('atalhos sem gatilho (' + semGatilho.length + '): ' +
      lista(semGatilho.map(function (a) { return a.arquivo + ':' + a.linha; })));
  }
  return saida;
}

/**
 * Ponto de entrada da abertura. Devolve o texto a imprimir ('' = silencio). NUNCA lanca.
 * `opcoes.agora` (ms ou Date) e `opcoes.auditar` (funcao) existem para o teste.
 */
function avisoDaAuditoria(cwd, projeto, opcoes) {
  try {
    const o = opcoes || {};
    if (!projeto || !cwd || !ligada(projeto)) return '';
    const agora = o.agora === undefined ? Date.now() : o.agora;
    if (!vencida(cwd, projeto, agora)) return '';
    const auditar = typeof o.auditar === 'function' ? o.auditar : require('./auditoria.js').auditar;
    const cada = dias(projeto, 'diasEntreAuditorias');
    // Plano 091 T6 (mock D559, secao 5): as ordens dadas/cumpridas/recusadas desde a foto da auditoria anterior.
    const ordensLib = require('./ordens.js');
    const ultima = lerMarca(cwd);
    const t = emMs(agora);
    const totais = ordensLib.totaisDasOrdens(cwd);
    const retro = ordensLib.linhasDasOrdens(lerFoto(cwd), totais,
      ultima !== null && ultima <= t ? (t - ultima) / DIA_MS : null);
    let texto;
    try {
      const relatorio = auditar(cwd, projeto, {});
      const limiteSkill = dias(projeto, 'diasSkillParada');
      const nomes = relatorio && Array.isArray(relatorio.skills) ? relatorio.skills : [];
      // `opcoes.atalhos` (cwd, projeto) -> achados existe para o teste; fora de repositorio git, nada.
      const achados = typeof o.atalhos === 'function' ? o.atalhos(cwd, projeto)
        : require('./atalhos.js').doRepositorio(cwd, projeto).achados;
      const semGatilho = (Array.isArray(achados) ? achados : []).filter(function (a) { return ehObjeto(a) && !a.gatilho; });
      const linhas = itens(relatorio, skillsParadas(cwd, nomes, agora, limiteSkill), limiteSkill, semGatilho);
      // Plano 091 (#3, D559): o fim e ordem ao modelo (rodar a auditoria completa e levar os cortes em 3 opcoes),
      // nao so informacao; cortar segue so com o sim do dono. Sem nada a cortar, so a retroalimentacao (se houver).
      texto = linhas.length ? [
        'esquadro: auditoria automatica (a cada ' + ascii(cada) + ' dias)' + ACHOU,
        linhas.map(function (l) { return '- ' + l; }).join('\n')
      ].concat(retro, [
        'Faca no seu primeiro turno, depois de atender o pedido:',
        '1. Rode /esquadro:auditar para ver o detalhe.',
        '2. Leve os cortes ao usuario pelo AskUserQuestion, em 3 opcoes, com o',
        '   recomendado primeiro e o custo de cada um. Nao corte nada sem o sim.',
        'Desligar: "' + CHAVE + '": false em .claude/esquadro/projeto.json.'
      ]).join('\n') : (retro.length ? ['esquadro: auditoria automatica (a cada ' + ascii(cada) + ' dias): nada a cortar.']
        .concat(retro).join('\n') : '');
    } catch (e) {
      // A foto das ordens avanca na marca abaixo: a retroalimentacao do intervalo sai aqui, senao se perderia.
      texto = ['esquadro: auditoria automatica falhou (' + ascii(textoLib.causaDoErro(e)).slice(0, 120) +
        '); rode /esquadro:auditar'].concat(retro).join('\n');
    }
    gravarMarca(cwd, agora, totais);
    return texto;
  } catch (e) {
    return '';
  }
}

module.exports = {
  CHAVE, MARCA, PADROES, MAX_POR_CATEGORIA, ligada, dias, lerMarca, vencida, gravarMarca, skillsParadas,
  avisoDaAuditoria, pedeCorte
};
