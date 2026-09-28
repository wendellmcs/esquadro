'use strict';
const glob = require('./glob.js');

const EXTENSOES_ESTILO = ['.css', '.scss', '.sass', '.less', '.styl'];

function ehArquivoDeEstilo(caminho, projeto) {
  const c = glob.normalizar(caminho).toLowerCase();
  if (EXTENSOES_ESTILO.some(function (e) { return c.endsWith(e); })) return true;
  const extras = projeto && projeto.design && projeto.design.caminhosDeEstilo;
  return glob.casaAlgum(extras, caminho);
}

const RE_COR = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
// As unidades que o portao le. O `%` e as outras (pt, vw, ch...) ficam de fora de
// proposito: bloquear `%` acusaria todo `width:100%`. O README e o CHANGELOG dizem
// isso com estas mesmas unidades, e um teste confere (ronda 2 do Passo 8b).
const UNIDADES = ['px', 'rem', 'em'];
// O sinal e parte do valor: -8px nao e 8px. So conta como sinal o hifen que nao
// vem colado a letra, digito ou ponto - em `.mt-8px` ele e parte do nome.
// D244 (P2 da D238 secao 6): `.04em` sem zero a esquerda. O `\b` antes do digito separava o
// ponto, e a medida lida era `04em`. A segunda alternativa le o ponto quando ele nao vem
// colado a letra, digito ou outro ponto (em `a.5em` ou `1.2.5em` nao e medida inteira).
const RE_MEDIDA = new RegExp('(?:(?<![\\w.-])-)?(?:\\b\\d+(?:\\.\\d+)?|(?<![\\w.])\\.\\d+)(?:' +
  UNIDADES.join('|') + ')\\b', 'g');

function normalizarValor(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, '');
}

function extrairTokens(css) {
  const t = { cores: [], raios: [], espacos: [], sombras: [] };
  const linhas = String(css == null ? '' : css).split(/\r?\n/);
  for (const linha of linhas) {
    const m = linha.match(/--([\w-]+)\s*:\s*([^;]+);/g) || [];
    for (const decl of m) {
      const p = decl.match(/--([\w-]+)\s*:\s*([^;]+);/);
      if (!p) continue;
      const nome = p[1].toLowerCase();
      const valor = normalizarValor(p[2]);
      if (RE_COR.test(valor)) { RE_COR.lastIndex = 0; t.cores.push(valor); continue; }
      RE_COR.lastIndex = 0;
      if (/raio|radius/.test(nome)) t.raios.push(valor);
      else if (/sombra|shadow/.test(nome)) t.sombras.push(valor);
      else if (/espac|space|gap|pad|margin/.test(nome)) t.espacos.push(valor);
    }
  }
  return t;
}

function semVar(linha) {
  return linha.replace(/var\([^)]*\)/g, ' ');
}

function valoresCrus(texto) {
  const achados = [];
  String(texto == null ? '' : texto).split(/\r?\n/).forEach(function (linha, i) {
    if (/^\s*(\/\/|\/\*|\*)/.test(linha)) return;      // comentario nao e estilo
    if (/--[\w-]+\s*:/.test(linha)) return;            // a propria definicao do token
    const limpa = semVar(linha);
    for (const v of (limpa.match(RE_COR) || [])) achados.push({ valor: normalizarValor(v), tipo: 'cor', linha: i + 1 });
    for (const v of (limpa.match(RE_MEDIDA) || [])) achados.push({ valor: normalizarValor(v), tipo: 'medida', linha: i + 1 });
  });
  return achados;
}

// A entrevista do /esquadro:init coleta anti-referencia em PORTUGUES ("gradiente"), e
// CSS se escreve em INGLES ("linear-gradient"). O cognato so difere pela vogal final,
// entao a busca cai para o radical. ALCANCE MEDIDO: 2 de 7 casos reais de CSS - so o par
// gradiente/gradient. Termo sem cognato ("sombra" x "box-shadow") continua passando:
// limite declarado por teste, nao escondido. D124.
function radical(anti) {
  const a = String(anti).toLowerCase().split(' ')[0];
  return (a.length > 4 && /e$/.test(a)) ? a.slice(0, -1) : a;
}

function conferir(texto, sistema) {
  if (!sistema) return { ok: true, fora: [] };
  const permitidos = new Set(
    [].concat(sistema.cores || [], sistema.raios || [], sistema.espacos || [], sistema.sombras || [])
      .map(normalizarValor)
  );
  const fora = [];

  for (const a of valoresCrus(texto)) {
    if (!permitidos.has(a.valor)) fora.push(a);
  }
  // Anti-referencia: dizer o que a coisa NAO pode parecer e verificavel;
  // dizer o que ela deve parecer, nao e.
  String(texto == null ? '' : texto).split(/\r?\n/).forEach(function (linha, i) {
    for (const anti of (sistema.antiReferencias || [])) {
      const alvo = radical(anti);
      if (linha.toLowerCase().indexOf(alvo) !== -1) {
        fora.push({ valor: anti, tipo: 'anti-referencia', linha: i + 1 });
      }
    }
  });

  return { ok: fora.length === 0, fora: fora };
}

function motivo(alvo, fora, sistema) {
  const linhas = [
    'esquadro - fora do design system.',
    '',
    'Em ' + alvo + ', estes valores nao estao no sistema declarado:'
  ];
  for (const f of fora.slice(0, 12)) {
    linhas.push('  linha ' + f.linha + ': ' + f.valor + ' (' + f.tipo + ')');
  }
  if (fora.length > 12) linhas.push('  ... e mais ' + (fora.length - 12));
  linhas.push('');
  linhas.push('O que existe no sistema:');
  linhas.push('  cores:   ' + (sistema.cores || []).slice(0, 10).join(' '));
  linhas.push('  raios:   ' + (sistema.raios || []).join(' '));
  linhas.push('  espacos: ' + (sistema.espacos || []).join(' '));
  linhas.push('');
  linhas.push('Use o token, ou use var(--nome). Se o valor novo e mesmo necessario,');
  linhas.push('acrescenta-lo ao sistema e decisao do dono, nao julgamento seu:');
  linhas.push('leve com 3 opcoes e a recomendada marcada.');
  linhas.push('');
  linhas.push('Nunca subir a catraca para o portao passar. Remover o valor cru e a saida.');
  return linhas.join('\n');
}

module.exports = { EXTENSOES_ESTILO, UNIDADES, ehArquivoDeEstilo, extrairTokens, valoresCrus, conferir, motivo };
