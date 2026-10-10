'use strict';

// Nove LENTES, nao nove copias do mesmo revisor.
// Nove copias acham o mesmo problema nove vezes; nove lentes acham nove classes de problema.
const LENTES = [
  { chave: 'correcao', titulo: 'Correcao e regressao',
    pergunta: 'Qual dos dois quebra? Entrada concreta que produz resultado errado, com arquivo:linha.' },
  { chave: 'escopo', titulo: 'Fidelidade ao pedido',
    pergunta: 'O que mudou alem do necessario? Renomeacao, extracao, formatacao junto de correcao funcional.' },
  { chave: 'estados', titulo: 'Estados obrigatorios (codigo)',
    pergunta: 'Erro, vazio, carregando, limite e timeout estao tratados, ou so o caso feliz?' },
  { chave: 'borda', titulo: 'Entrada e borda',
    pergunta: 'null, string vazia, lista vazia, numero negativo, unicode, caminho com espaco, arquivo enorme.' },
  { chave: 'seguranca', titulo: 'Seguranca e dado sensivel',
    pergunta: 'Segredo em texto, log com dado do usuario, entrada nao validada que vira comando ou caminho. ' +
      'Antes de P0, tres conferencias: (1) os chamadores reais, nao o caminho hipotetico; ' +
      '(2) leitura nao e mutacao; (3) desenho deliberado, padrao repetido e coerente no modulo, nao e falha. ' +
      'Sem confirmar a intencao, o achado nasce P2 com pergunta, nunca P0.' },
  { chave: 'manutencao', titulo: 'Legibilidade e manutencao',
    pergunta: 'O que um leitor novo entende errado? Nome que mente, funcao que faz duas coisas, erro engolido.' },
  { chave: 'microcopy', titulo: 'Texto que o usuario le',
    pergunta: 'Mensagem que nao diz o que fazer a seguir, jargao, ingles solto, tom que culpa o usuario.' },
  { chave: 'medidor', titulo: 'Mexeram no medidor',
    pergunta: 'Teste, baseline, threshold, skip ou mock mudaram junto com o codigo que eles cobrem?' },
  { chave: 'design', titulo: 'Fidelidade ao design system (codigo)',
    pergunta: 'Cite o token literal ou a tela irmã de referência. Valor cru, gradiente, sombra larga, card aninhado ou tipografia fluida onde o sistema nao os tem. Sem citar token ou coordenada, o veredito nao conta.' }
];

// D121 mediu: 3 exatas, 1 parcial, 4 contra 4 sem contraparte. A causa nao e
// descuido - a familia de cima e de CODIGO, esta e de TELA. Decisao 8 (2026-09-23):
// convivem declaradas, nao se fundem. Chaves com sufixo para nunca colidir. F6-01 (D335): o titulo tambem
// nao se repete - o inspetor grava o titulo no campo lente, e o apurar casa a refutacao por esse texto -,
// entao os dois que as familias dividiam levam "(codigo)" e "(tela)".
const LENTES_UI = [
  { chave: 'ui-design', titulo: 'Fidelidade ao design system (tela)', pergunta: 'Cite o token literal ou a tela irma de referencia. Valor cru, gradiente, sombra larga, card aninhado ou tipografia fluida onde o sistema nao os tem.' },
  { chave: 'ui-estados', titulo: 'Estados obrigatorios (tela)', pergunta: 'Carregando, vazio, erro e limite estao desenhados, ou so o caso cheio?' },
  { chave: 'ui-responsivo', titulo: 'Responsividade e overflow', pergunta: 'Em qual largura o conteudo vaza, corta ou empilha errado? Diga a largura e o elemento.' },
  { chave: 'ui-a11y', titulo: 'Acessibilidade', pergunta: 'Contraste, alvo de toque, foco visivel, ordem de tabulacao, rotulo de campo e de botao de icone.' },
  { chave: 'ui-microcopy', titulo: 'Microcopy', pergunta: 'Texto que nao diz o que fazer a seguir, jargao, ingles solto, tom que culpa quem le.' },
  { chave: 'ui-antiref', titulo: 'Anti-referencias visuais', pergunta: 'O que parece template generico em vez do produto? Cite o elemento e a tela irma que faz melhor.' },
  { chave: 'ui-correcao', titulo: 'Correcao visual e regressao', pergunta: 'O que funcionava e parou de aparecer, ou aparece em lugar errado? Cite viewport e coordenada.' },
  { chave: 'ui-governanca', titulo: 'Governanca e permissao', pergunta: 'Superficie restrita renderizada sem a permissao que a habilita, ou dado sensivel visivel no print.' }
];

