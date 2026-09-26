'use strict';
const regraLib = require('./regra.js');

const RE_SLOT = /\{\{(campo|texto):([A-Za-z][A-Za-z0-9_.]*)\}\}/g;
const MARCA = 'POR PREENCHER';

function slots(texto) {
  const achados = [];
  const re = new RegExp(RE_SLOT.source, 'g');
  let m;
  while ((m = re.exec(String(texto == null ? '' : texto))) !== null) {
    achados.push({ bruto: m[0], tipo: m[1], nome: m[2] });
  }
  return achados;
}

function existeCampo(projeto, nome) {
  let atual = projeto;
  for (const parte of String(nome).split('.')) {
    if (!atual || typeof atual !== 'object' || !(parte in atual)) return false;
    atual = atual[parte];
  }
  return true;
}

/**
 * D10: fatia de campo NUNCA imprime o valor. Imprime o caminho de onde le-lo.
 * Comando, versao e flag mudam; nome de campo nao.
 */
function preencher(moldeTexto, valores, projeto) {
  const v = valores || {};
  return String(moldeTexto == null ? '' : moldeTexto).replace(
    new RegExp(RE_SLOT.source, 'g'),
    function (bruto, tipo, nome) {
      if (tipo === 'campo') {
        if (!existeCampo(projeto, nome)) return '(' + MARCA + ': campo ' + nome + ' nao existe em projeto.json)';
        return '`' + nome + '` de `.claude/esquadro/projeto.json` (leia de la, nao decore)';
      }
      const resposta = v[nome];
      if (typeof resposta !== 'string' || resposta.trim() === '') {
        return '(' + MARCA + ': ' + nome + ')';
      }
      return resposta.trim();
    }
  );
}

function validar(resultado) {
  const texto = String(resultado == null ? '' : resultado);
  const erros = [];

  const restantes = slots(texto);
  for (const s of restantes) erros.push('fatia nao substituida: ' + s.bruto);

  const re = new RegExp('\\(' + MARCA + ':([^)]*)\\)', 'g');
  let m;
  while ((m = re.exec(texto)) !== null) erros.push('fatia por preencher:' + m[1]);

  // D10: nenhum fato volatil no que veio da entrevista.
  for (const linha of texto.split(/\r?\n/)) {
    for (const vol of regraLib.VOLATEIS) {
      if (vol.re.test(linha)) {
        erros.push('fato volatil (' + vol.tipo + ') na linha: ' + linha.trim().slice(0, 70));
        break;
      }
    }
  }

  return { ok: erros.length === 0, erros: erros };
}

module.exports = { RE_SLOT, MARCA, slots, preencher, validar };
