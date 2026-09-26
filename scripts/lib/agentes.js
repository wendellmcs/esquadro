'use strict';
const fs = require('node:fs');
const path = require('node:path');
const texto = require('./texto.js');

const PASTA = ['.claude', 'agents'];
const CERCA = /^---\s*$/;

/**
 * Le o frontmatter de um agente. NAO e um parser de YAML e nao pretende ser:
 * le `chave: valor` de primeiro nivel, que e a unica forma que este plugin
 * escreve e a unica que o gatilho 3 precisa ler. Lista, bloco e aninhamento
 * viram valor cru, e quem chama decide o que fazer com isso.
 *
 * Tres entradas que existem de verdade e que um parser ingenuo erra: BOM no
 * inicio (arquivo gravado no Windows), CRLF, e `model:` vazio.
 *
 * `model:` AUSENTE e `model:` VAZIO nao sao a mesma coisa para quem le, mas sao
 * a mesma RESPOSTA - nao declarado - e nenhuma das duas e divergencia. Quem
 * trata disso e o gatilho 3; aqui so nao se inventa valor (foco de revisao 4).
 *
 * Cerca que abre e nunca fecha devolve `ok: false` e campos VAZIOS: metade de
 * um frontmatter lido como se fosse inteiro e pior do que nao ter lido nada.
 */
function frontmatter(bruto) {
  const linhas = texto.semBom(String(bruto == null ? '' : bruto)).split(/\r?\n/);
  if (linhas.length === 0 || !CERCA.test(linhas[0])) return { ok: false, campos: {} };
  const campos = {};
  for (let i = 1; i < linhas.length; i++) {
    if (CERCA.test(linhas[i])) return { ok: true, campos: campos };
    const m = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(linhas[i]);
    if (!m) continue;
    const valor = m[2].trim().replace(/^['"]/, '').replace(/['"]$/, '').trim();
    campos[m[1]] = valor === '' ? null : valor;
  }
  return { ok: false, campos: {} };
}

/** path.join sempre, nunca concatenacao: a raiz tem espaco e acento nesta maquina. */
function caminho(raiz, nome) {
  return path.join(String(raiz), PASTA[0], PASTA[1], String(nome) + '.md');
}

/**
 * Todos os agentes do projeto, com o `model:` que cada um declara.
 *
 * `existe` separa duas respostas que um array vazio confunde: "este projeto nao
 * tem agentes" e "nao consegui olhar". O gatilho 3 precisa das duas separadas
 * para declarar "nao verificavel aqui" em vez de passar verde (foco 1).
 */
function listar(raiz) {
  const dir = path.join(String(raiz), PASTA[0], PASTA[1]);
  let arquivos;
  try {
    arquivos = fs.readdirSync(dir, { withFileTypes: true })
      .filter(function (e) { return e.isFile() && e.name.endsWith('.md'); })
      .map(function (e) { return e.name; });
  } catch (e) {
    return { existe: false, agentes: [] };
  }
  arquivos.sort();
  const lista = arquivos.map(function (arquivo) {
    let bruto = '';
    try { bruto = fs.readFileSync(path.join(dir, arquivo), 'utf8'); } catch (e) { bruto = ''; }
    const f = frontmatter(bruto);
    return {
      arquivo: arquivo,
      nome: f.campos.name || arquivo.replace(/\.md$/, ''),
      model: f.campos.model === undefined ? null : f.campos.model,
      temFrontmatter: f.ok
    };
  });
  return { existe: true, agentes: lista };
}

module.exports = { PASTA, CERCA, frontmatter, caminho, listar };
