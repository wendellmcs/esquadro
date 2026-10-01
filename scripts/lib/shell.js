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

/**
 * Tira o que esta entre aspas: /tmp dentro de string literal nao e comando.
 * D244/achado 13: o corpo de here-string do PowerShell (`@'` ou `@"` no fim da linha, fechado
 * por `'@`/`"@` no comeco de outra) tambem e texto - sai ANTES das aspas, porque o corpo costuma
 * ter aspas desbalanceadas.
 * 0.3.4/item 2: com `idioma` ('bash' ou 'powershell') as aspas seguem o idioma e a que abre
 * primeiro manda: aspa simples nao tem escape nos dois, e a dupla escapa com barra no bash e com
 * crase no PowerShell. Sem `idioma` (o `conferir`) fica como era.
 * T4 r2: o comentario entra na mesma varredura, porque o que vem primeiro manda: o apostrofo de
 * `# it's` nao abre literal, e o `<#` dentro de uma string nao abre comentario de bloco.
 */
const LITERAIS = {
  bash: /\\[\s\S]|"(?:[^"\\]|\\[\s\S])*"|'[^']*'|(?<=^|[\s;&|(])#[^\n]*/g,
  powershell: /<#[\s\S]*?#>|`[\s\S]|"(?:[^"`]|`[\s\S])*"|'[^']*'|(?<=^|[\s;&|(])#[^\n]*/g
};

function semLiterais(comando, idioma) {
  const base = String(comando == null ? '' : comando)
    .replace(/@'[ \t]*\r?\n[\s\S]*?\r?\n'@/g, ' ')
    .replace(/@"[ \t]*\r?\n[\s\S]*?\r?\n"@/g, ' ');
  if (LITERAIS[idioma]) return base.replace(LITERAIS[idioma], ' ');
  return base
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ');
}

function compilar(regra) {
  try { return new RegExp(regra.padrao); } catch (e) { return null; }
}

/**
 * F16: a tabela e carregada pela plataforma declarada em projeto.json,
 * nao inferida a cada comando.
 * D244/defeito 4: e pela FERRAMENTA (`tool_name` do hook). No Windows a ferramenta Bash do
 * harness e Git Bash, onde `&&`, `head` e `/tmp` existem: a tabela, que descreve o PowerShell,
 * nao vale para ela. Sem ferramenta (chamada antiga), vale a plataforma, como antes.
 */
function conferir(comando, plataforma, ferramenta) {
  const p = plataforma || {};
  if (p.so !== TABELA.quando.so) return [];
  if (ferramenta === 'Bash') return [];

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

// ---------------------------------------------------------------------------
// 0.3.4/item 2 (D286): o `cd` solto.
//
// A pasta atual PERSISTE entre uma chamada e outra das ferramentas Bash e PowerShell, em
// qualquer SO. A raiz dos portoes nao muda com o `cd` (config.js), mas o comando seguinte cai na
// pasta errada: um `git` sem caminho age no outro repositorio. Por isso esta funcao NAO e a
// tabela do win32 (que e de idioma): vale em qualquer plataforma e em qualquer das duas
// ferramentas. "Solto" = no nivel de cima do comando, depois de tirar o que e texto.
//
// Bash: `( ... )`, `$( ... )` e crase sao subshell, e a pasta volta; `{ ...; }`, `if`, `then`
//   e `do` NAO isolam. O corpo de um heredoc e texto (o semLiterais so conhece o here-string do
//   PowerShell), e o comentario tambem.
// PowerShell: NADA isola - nem `& { }`, nem `( )` (medido no 5.1). So o par Push-Location com
//   Pop-Location no mesmo comando devolve a pasta.
// ---------------------------------------------------------------------------

/** Verdadeiro se, no fim de `texto`, nao ha aspas abertas (estado simples, com barra de escape). */
function foraDeAspas(texto) {
  let estado = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (estado === "'") { if (c === "'") estado = ''; continue; }
    if (c === '\\') { i++; continue; }
    if (estado === '"') { if (c === '"') estado = ''; continue; }
    if (c === '"' || c === "'") estado = c;
  }
  return estado === '';
}

/** As palavras-marcador de heredoc (`<<EOF`, `<<-'EOF'`) que a linha abre, fora de aspas. */
function marcadoresDeHeredoc(linha) {
  const re = /(^|[^<])<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g;
  const achados = [];
  let m;
  while ((m = re.exec(linha)) !== null) {
    if (foraDeAspas(linha.slice(0, m.index + m[1].length))) achados.push(m[3]);
  }
  return achados;
}

/** Tira o corpo dos heredocs do bash; a linha que abre o heredoc fica, o resto dela tambem. */
function semHeredoc(comando) {
  if (comando.indexOf('<<') === -1) return comando;
  const saida = [];
  let fila = [];
  for (const linha of comando.split('\n')) {
    if (fila.length) {
      const nua = linha.replace(/\r$/, '');
      if (nua === fila[0] || nua.replace(/^\t+/, '') === fila[0]) fila.shift();
      continue;
    }
    saida.push(linha);
    fila = marcadoresDeHeredoc(linha);
  }
  return saida.join('\n');
}