const FAMILIAS = { codigo: LENTES, ui: LENTES_UI };

/**
 * A regra de despacho da spec (decisao 8), a mesma da tabela do /esquadro:revisar: so codigo,
 * as 9; so tela, as 8; os dois, as 17. Nada declarado e duvida, e na duvida vao as duas
 * familias - nunca nenhuma, que seria uma revisao sem voto.
 */
function familiasPara(tocaCodigo, tocaTela) {
  if (tocaCodigo && !tocaTela) return ['codigo'];
  if (tocaTela && !tocaCodigo) return ['ui'];
  return ['codigo', 'ui'];
}

const SEVERIDADES = ['P0', 'P1', 'P2'];

// Ronda 1 do 8c.5: a lente entra na chave. Dois defeitos de lentes diferentes na mesma
// linha sao dois achados; a mesma lente repetindo o mesmo lugar segue sendo um. A
// severidade continua primeiro: o motivo do teto conta os abertos pelo prefixo P0| e P1|.
function chaveAchado(a, lente) {
  return [a.severidade, a.arquivo, a.linha, lente].join('|');
}

// D223 e D228 (ronda 2 do 8c.10): o que invalida o veredito inteiro, e nao so um achado. O
// apurar-ronda.js para nestes, como no ilegivel, e o apurar os recusa; o validarVeredito os
// devolve junto dos erros de achado, que so descartam o achado.
function errosDoVeredito(vd) {
  if (!vd || typeof vd !== 'object') return ['veredito nao e objeto'];
  const erros = [];
  if (!vd.lente) erros.push('veredito sem lente');
  if (['A', 'B', 'empate'].indexOf(vd.melhor) === -1) erros.push('melhor tem de ser A, B ou empate');
  if (!Array.isArray(vd.achados)) erros.push('achados tem de ser lista, vazia quando nao ha achado');
  return erros;
}

function validarVeredito(vd) {
  const erros = errosDoVeredito(vd);
  const validos = [];
  if (!vd || typeof vd !== 'object') return { ok: false, erros: erros, achadosValidos: [] };

  for (const a of (vd.achados || [])) {
    if (SEVERIDADES.indexOf(a && a.severidade) === -1) {
      erros.push('achado com severidade invalida: ' + (a && a.severidade));
      continue;
    }
    // Anti-teatro: sem arquivo:linha, o voto nao conta. D396 n. 37/38: linha a partir de 1, como a da
    // refutacao (conferirRefutados); o achado de linha 0 molhava a ronda e nao tinha como ser refutado.
    if (!a.arquivo || !Number.isInteger(a.linha) || a.linha < 1) {
      erros.push('achado sem arquivo:linha (linha inteira a partir de 1), descartado: ' + String(a.descricao).slice(0, 60));
      continue;
    }
    if (!a.descricao || String(a.descricao).trim() === '') {
      erros.push('achado sem descricao, descartado');
      continue;
    }
    validos.push(a);
  }
  return { ok: erros.length === 0, erros: erros, achadosValidos: validos };
}

const TETO = 3;

