'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TABELA = (function () {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'modelos', 'shell-win32.json'), 'utf8'));
  } catch (e) {
    return { quando: {}, regras: [], regrasPowerShell51: [] };
  }
})();

/** Tira o que esta entre aspas: /tmp dentro de string literal nao e comando. */
function semLiterais(comando) {
  return String(comando == null ? '' : comando)
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ');
}

function compilar(regra) {
  try { return new RegExp(regra.padrao); } catch (e) { return null; }
}

/**
 * F16: a tabela e carregada pela plataforma declarada em projeto.json,
 * nao inferida a cada comando.
 */
function conferir(comando, plataforma) {
  const p = plataforma || {};
  if (p.so !== TABELA.quando.so) return [];

  const limpo = semLiterais(comando);
  const problemas = [];
  const regras = TABELA.regras.concat(p.shell === 'powershell' ? TABELA.regrasPowerShell51 : []);

  for (const regra of regras) {
    const re = compilar(regra);
    if (re && re.test(limpo)) {
      problemas.push({ achado: regra.achado, sugestao: regra.sugestao, motivo: regra.motivo });
    }
  }
  return problemas;
}

function motivo(comando, problemas, tentativa) {
  const linhas = [
    'esquadro - idioma de shell errado para esta plataforma.',
    '',
    'Comando: ' + String(comando).slice(0, 300),
    '',
    'Achado                 Use no lugar'
  ];
  for (const p of problemas) {
    linhas.push('  ' + p.achado.padEnd(20) + ' ' + p.sugestao);
    linhas.push('      por que: ' + p.motivo);
  }
  linhas.push('');
  if (tentativa >= 2) {
    // O agravante da F16: o reflexo e tentar outra variacao do MESMO idioma.
    linhas.push('TROQUE DE IDIOMA, NAO DE VARIACAO.');
    linhas.push('Esta e a tentativa ' + tentativa + ' com sintaxe da plataforma errada.');
    linhas.push('Nao tente outra forma de bash. Escreva o comando em PowerShell,');
    linhas.push('ou use uma ferramenta multiplataforma (Node, o proprio harness).');
  } else {
    linhas.push('A plataforma deste projeto esta em .claude/esquadro/projeto.json,');
    linhas.push('campo plataforma. Leia de la; nao infira a cada comando.');
  }
  return linhas.join('\n');
}

module.exports = { TABELA, semLiterais, conferir, motivo };