/** Apaga o que esta dentro de `( )` e de crases: e subshell, a pasta volta sozinha. */
function soNoNivelDeCima(texto) {
  let prof = 0;
  let crase = false;
  let saida = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '\\') { saida += '  '; i++; continue; }
    if (c === '`') { crase = !crase; saida += ' '; continue; }
    if (c === '(') { prof++; saida += ' '; continue; }
    if (c === ')') { if (prof > 0) prof--; saida += ' '; continue; }
    saida += (prof > 0 || crase) ? ' ' : c;
  }
  return saida;
}

function semComentarios(texto) {
  return texto.replace(/(^|[\s;&|(])#[^\n]*/g, '$1');
}

// cd/pushd como COMANDO: no comeco, depois de ; & | ou quebra de linha, dentro de `{ ` ou depois
// de then/do/else. Como argumento (`echo cd`), sufixo (`abcd`) ou opcao (`--cd`) nao casa.
const CD_BASH = /(?:^|[;&|\n]|\{(?=\s)|\b(?:then|do|else|elif|if|while|until)\b)\s*(cd|pushd)(?=[\s;&|]|$)/;
// Eventos de pasta do PowerShell, em posicao de comando (`cd\` tambem e comando no 5.1).
const EVENTO_PS = /(?:^|[;&|\n{(])\s*(cd|chdir|sl|set-location|push-location|pushd|pop-location|popd)(?=[\s;&|)}]|\.\.|\\|$)/gi;

function idiomaDoCd(ferramenta, plataforma) {
  if (ferramenta === 'PowerShell') return 'powershell';
  if (ferramenta === 'Bash') return 'bash';
  // chamada sem ferramenta: a plataforma declarada escolhe; sem ela, o Bash (o caso comum)
  return (plataforma && plataforma.shell === 'powershell') ? 'powershell' : 'bash';
}

/**
 * Acha o `cd` solto. Devolve `{ forma: 'bash'|'powershell', achado }` (achado = a palavra, como
 * foi escrita) ou `null`. Nao depende de plataforma: `plataforma` so escolhe o idioma quando a
 * ferramenta nao veio.
 */
function cdSolto(comando, ferramenta, plataforma) {
  const bruto = String(comando == null ? '' : comando);
  const forma = idiomaDoCd(ferramenta, plataforma);

  if (forma === 'powershell') {
    // o comentario de bloco sai dentro do semLiterais (T4 r2), na ordem do texto
    const limpo = semComentarios(semLiterais(bruto, 'powershell'));
    // T4 r2: simula a pilha do Push/Pop na ordem do texto. Pop com a pilha vazia nao faz nada
    // (medido no 5.1); cd com a pilha vazia esta solto; Push que sobra na pilha esta solto.
    const re = new RegExp(EVENTO_PS.source, 'gi');
    const pilha = [];
    let m;
    while ((m = re.exec(limpo)) !== null) {
      const palavra = m[1].toLowerCase();
      if (palavra === 'push-location' || palavra === 'pushd') pilha.push(m[1]);
      else if (palavra === 'pop-location' || palavra === 'popd') { if (pilha.length) pilha.pop(); }
      else if (!pilha.length) return { forma: 'powershell', achado: m[1] };
    }
    return pilha.length ? { forma: 'powershell', achado: pilha[0] } : null;
  }

  const linhas = bruto.replace(/\\\r?\n/g, ' ');
  const topo = soNoNivelDeCima(semComentarios(semLiterais(semHeredoc(linhas), 'bash')));
  const m = CD_BASH.exec(topo);
  return m ? { forma: 'bash', achado: m[1] } : null;
}

/** A mensagem da negacao: o que aconteceu, o porque, e a forma certa para a ferramenta. */
function motivoCdSolto(comando, achado) {
  const ps = !!achado && achado.forma === 'powershell';
  const linhas = [
    'esquadro - cd solto: a pasta atual persiste entre as chamadas desta ferramenta.',
    '',
    'Comando: ' + String(comando).slice(0, 300),
    '',
    'O que o ' + (achado ? achado.achado : 'cd') + ' muda fica valendo no comando seguinte, e um git ou npm',
    'sem caminho passa a agir em outra pasta.'
  ];
  if (ps) {
    linhas.push('Use no lugar, e a pasta volta mesmo se o comando falhar:');
    linhas.push("  Push-Location -LiteralPath '<pasta>' -ErrorAction Stop; try { <comando> } finally { Pop-Location }");
    linhas.push('O bloco & { Set-Location X } NAO isola a pasta (medido no PowerShell 5.1).');
    linhas.push('Sem o -ErrorAction Stop, uma pasta errada deixa o comando rodar na pasta de antes e o');
    linhas.push('Pop-Location desempilha a pasta errada (medido).');
    linhas.push('Ou nao mude de pasta:');
    linhas.push("  git -C '<pasta>' <comando do git>");
    linhas.push("  npm --prefix '<pasta>' <comando do npm>");
  } else {
    linhas.push('Use no lugar, em subshell (a pasta volta sozinha):');
    linhas.push('  ( cd "<pasta>" && <comando> )');
    linhas.push('Ou nao mude de pasta:');
    linhas.push('  git -C "<pasta>" <comando do git>');
    linhas.push('  npm --prefix "<pasta>" <comando do npm>');
  }
  linhas.push('');
  linhas.push('Escape declarado pelo dono: comandosLiberados em .claude/esquadro/projeto.json.');
  return linhas.join('\n');
}

module.exports = { TABELA, semLiterais, conferir, motivo, cdSolto, motivoCdSolto };