/**
 * D244/defeito 3: `A.txt`, `B.txt` ou um caminho que termina neles -> 'A' | 'B' | null.
 * T14: o que vem depois do nome (`A.txt:120`, `A.txt linha 45`, `A.txt#L12`) nao tira o lado; sem
 * isso o achado do lado antigo voltava a contar. Os dois rotulos na mesma citacao: sem lado.
 * D246: antes do nome, qualquer nao-palavra e fronteira - `A.txt,B.txt` dava `A`.
 */
function rotuloDoArquivo(arquivo) {
  const re = /(?<![\w.])([AB])\.txt(?![\w.])/gi;
  const achados = new Set();
  let m;
  while ((m = re.exec(String(arquivo == null ? '' : arquivo))) !== null) achados.add(m[1].toUpperCase());
  return achados.size === 1 ? achados.values().next().value : null;
}

function mesmaLente(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** D244/defeito 3: refutar tambem exige citar. Refutacao sem prova derruba a apuracao. */
function conferirRefutados(refutados) {
  const lista = Array.isArray(refutados) ? refutados : [];
  for (let i = 0; i < lista.length; i++) {
    const r = lista[i];
    // F6-03: o que nao e objeto (null, numero, texto, lista) nao e uma refutacao sem prova: e a forma errada.
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      throw new Error('entrada invalida no refutados.json (posicao ' + (i + 1) + '): cada refutacao e um objeto ' +
        '{ ronda, lente, arquivo, linha, severidade, prova }');
    }
    if (typeof r.prova !== 'string' || r.prova.trim() === '') {
      throw new Error('refutacao sem prova (ronda ' + (r && r.ronda) + ', lente ' + (r && r.lente) + ', linha ' +
        (r && r.linha) + '): cite a fonte primaria - arquivo:linha ou o comando - em "prova"');
    }
    const onde = ' (ronda ' + r.ronda + ', lente ' + r.lente + ', linha ' + r.linha + '): ';
    // T14: sem o lado, a refutacao casava por null === null com achado que tambem nao citava A nem B.
    if (rotuloDoArquivo(r.arquivo) === null) {
      throw new Error('refutacao sem arquivo' + onde + '"arquivo" tem de ser A.txt ou B.txt, como o achado que ela refuta');
    }
    // T14 ronda 2: `linha: true` virava 1 por coercao e derrubava o achado da linha 1.
    if (!Number.isInteger(r.ronda) || r.ronda < 1) {
      throw new Error('refutacao com ronda invalida' + onde + '"ronda" tem de ser o numero inteiro da ronda, a partir de 1');
    }
    if (!Number.isInteger(r.linha) || r.linha < 1) {
      throw new Error('refutacao com linha invalida' + onde + '"linha" tem de ser o numero inteiro da linha do achado');
    }
    if (typeof r.lente !== 'string' || r.lente.trim() === '') {
      throw new Error('refutacao sem lente' + onde + '"lente" tem de ser o texto da lente, como no veredito');
    }
    // D246: sem a severidade, refutar o P1 de uma linha apagava o P0 da mesma lente e linha.
    if (SEVERIDADES.indexOf(r.severidade) === -1) {
      throw new Error('refutacao sem severidade' + onde + '"severidade" tem de ser P0, P1 ou P2, a do achado que ela refuta');
    }
  }
  return lista;
}

function refutado(lista, ronda, lente, a) {
  return lista.some(function (r) {
    return r.ronda === ronda && mesmaLente(r.lente, lente) && r.linha === a.linha && r.severidade === a.severidade &&
      rotuloDoArquivo(r.arquivo) === rotuloDoArquivo(a.arquivo);
  });
}

// D387 (#11c): dois achados do mesmo arquivo a ate 10 linhas um do outro viram "par candidato" para o
// juiz de mesmo defeito. Distancia 10 entra; 11 fica fora.
const DISTANCIA_PAR = 10;
const RESPOSTAS_MESMO = ['sim', 'nao', 'nao-sei'];

