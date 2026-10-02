'use strict';
const glob = require('./glob.js');
const degrausLib = require('./degraus.js');

const MARCHAS = ['rapida', 'padrao', 'aaa'];
const AMEACAS = ['interno', 'publico'];

const CHAVES = [
  'versaoConfig', 'geradoEm', 'plataforma', 'modeloDeAmeaca', 'provaDePronto',
  'quemDecide', 'fontesCanonicas', 'intocaveis', 'marchaPadrao', 'marchas',
  'comandosBloqueados', 'comandosLiberados', 'travas', 'limiares', 'agentes'
];

const TRAVAS = ['fecho', 'escopo', 'destrutivo', 'outraFrente'];

// As listas que os portoes LEEM de verdade. O aviso de tipo e estreito de
// proposito (D101): so campo que muda decisao de portao, e so quando o TIPO
// esta errado. Chave faltando e assunto de validar(), nunca do aviso.
const LISTAS_LIDAS = ['comandosLiberados', 'comandosBloqueados', 'intocaveis'];

// Padrao que NUNCA casa um alvo relativo: letra de unidade (C: ou C:\) ou esquema
// (file://). O alvo que chega aos portoes e sempre relativo a raiz do projeto
// (caminho.js), e glob.normalizar (glob.js:9-11) troca "\" por "/" e tira TODAS as
// barras da frente. Por isso "/segredos/**", "//segredos/**" e "\\segredos\**"
// normalizam para a MESMA string e CASAM - recusar qualquer uma delas seria dizer
// que nao casa nada quando casa. Fica no registro X4.
const NAO_RELATIVO = /^([A-Za-z]:|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/;

function ehTexto(v) { return typeof v === 'string' && v.trim() !== ''; }

function ehListaDeTexto(v) {
  return Array.isArray(v) && v.every(function (x) { return ehTexto(x); });
}

/** Data AAAA-MM-DD que existe de verdade. O `typeof` vem antes porque RegExp.test
 *  COAGE o argumento, e Object.create(null) estoura na coercao. */
function ehData(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Recusa padrao de caminho que nao tem como casar o alvo, que e sempre relativo. */
function conferirCaminhos(obj, erros) {
  const listas = [['intocaveis', obj.intocaveis]];
  if (obj.marchas && typeof obj.marchas === 'object') {
    for (const m of MARCHAS) listas.push(['marchas.' + m, obj.marchas[m]]);
  }
  for (const par of listas) {
    if (!Array.isArray(par[1])) continue;
    for (const padrao of par[1]) {
      if (typeof padrao === 'string' && NAO_RELATIVO.test(padrao)) {
        erros.push(par[0] + ': "' + padrao + '" nao e caminho relativo e nao casa nada');
      }
    }
  }
}

/** X2b. Guarda de CONTINENTE: projeto.json SEM a chave `travas` e o formato de
 *  TODO projeto.json de hoje - nada as grava ate a T10. Ler `projeto.travas.X`
 *  direto recriaria o proprio defeito que o X1 conserta, um campo a direita.
 *  A guarda de TIPO aqui e defesa em profundidade e nao morre por mutacao
 *  (R-X2b5): todo consumidor faz so `travas.X === false`, e "sim".destrutivo,
 *  [].destrutivo e (null || {}).destrutivo sao todos undefined. Custo zero. */
function travasDe(projeto) {
  const t = projeto && projeto.travas;
  return (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
}

/** X2a. Aviso de tipo, estreito (D101): recebe o objeto JA CARREGADO - sem um
 *  segundo readFileSync - e devolve so o que muda decisao de portao.
 *  NENHUM valor do arquivo e interpolado, so nomes de campo de lista fixa: nao
 *  ha caminho de vazamento de acento para o texto do hook (D64/R5). */
function avisosDeTipo(projeto) {
  const avisos = [];
  if (!projeto || typeof projeto !== 'object') return avisos;
  for (const lista of LISTAS_LIDAS) {
    if (!(lista in projeto)) continue;
    const valor = projeto[lista];
    if (!Array.isArray(valor)) { avisos.push(lista + ' tem de ser lista'); continue; }
    // o tipo do ELEMENTO, nao so o da lista: new RegExp faz ToString e [".*"]
    // vira ".*". Um aviso por lista, nao um por item.
    for (const item of valor) {
      if (typeof item !== 'string') { avisos.push(lista + ' tem item que nao e texto'); break; }
    }
  }
  if ('marchas' in projeto) {
    if (!projeto.marchas || typeof projeto.marchas !== 'object' || Array.isArray(projeto.marchas)) {
      avisos.push('marchas tem de ser objeto');
    } else {
      for (const m of MARCHAS) {
        if (m in projeto.marchas && !Array.isArray(projeto.marchas[m])) avisos.push('marchas.' + m + ' tem de ser lista');
      }
    }
  }
  if ('marchaPadrao' in projeto && MARCHAS.indexOf(projeto.marchaPadrao) === -1) {
    avisos.push('marchaPadrao tem de ser uma de: ' + MARCHAS.join(', '));
  }
  if ('travas' in projeto && (!projeto.travas || typeof projeto.travas !== 'object' || Array.isArray(projeto.travas))) {
    avisos.push('travas tem de ser objeto');
  }
  const deQualidade = require('./qualidade.js').avisoDeTipo(projeto);
  if (deQualidade) avisos.push(deQualidade);
  return avisos;
}

function validar(obj) {
  const erros = [];
  if (!obj || typeof obj !== 'object') return { ok: false, erros: ['projeto.json nao e um objeto'] };

  for (const chave of CHAVES) {
    if (!(chave in obj)) erros.push('falta a chave ' + chave);
  }
  if (obj.versaoConfig !== 1) erros.push('versaoConfig tem de ser 1');
  if (!ehData(obj.geradoEm)) erros.push('geradoEm tem de ser uma data AAAA-MM-DD que existe');
  if (AMEACAS.indexOf(obj.modeloDeAmeaca) === -1) {
    erros.push('modeloDeAmeaca tem de ser "interno" ou "publico"');
  }
  if (!ehTexto(obj.quemDecide)) erros.push('quemDecide tem de ser texto nao vazio');
  // null e resposta legitima: a varredura pode nao ter achado prova de pronto, e a
  // entrevista pergunta. O que nao pode e numero, objeto ou texto so de espaco.
  if (obj.provaDePronto !== null && !ehTexto(obj.provaDePronto)) {
    erros.push('provaDePronto tem de ser texto nao vazio ou null');
  }
  if (MARCHAS.indexOf(obj.marchaPadrao) === -1) {
    erros.push('marchaPadrao tem de ser uma de: ' + MARCHAS.join(', '));
  }
  if (!obj.plataforma || !ehTexto(obj.plataforma.so) || !ehTexto(obj.plataforma.shell)) {
    erros.push('plataforma precisa de so e shell, os dois texto nao vazio');
  }
  for (const lista of ['fontesCanonicas', 'intocaveis', 'comandosBloqueados', 'comandosLiberados']) {
    if (lista in obj && !ehListaDeTexto(obj[lista])) erros.push(lista + ' tem de ser lista de texto');
  }
  if (!obj.marchas || typeof obj.marchas !== 'object') {
    erros.push('marchas tem de ser objeto');
  } else {
    for (const m of MARCHAS) {
      if (!(m in obj.marchas)) { erros.push('falta marchas.' + m); continue; }
      if (!ehListaDeTexto(obj.marchas[m])) erros.push('marchas.' + m + ' tem de ser lista de texto');
    }
  }
  // `for..of` sobre {} ou numero ESTOURA, e validador que estoura nao reprova: ele
  // derruba quem o chamou. O tipo errado ja virou erro nomeado no laco acima.
  for (const lista of ['comandosBloqueados', 'comandosLiberados']) {
    if (!Array.isArray(obj[lista])) continue;
    for (const padrao of obj[lista]) {
      if (typeof padrao !== 'string') continue;
      try { new RegExp(padrao); } catch (e) { erros.push(lista + ': regex invalida "' + padrao + '"'); }
    }
  }
  // O portao testa o escape ANTES de classificar (portao-destrutivo.js:31): com o
  // mesmo padrao nos dois lados o liberado vence sempre, e a regra de bloqueio do
  // dono nao vale nada. Pega a grafia identica; a familia larga e o registro X5.
  if (Array.isArray(obj.comandosBloqueados) && Array.isArray(obj.comandosLiberados)) {
    for (const padrao of obj.comandosBloqueados) {
      if (obj.comandosLiberados.indexOf(padrao) !== -1) {
        erros.push('o padrao "' + padrao + '" esta em comandosBloqueados E em comandosLiberados');
      }
    }
    // X5b: UNIAO, nunca substituicao. O laco acima pega a grafia identica; este
    // pega o liberado que CASA o texto do bloqueado ("npm publis" x "npm
    // publish"), que o indexOf perde. Trocar um pelo outro perderia 7 de 10
    // deteccoes de hoje, porque padrao ancorado nao casa a propria grafia:
    // new RegExp("\\bnpm publish\\b").test("\\bnpm publish\\b") = false.
    for (const bloqueado of obj.comandosBloqueados) {
      if (typeof bloqueado !== 'string') continue;
      for (const liberado of obj.comandosLiberados) {
        if (typeof liberado !== 'string' || liberado === bloqueado) continue;
        let casa = false;
        try { casa = new RegExp(liberado, 'i').test(bloqueado); } catch (e) { casa = false; }
        if (casa) erros.push('comandosLiberados: "' + liberado + '" neutraliza o comandosBloqueados "' + bloqueado + '"');
      }
    }
  }
  conferirCaminhos(obj, erros);
  // `obj.travas &&` deixava passar null; e {} nao tem trava nenhuma dentro.
  if (!obj.travas || typeof obj.travas !== 'object' || Array.isArray(obj.travas)) {
    erros.push('travas tem de ser objeto com as quatro chaves');
  } else {
    for (const t of TRAVAS) {
      if (typeof obj.travas[t] !== 'boolean') erros.push('travas.' + t + ' tem de ser true ou false');
    }
  }

  if ('limiares' in obj && (obj.limiares === null || typeof obj.limiares !== 'object')) {
    erros.push('limiares tem de ser objeto');
  }

  if ('agentes' in obj) {
    const esc = obj.agentes && obj.agentes.escada;
    if (esc !== undefined && !ehListaDeTexto(esc)) erros.push('agentes.escada tem de ser lista de texto');
    const deg = obj.agentes && obj.agentes.degraus;
    if (deg !== undefined) {
      if (!Array.isArray(deg)) {
        erros.push('agentes.degraus tem de ser lista');
      } else {
        for (const e of degrausLib.validar(deg).erros) erros.push('agentes.degraus: ' + e);
        // O acoplamento da spec §7: os dois lados, na mesma ordem. Gravar um sem
        // o outro nao estoura em lugar nenhum - so deixa um portao mudo.
        for (const p of degrausLib.desalinhados(obj.agentes)) erros.push('agentes: ' + p);
      }
    }
  }

  return { ok: erros.length === 0, erros: erros };
}

/** Tres casos, nao dois:
 *  - sem resposta (undefined, ou texto so de espaco - o Enter num prompt devolve "")
 *    -> vale o que a varredura inferiu;
 *  - resposta "nenhuma" (null) -> vence o palpite da varredura e vira vazio;
 *  - qualquer outra resposta -> vale como esta, e validar() a confere.
 *  Cair no inferido porque o dono respondeu null seria descartar a resposta dele. */
function escolher(daEntrevista, doInferido, vazio) {
  const semResposta = daEntrevista === undefined ||
    (typeof daEntrevista === 'string' && daEntrevista.trim() === '');
  if (semResposta) return doInferido === undefined ? vazio : doInferido;
  return daEntrevista === null ? vazio : daEntrevista;
}

/** Junta o que a varredura inferiu com o que a entrevista perguntou. */
function montar(inferido, respostas) {
  const i = inferido || {};
  const r = respostas || {};
  const hoje = new Date().toISOString().slice(0, 10);
  const travas = {};
  for (const t of TRAVAS) {
    // Default LIGADO. A resposta do dono so vale se for booleano de verdade - e se
    // ele desligou, fica desligado: religar calado seria a mentira que este plugin
    // existe para impedir.
    travas[t] = (r.travas && typeof r.travas[t] === 'boolean') ? r.travas[t] : true;
  }
  return {
    versaoConfig: 1,
    geradoEm: hoje,
    plataforma: i.plataforma || { so: process.platform, shell: process.platform === 'win32' ? 'powershell' : 'bash' },
    // `undefined` SOME no JSON.stringify: o objeto passaria em validar() e voltaria
    // invalido do disco. `null` sobrevive a gravacao, e validar() o recusa aqui e agora.
    modeloDeAmeaca: r.modeloDeAmeaca === undefined ? null : r.modeloDeAmeaca,
    provaDePronto: escolher(r.provaDePronto, i.provaDePronto, null),
    quemDecide: r.quemDecide === undefined ? null : r.quemDecide,
    fontesCanonicas: escolher(r.fontesCanonicas, i.candidatosCanonicos, []),
    intocaveis: escolher(r.intocaveis, undefined, []),
    marchaPadrao: r.marchaPadrao || 'padrao',
    marchas: {
      aaa: (r.marchas && r.marchas.aaa) || [],
      padrao: (r.marchas && r.marchas.padrao) || [],
      rapida: (r.marchas && r.marchas.rapida) || []
    },
    comandosBloqueados: escolher(r.comandosBloqueados, undefined, []),
    comandosLiberados: escolher(r.comandosLiberados, undefined, []),
    travas: travas,
    limiares: r.limiares || {},
    // A entrevista responde `degraus`; os dois lados saem daqui juntos, ou nao saem.
    // Sem resposta, preserva-se o que ja vinha: configuracao antiga nao se reescreve sozinha.
    agentes: r.degraus !== undefined ? degrausLib.paraProjeto(r.degraus) : (r.agentes || { escada: [] })
  };
}

/**
 * H3: nao havia caminho de volta. O `geradoEm` era gravado uma vez e nunca mais,
 * e a pessoa respondia os degraus uma vez na vida.
 *
 * Regra unica e dura: o que a entrevista NAO perguntou de novo, PRESERVA-SE.
 * Um re-init que zera `intocaveis` porque ninguem os mencionou e pior do que nao
 * ter re-init nenhum - o arquivo continua parecendo proteger, e nao protege.
 *
 * `atualizar` NAO valida: quem valida e `validar`, e o roteiro roda os dois. Meia
 * configuracao de entrada sai meia configuracao - inventar o que falta seria
 * gravar palpite com cara de resposta do dono.
 */
function atualizar(antigo, respostas, hoje) {
  const base = (antigo && typeof antigo === 'object' && !Array.isArray(antigo))
    ? JSON.parse(JSON.stringify(antigo)) : {};
  const r = (respostas && typeof respostas === 'object') ? respostas : {};
  const data = ehData(hoje) ? hoje : new Date().toISOString().slice(0, 10);

  const novas = Object.assign({}, r);
  if (novas.degraus !== undefined) {
    novas.agentes = degrausLib.paraProjeto(novas.degraus);
    delete novas.degraus;
  }

  const mudou = [];
  const ignoradas = [];
  for (const chave of Object.keys(novas)) {
    if (CHAVES.indexOf(chave) === -1) { ignoradas.push(chave); continue; }
    if (chave === 'versaoConfig' || chave === 'geradoEm') continue;
    if (novas[chave] === undefined) continue;
    if (JSON.stringify(base[chave]) === JSON.stringify(novas[chave])) continue;
    base[chave] = novas[chave];
    mudou.push(chave);
  }

  base.versaoConfig = 1;
  if (base.geradoEm !== data) { base.geradoEm = data; mudou.push('geradoEm'); }

  return { config: base, mudou: mudou, ignoradas: ignoradas };
}

/**
 * Padroes de `intocaveis` que nao casam com NENHUM arquivo do repositorio.
 *
 * O buraco que a D104 mediu e nao fechou: `intocaveis` escrito com typo
 * (`segredo/**` em vez de `segredos/**`) fica INERTE em silencio. Nao e erro de
 * tipo, entao `avisosDeTipo` nao ve; nao e erro de sintaxe, entao `validar` nao
 * ve. A configuracao parece proteger e nao protege - e, como a D104 mostrou, o
 * que segura o segredo nesse caso e o passo 5 do portao, por acidente.
 *
 * Aqui nao se adivinha intencao: so se diz que o padrao nao pegou nada. Um
 * padrao para pasta que ainda nao existe e legitimo, e por isso isto AVISA, nunca
 * nega. Funcao pura sobre duas listas, para poder ser testada sem repositorio.
 *
 * D244/defeito 6: com `cwd`, a pasta fixa do padrao (os segmentos antes do primeiro
 * caractere de glob) que EXISTE no disco tambem salva o padrao - pasta ignorada pelo git
 * de proposito nao e typo. Padrao sem pasta fixa (`**\/*.pem`) nao se salva assim.
 */
function pastaFixa(padrao) {
  const fixos = [];
  for (const seg of String(padrao).split('/')) {
    if (seg === '' || /[*?[\]{}]/.test(seg)) break;
    fixos.push(seg);
  }
  return fixos.length ? fixos.join('/') : null;
}

function intocaveisInertes(projeto, arquivos, cwd) {
  const padroes = (projeto && Array.isArray(projeto.intocaveis)) ? projeto.intocaveis : [];
  if (!Array.isArray(arquivos) || arquivos.length === 0) return [];
  return padroes.filter(function (p) {
    if (typeof p !== 'string' || !p.trim()) return false;
    if (arquivos.some(function (a) { return glob.casa(p, a, false); })) return false;
    const fixa = cwd ? pastaFixa(p) : null;
    if (fixa) {
      try { if (require('node:fs').existsSync(require('node:path').join(cwd, fixa))) return false; } catch (e) { /* inerte */ }
    }
    return true;
  });
}

function motivoInerte(inertes) {
  return [
    'esquadro: ATENCAO - ' + inertes.length + ' padrao(oes) de `intocaveis` nao pegam arquivo nenhum:',
    inertes.map(function (p) { return '  - ' + p; }).join('\n'),
    'Padrao que nao casa nada nao protege nada. Se a pasta ainda nao existe, esta certo;',
    'se e typo, o arquivo que voce quis proteger esta desprotegido AGORA.',
    'Confira em .claude/esquadro/projeto.json, chave `intocaveis`.'
  ].join('\n');
}

module.exports = {
  MARCHAS, AMEACAS, CHAVES, TRAVAS, LISTAS_LIDAS,
  travasDe, avisosDeTipo, intocaveisInertes, motivoInerte, validar, montar, atualizar
};
