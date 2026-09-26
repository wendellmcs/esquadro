#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sanit = require('./lib/sanitacao.js');

/**
 * Monta a pasta que vai para o repositorio publico.
 *
 * POR QUE ISTO E SCRIPT E NAO PASSO MANUAL. Ja foi passo manual uma vez: em
 * 2026-09-02 o export saiu com 92 arquivos em vez de 95, e os que faltavam eram
 * o proprio detector de sanitacao e o teste dele. Quem pegou o erro foi o
 * CONTADOR DE TESTES da suite - 374 em vez de 389 -, nao a leitura da lista.
 * Montagem a mao erra em silencio, e este ato e o ultimo antes do irreversivel.
 *
 * A LISTA VEM DE UM LUGAR SO. `superficiePublicavel` e a mesma funcao que o
 * `sanitar.js` audita. Se o montador tivesse a lista dele, os dois poderiam
 * discordar - e discordariam calados, com o auditor dando limpo sobre um
 * conjunto e o montador copiando outro.
 *
 * O QUE ELE NAO FAZ, de proposito: nao commita, nao cria remoto, nao empurra.
 * Ele deixa a pasta pronta e com `git add` feito, para que a auditoria rode
 * ANTES do primeiro commit - que e a unica hora em que ela ainda evita alguma
 * coisa. Commit, identidade e push sao o ato irreversivel, e tem dono proprio.
 */

function argumento(argv, nome) {
  const i = argv.indexOf(nome);
  return (i !== -1 && argv[i + 1]) ? argv[i + 1] : null;
}

function vazia(dir) {
  try { return fs.readdirSync(dir).length === 0; } catch (e) { return true; }
}

/**
 * Teto de tempo e retorno conferido, como os irmaos em `lib/git.js` e
 * `lib/sanitacao.js`. Sem os dois, um git travado pendurava o script, e um que
 * falhava deixava a saida dizer "feitos" com saida 0 (ronda 1 do Passo 8b).
 * Devolve null quando deu certo, ou a frase do que falhou.
 */
function git(dir, args) {
  let r;
  try {
    r = spawnSync('git', args, {
      cwd: dir, encoding: 'utf8', shell: false, timeout: 20000, windowsHide: true
    });
  } catch (e) {
    return 'git ' + args[0] + ': ' + ((e && e.message) || e);
  }
  if (r.error) {
    const porque = r.error.code === 'ETIMEDOUT' ? 'passou de 20 s sem responder' : r.error.message;
    return 'git ' + args[0] + ': ' + porque;
  }
  if (r.status !== 0) {
    const primeira = String(r.stderr || '').trim().split(/\r?\n/)[0];
    return 'git ' + args[0] + ' saiu ' + r.status + ': ' + primeira;
  }
  return null;
}

function montar(raiz, destino) {
  const arquivos = sanit.superficiePublicavel(raiz);
  if (arquivos === null) return { erro: 'o git nao respondeu na origem' };

  fs.mkdirSync(destino, { recursive: true });
  const copiados = [];
  const faltaram = [];
  arquivos.forEach(function (rel) {
    const de = path.join(raiz, rel);
    const para = path.join(destino, rel);
    try {
      fs.mkdirSync(path.dirname(para), { recursive: true });
      fs.copyFileSync(de, para);
      copiados.push(rel);
    } catch (e) {
      // Arquivo apagado no disco mas ainda no indice cai aqui. Some da lista
      // silenciosamente seria o erro de 2026-09-02 outra vez, de outro jeito.
      faltaram.push(rel + ' (' + (e && e.code) + ')');
    }
  });

  // o add so roda se o init deu certo; o primeiro que falhar e o que se conta
  const falhaGit = git(destino, ['init', '-q']) || git(destino, ['add', '-A']);
  return { copiados: copiados, faltaram: faltaram, previstos: arquivos.length, falhaGit: falhaGit };
}

function main() {
  const argv = process.argv.slice(2);
  const raizPedida = argumento(argv, '--raiz') || '.';
  const raiz = path.resolve(raizPedida);
  const destinoPedido = argumento(argv, '--destino');
  const gravar = argv.indexOf('--gravar') !== -1;

  if (!destinoPedido) {
    console.error('uso: node scripts/exportar.js --destino <pasta> [--raiz <pasta>] [--gravar]');
    console.error('Sem --gravar ele so mostra o que copiaria. Nada e escrito.');
    process.exit(2);
  }
  const destino = path.resolve(destinoPedido);

  const arquivos = sanit.superficiePublicavel(raiz);
  if (arquivos === null) {
    console.error('NAO DEU PARA MEDIR: o git nao respondeu em ' + raizPedida + '.');
    process.exit(2);
  }

  console.log('Origem: ' + raizPedida + '   Destino: ' + destinoPedido);
  console.log('Fora da superficie: ' + sanit.FORA_DO_PUBLICO.join(', ') +
              ', mais tudo que o .gitignore cobre.');
  console.log(arquivos.length + ' arquivos entram no export.');
  console.log('');

  if (!gravar) {
    arquivos.forEach(function (a) { console.log('  ' + a); });
    console.log('');
    console.log('PROPOSTA - nada foi escrito. Repita com --gravar para montar.');
    process.exit(0);
  }

  if (!vazia(destino)) {
    console.error('O destino nao esta vazio: ' + destinoPedido);
    console.error('Montar por cima misturaria export novo com sobra do anterior,');
    console.error('e a sobra nao aparece em lista nenhuma. Apague ou escolha outro.');
    process.exit(2);
  }

  const r = montar(raiz, destino);
  if (r.erro) { console.error('NAO DEU PARA MONTAR: ' + r.erro); process.exit(2); }

  console.log('Copiados: ' + r.copiados.length + ' de ' + r.previstos);
  if (r.faltaram.length > 0) {
    console.error('NAO COPIADOS (' + r.faltaram.length + '):');
    r.faltaram.forEach(function (a) { console.error('  ' + a); });
    console.error('Export incompleto nao vai a lugar nenhum.');
    process.exit(1);
  }
  if (r.falhaGit) {
    console.error('O INDICE NAO FICOU PRONTO: ' + r.falhaGit);
    console.error('Os arquivos foram copiados, mas sem o `git add` o commit seguinte');
    console.error('sairia incompleto. Apague o destino e rode de novo.');
    process.exit(1);
  }
  console.log('`git init` e `git add` feitos. NENHUM commit - isso e o ato irreversivel.');
  console.log('');
  console.log('Confira ANTES de commitar:');
  console.log('  node "' + path.join(destinoPedido, 'scripts', 'sanitar.js') + '" --raiz "' + destinoPedido + '"');
  console.log('  cd "' + destinoPedido + '" && npm test');
  process.exit(0);
}

main();