/**
 * D387 (#11c): o mesmos.json e a resposta do juiz-mesmo: [{ novo, outro, resposta }], com as chaves de
 * achado que o apurar usa. Molde do conferirRefutados: o que nao tem a forma certa para, com a posicao.
 * `chavesExistentes` e o conjunto de chaves dos achados apurados (Set ou lista).
 */
function conferirMesmos(lista, chavesExistentes) {
  if (!Array.isArray(lista)) {
    throw new Error('mesmos.json nao e uma lista (veio ' + (lista === null ? 'null' : typeof lista) + '): a forma e ' +
      'uma lista de { novo, outro, resposta }, e [] quando o juiz nao achou par');
  }
  const existentes = chavesExistentes instanceof Set ? chavesExistentes : new Set(chavesExistentes || []);
  for (let i = 0; i < lista.length; i++) {
    const m = lista[i];
    const onde = 'entrada invalida no mesmos.json (posicao ' + (i + 1) + '): ';
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      throw new Error(onde + 'cada item e um objeto { "novo": "<chave>", "outro": "<chave>", "resposta": "sim" | "nao" | "nao-sei" }');
    }
    for (const campo of ['novo', 'outro']) {
      if (typeof m[campo] !== 'string' || m[campo].trim() === '') {
        throw new Error(onde + '"' + campo + '" tem de ser o texto da chave do achado, copiada de paresCandidatos');
      }
      if (!existentes.has(m[campo])) {
        throw new Error(onde + '"' + campo + '" (' + m[campo] + ') nao e a chave de nenhum achado apurado; copie a chave ' +
          'exatamente como veio em paresCandidatos');
      }
    }
    // D396 n. 41: a forma (a resposta) antes do sentido (a mesma chave), como os campos acima.
    if (RESPOSTAS_MESMO.indexOf(m.resposta) === -1) {
      throw new Error(onde + '"resposta" tem de ser "sim", "nao" ou "nao-sei" (veio ' + JSON.stringify(m.resposta) + ')');
    }
    // D391: um achado nao e par dele mesmo (paresCandidatos nunca o lista); sem isto saia o aviso
    // "provavel mesmo defeito que" a propria chave.
    if (m.novo === m.outro) {
      throw new Error(onde + '"novo" e "outro" sao a mesma chave (' + m.novo + '); copie o par exatamente como veio em ' +
        'paresCandidatos');
    }
  }
  return lista;
}

/**
 * rondas: lista de rondas; cada ronda e uma lista de vereditos.
 * Ronda seca = zero achado NOVO de P1 ou acima.
 * D244/defeito 3 - opcoes (opcional; sem ela a conta e a de antes):
 *   mapas[i]   = { A: 'trabalho'|'HEAD', B: ... } da ronda i (o mapa.json). Com ele, so P0/P1 do
 *                lado 'trabalho' molha; os do lado 'HEAD' saem em achadosDoLadoAntigo. A chave
 *                passa a ser pelo LADO: o rotulo A/B e sorteado a cada ronda.
 *   refutados  = [{ ronda, lente, arquivo, linha, severidade, prova }]: achado refutado na fonte
 *                primaria nao molha. Sem `prova` ou sem `severidade`, lanca erro.
 *   mesmos     = [{ novo, outro, resposta }] (D387, #11c): so ALIMENTA provaveisMesmos; nao entra em
 *                secas, encerrar, motivo, novos, abertos nem no teto. A palavra do juiz e aviso, nao prova.
 * paresCandidatos sai sempre: achado P0/P1 novo da ultima ronda x outro achado do lado novo, mesmo
 * arquivo (o lado, com mapa; o rotulo, sem), a ate DISTANCIA_PAR linhas, chave diferente.
 */
