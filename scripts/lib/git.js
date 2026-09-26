'use strict';
const { spawnSync } = require('node:child_process');

/**
 * Foto do git status na abertura da sessao (D17).
 * R3: spawnSync com shell:false. Nada de shell.
 * D49: devolve `null` quando NAO conseguiu fotografar (sem cwd, git ausente, fora
 * de repositorio, timeout) e `[]` quando a arvore esta limpa. Sem essa distincao a
 * guarda da D46 congelaria uma foto que falhou ate o fim da sessao, e a trava 5b
 * ficaria muda pelo resto do dia sem uma linha ao usuario.
 */
function correr(cwd, args) {
  let r;
  try {
    r = spawnSync('git', args, {
      cwd: cwd, encoding: 'utf8', shell: false, timeout: 5000, windowsHide: true
    });
  } catch (e) {
    return null;
  }
  if (!r || r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  return r.stdout;
}

/**
 * D41: o --porcelain devolve caminho relativo a RAIZ do repositorio, e o portao
 * compara com caminho relativo ao cwd. Sem descontar o prefixo, a trava 5b fica
 * muda sempre que o Claude abre numa subpasta do repositorio.
 * O prefixo vem do proprio git, ja em barra normal, vazio quando cwd e a raiz.
 */
function prefixo(cwd) {
  const bruto = correr(cwd, ['rev-parse', '--show-prefix']);
  if (bruto === null) return null;
  return bruto.replace(/\r?\n/g, '').replace(/\\/g, '/');
}

function modificados(cwd) {
  if (!cwd) return null;
  // D42: sem --untracked-files=all o git colapsa pasta inteiramente nao rastreada
  // numa entrada so ("sub/"), e a trava 5b nao protege nada dentro dela.
  const saida = correr(cwd, ['status', '--porcelain', '--untracked-files=all', '-z']);
  if (saida === null) return null;
  const pre = prefixo(cwd);
  if (pre === null) return null;

  // Caminho da raiz do repositorio -> caminho relativo ao cwd. Fora do cwd
  // o portao nunca alcanca (relativoAoProjeto devolve null), entao sai da lista.
  // D49: o nome sai como esta no disco. A dobra de caixa da D45 mora no ponto de
  // comparacao (portao-escopo.js), e nao aqui: esta lista tem outro consumidor -
  // a varredura do /esquadro:init - que mostra o nome do arquivo ao dono.
  function aoCwd(caminho) {
    if (pre === '') return caminho;
    return caminho.indexOf(pre) === 0 ? caminho.slice(pre.length) : null;
  }

  const partes = saida.split('\0').filter(function (p) { return p !== ''; });
  const arquivos = [];
  for (let i = 0; i < partes.length; i++) {
    const entrada = partes[i];
    if (entrada.length < 4) continue;
    const xy = entrada.slice(0, 2);
    const caminho = aoCwd(entrada.slice(3).replace(/\\/g, '/'));
    if (caminho) arquivos.push(caminho);
    // Renomeacao e copia trazem a origem no campo seguinte: os dois lados sao de outra frente.
    if (xy[0] === 'R' || xy[0] === 'C') {
      const origem = partes[++i];
      const origemRel = origem ? aoCwd(origem.replace(/\\/g, '/')) : null;
      if (origemRel) arquivos.push(origemRel);
    }
  }
  return arquivos;
}

// D118: `prefixo` passa a ser publico. O `preparar-revisao.js` (T12) precisa da mesma
// conversao "caminho relativo ao cwd -> caminho relativo a raiz do repositorio" que a
// D41 resolveu aqui: sem ela, `git show HEAD:<caminho>` rodado de uma subpasta nega
// arquivo que esta em HEAD. Exportar e aditivo - `modificados` nao muda.
/**
 * Os arquivos que o repositorio rastreia, relativos a RAIZ do repositorio.
 * `null` quando o git nao respondeu - e quem chama tem de tratar isso como
 * "nao sei", nunca como "nao ha nada".
 */
function rastreados(cwd) {
  if (!cwd) return null;
  const bruto = correr(cwd, ['ls-files']);
  if (bruto === null) return null;
  return bruto.split(/\r?\n/).filter(function (a) { return !!a; });
}

module.exports = { modificados, prefixo, rastreados };
