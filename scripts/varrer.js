#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const varredura = require('./lib/varredura.js');

const cwd = process.argv[2] || process.cwd();
const r = varredura.listar(cwd);
const inferido = varredura.inferir(r.arquivos, cwd, r);

// D98 rodada 2: a frase anterior era estatica e afirmava ter lido o package.json ate
// num repositorio que nao tem package.json nenhum. Trocar uma frase falsa por outra
// falsa nao e conserto.
// D98 rodada 3: e `existsSync` responde `true` para um DIRETORIO chamado package.json,
// caso em que o `lerJson` falha com EISDIR e nada e lido - a frase voltava a mentir.
// A frase promete LEITURA; entao quem responde por ela tem de ser a leitura.
function leuOPackage(base) {
  try { fs.readFileSync(path.join(base, 'package.json'), 'utf8'); return true; }
  catch (e) { return false; }
}
const leuPackage = leuOPackage(cwd);

const saida = {
  teto: {
    arquivosLidos: r.arquivos.length,
    limite: r.limite,
    truncado: r.truncado,
    profundidadeMaxima: varredura.PROFUNDIDADE,
    profundidadeCortada: r.profundidadeCortada,
    pastasIgnoradas: r.ignoradas,
    diretoriosIlegiveis: r.ilegiveis,
    incompleta: r.incompleta,
    tokensEstimados: 0,
    // D98: a frase anterior dizia "nenhum conteudo de arquivo entrou" enquanto o
    // `lerJson` lia o package.json. Era falsa, e falsa e a familia de defeito que
    // este projeto existe para barrar.
    observacao: leuPackage
      ? 'so a lista de caminhos foi varrida; o unico conteudo de arquivo lido foi o package.json, para achar o script de teste'
      : 'so a lista de caminhos foi varrida; nenhum conteudo de arquivo foi lido'
  },
  ambiente: require('./lib/ambiente.js').detectar(cwd),
  instrucoes: require('./lib/instrucoes.js').contar(cwd, require('./lib/config.js').carregarProjeto(cwd) || {}),
  inferido: inferido
};

// D98: estima o que ESTE comando imprime. Antes media `r.arquivos.join`, uma lista
// que a saida nunca contem - o numero era 14x maior que o texto real.
saida.teto.tokensEstimados = Math.ceil(JSON.stringify(saida, null, 2).length / 4);
process.stdout.write(JSON.stringify(saida, null, 2) + '\n');