function apurar(rondas, opcoes) {
  // F2-14: sem nenhuma ronda nao ha o que apurar (antes saia "ronda 1 chama so as lentes..." sem ronda nenhuma).
  if (!Array.isArray(rondas) || rondas.length === 0) throw new Error('nenhuma ronda para apurar');
  const op = opcoes || {};
  const mapas = Array.isArray(op.mapas) ? op.mapas : [];
  const refutados = conferirRefutados(op.refutados);
  const vistos = new Set();
  const abertos = new Set();
  let secas = 0;
  let novosDaUltima = [];
  let novosChavesDaUltima = [];
  let antigosDaUltima = [];
  // D387: todo achado valido visto (chave -> o que o juiz le) e, a parte, os do lado novo em ordem.
  const metas = new Map();
  const doLadoNovo = [];
  const placar = { A: 0, B: 0, empate: 0 };

  rondas.forEach(function (ronda, indice) {
    const novos = [];
    const novosChaves = [];
    const antigos = [];
    const mapa = mapas[indice] && typeof mapas[indice] === 'object' ? mapas[indice] : null;
    // 0.3.3, item 1: ronda sem nenhum veredito nao e ronda seca - e voto que falta. Sem isto,
    // `apurar([[], []])` fechava aprovado. Diz qual ronda; o apurar-ronda.js confere a pasta antes.
    if (!Array.isArray(ronda) || ronda.length === 0) {
      throw new Error('ronda ' + (indice + 1) + ' sem nenhum veredito: ronda sem voto nao e ronda seca, e nao se apura; ' +
        'grave os vereditos da ronda ' + (indice + 1) + ' na pasta vereditos dela e rode de novo');
    }
    for (const vd of ronda) {
      // D230: o que nao e veredito nao e voto sem achado - seria ronda seca por falta de voto. O
      // apurar-ronda.js para antes de chegar aqui; quem chamar direto recebe o erro, com o motivo.
      const invalido = errosDoVeredito(vd);
      if (invalido.length) throw new Error('veredito que nao e veredito na ronda ' + (indice + 1) + ': ' + invalido.join('; '));
      const r = validarVeredito(vd);
      if (indice === rondas.length - 1 && vd && placar[vd.melhor] !== undefined) placar[vd.melhor] += 1;
      for (const a of r.achadosValidos) {
        const rotulo = rotuloDoArquivo(a.arquivo);
        const lado = mapa && rotulo ? mapa[rotulo] : null;
        const k = lado ? [a.severidade, lado, a.linha, vd.lente].join('|') : chaveAchado(a, vd.lente);
        if (vistos.has(k)) continue;
        vistos.add(k);
        const meta = { chave: k, ronda: indice + 1, lente: vd.lente, severidade: a.severidade, linha: a.linha,
          descricao: a.descricao };
        metas.set(k, meta);
        // Achado do lado HEAD tem linha do arquivo antigo: nao faz par. Sem lado e sem rotulo, nao ha como
        // dizer que dois achados sao do mesmo arquivo: tambem nao faz par.
        const grupo = lado || rotulo;
        if (lado !== 'HEAD' && grupo) doLadoNovo.push({ meta: meta, grupo: grupo });
        if (a.severidade !== 'P0' && a.severidade !== 'P1') continue;
        if (lado === 'HEAD') { antigos.push(a); continue; }
        if (refutado(refutados, indice + 1, vd.lente, a)) continue;
        abertos.add(k);
        novos.push(a);
        novosChaves.push(k);
      }
    }
    if (novos.length === 0) secas += 1; else secas = 0;
    if (indice === rondas.length - 1) { novosDaUltima = novos; novosChavesDaUltima = novosChaves; antigosDaUltima = antigos; }
  });

  // D387 (#11c): pares para o juiz. Nada aqui entra na contagem acima.
  // D396 n. 23: cada grupo em ordem de linha, e so os vizinhos a ate DISTANCIA_PAR linhas se comparam (antes,
  // todos com todos, sem teto). A saida segue na ordem de antes: a de doLadoNovo.
  const ehNovoDaUltima = new Set(novosChavesDaUltima);
  const porGrupo = new Map();
  doLadoNovo.forEach(function (x, i) {
    if (!porGrupo.has(x.grupo)) porGrupo.set(x.grupo, []);
    porGrupo.get(x.grupo).push({ y: x, j: i });
  });
  porGrupo.forEach(function (lista) {
    lista.sort(function (p, q) { return p.y.meta.linha - q.y.meta.linha || p.j - q.j; });
  });
  const paresCandidatos = [];
  doLadoNovo.forEach(function (x, i) {
    if (!ehNovoDaUltima.has(x.meta.chave)) return;
    const lista = porGrupo.get(x.grupo);
    let ini = 0;
    let fim = lista.length;
    while (ini < fim) {
      const meio = (ini + fim) >> 1;
      if (lista[meio].y.meta.linha < x.meta.linha - DISTANCIA_PAR) ini = meio + 1; else fim = meio;
    }
    const perto = [];
    for (let k = ini; k < lista.length && lista[k].y.meta.linha <= x.meta.linha + DISTANCIA_PAR; k++) perto.push(lista[k]);
    perto.sort(function (p, q) { return p.j - q.j; });
    perto.forEach(function (p) {
      const y = p.y;
      if (x.meta.chave === y.meta.chave) return;
      // Os dois novos da ultima ronda: o par sai uma vez so, na ordem em que apareceram.
      if (ehNovoDaUltima.has(y.meta.chave) && p.j < i) return;
      paresCandidatos.push({ novo: x.meta, outro: y.meta, distancia: Math.abs(x.meta.linha - y.meta.linha) });
    });
  });

  const provaveisMesmos = [];
  // D396 n. 24: null pela API e o mesmo que ausente (sem juiz); a CLI ja barra o mesmos.json com null.
  if (op.mesmos !== undefined && op.mesmos !== null) {
    const mesmos = conferirMesmos(op.mesmos, vistos);
    const vistosPares = new Set();
    for (const m of mesmos) {
      if (m.resposta !== 'sim') continue;
      for (const [chave, outra] of [[m.novo, m.outro], [m.outro, m.novo]]) {
        if (!ehNovoDaUltima.has(chave) || vistosPares.has(chave + '\u0000' + outra)) continue;
        vistosPares.add(chave + '\u0000' + outra);
        const o = metas.get(outra);
        provaveisMesmos.push({ chave: chave, mesmoQue: outra, lente: o.lente, ronda: o.ronda,
          texto: 'provavel mesmo defeito que ' + outra + ' (lente ' + o.lente + ', ronda ' + o.ronda + ')' });
      }
    }
  }

  const ronda = rondas.length;
  const extra = { achadosDoLadoAntigo: antigosDaUltima, refutados: refutados, paresCandidatos: paresCandidatos,
    provaveisMesmos: provaveisMesmos };

  if (secas >= 2) {
    return Object.assign({ ronda: ronda, secas: secas, encerrar: true,
      motivo: 'duas rondas secas seguidas: aprovado', novos: novosDaUltima, placar: placar }, extra);
  }
  if (ronda >= TETO) {
    return Object.assign({ ronda: ronda, secas: secas, encerrar: true,
      motivo: 'teto de ' + TETO + ' rondas com ' + abertos.size + ' achado(s) P0/P1: para aqui e leva ao dono com 3 opcoes; o que sobrar vira registro',
      novos: novosDaUltima, placar: placar }, extra);
  }
  return Object.assign({ ronda: ronda, secas: secas, encerrar: false,
    motivo: 'ronda ' + (ronda + 1) + ' chama so as lentes que acharam P0/P1',
    novos: novosDaUltima, placar: placar }, extra);
}

module.exports = { LENTES, LENTES_UI, FAMILIAS, familiasPara, SEVERIDADES, TETO, chaveAchado, errosDoVeredito,
  validarVeredito, apurar, conferirMesmos, DISTANCIA_PAR };
