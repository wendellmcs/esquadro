'use strict';
const glob = require('./glob.js');
const caminhoLib = require('./caminho.js');

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

// ---------------------------------------------------------------------------
// T11-1 (R-T20-09): o arquivo de estilo escrito por COMANDO DE SHELL tambem passa pelo design.
// O `portao-escopo` so ve Write|Edit, e `cat > a.css <<EOF` escapava sem passar por ele. O conteudo que
// um comando escreve nao se le (vem de heredoc, de cano, de outro arquivo), entao o portao nao confere
// valores: nega a ESCRITA de estilo por shell e manda usar Write ou Edit, que ele confere.
//
// E heuristica sobre o texto do comando, nao um interpretador de shell: le palavras, aspas, redirecao,
// heredoc e separadores, e reconhece os escritores comuns pelo nome. Nao ve o que o comando faz por
// dentro (script chamado por arquivo, caminho em variavel, `xargs`, `find -exec`, outro programa).
// ---------------------------------------------------------------------------

const ESPACO = /[ \t\r]/;
// o que termina uma palavra solta: espaco, quebra de linha, separador de comando e operador de redirecao
const FIM_DE_PALAVRA = ' \t\r\n;|&()<>';
// palavras que vem antes do comando de verdade
const PREFIXOS = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', 'sudo',
  'command', 'exec', 'nohup', 'builtin', 'nice']);
const PROFUNDIDADE_MAXIMA = 3;

/**
 * Le o comando em comandos simples: { palavras: [{t, q}], redir: [alvos de >], docs: [corpos de heredoc] }.
 * `q` = a palavra tinha aspas. Aspas, escape e here-string seguem o idioma (`ps`): a aspa simples do bash
 * nao tem escape e a do PowerShell escapa a si mesma dobrada; a barra escapa no bash e a crase no PowerShell.
 */
function lerShell(comando, ps) {
  const s = String(comando);
  const n = s.length;
  const comandos = [];
  const pendentes = []; // heredocs abertos: o corpo vem depois da proxima quebra de linha
  let atual = { palavras: [], redir: [], docs: [] };
  const fecharComando = function () {
    if (atual.palavras.length || atual.redir.length) comandos.push(atual);
    atual = { palavras: [], redir: [], docs: [] };
  };

  // Le uma palavra a partir de `i`. Devolve { t, q, achou, fim }.
  function palavra(i) {
    let t = '';
    let q = false;
    let achou = false;
    while (i < n && FIM_DE_PALAVRA.indexOf(s[i]) === -1) {
      const c = s[i];
      achou = true;
      if (c === "'") {
        q = true;
        i++;
        if (ps) {
          while (i < n) {
            if (s[i] === "'") {
              if (s[i + 1] === "'") { t += "'"; i += 2; continue; }
              i++;
              break;
            }
            t += s[i++];
          }
        } else {
          const j = s.indexOf("'", i);
          t += s.slice(i, j < 0 ? n : j);
          i = j < 0 ? n : j + 1;
        }
      } else if (c === '"') {
        q = true;
        i++;
        while (i < n) {
          const d = s[i];
          if (d === '"') {
            if (ps && s[i + 1] === '"') { t += '"'; i += 2; continue; }
            i++;
            break;
          }
          if (d === (ps ? '`' : '\\') && i + 1 < n) {
            const e = s[i + 1];
            if (ps || '"\\$`\n'.indexOf(e) !== -1) { t += e; i += 2; continue; }
          }
          t += d;
          i++;
        }
      } else if (ps && c === '`') {
        if (i + 1 < n) t += s[i + 1];
        i += 2;
      } else if (!ps && c === '\\') {
        if (i + 1 < n && s[i + 1] !== '\n') t += s[i + 1];
        i += 2;
      } else if (ps && c === '@' && (s[i + 1] === "'" || s[i + 1] === '"') && /^[ \t]*\r?\n/.test(s.slice(i + 2, i + 40))) {
        // here-string do PowerShell: o corpo e texto ate a aspa seguida de @ no comeco de uma linha
        const j = s.indexOf('\n' + s[i + 1] + '@', i + 2);
        q = true;
        t += j < 0 ? s.slice(i + 2) : s.slice(i + 2, j);
        i = j < 0 ? n : j + 3;
      } else {
        t += c;
        i++;
      }
    }
    return { t: t, q: q, achou: achou, fim: i };
  }

  // depois da quebra de linha: o corpo de cada heredoc aberto, na ordem
  function corpos(i) {
    while (pendentes.length) {
      const h = pendentes.shift();
      const linhas = [];
      while (i < n) {
        let fim = s.indexOf('\n', i);
        if (fim < 0) fim = n;
        const linha = s.slice(i, fim).replace(/\r$/, '');
        i = fim + 1;
        if ((h.tab ? linha.replace(/^\t+/, '') : linha) === h.marca) break;
        linhas.push(linha);
      }
      h.cmd.docs.push(linhas.join('\n'));
    }
    return Math.min(i, n);
  }

  function pularEspacos(i) {
    while (i < n && ESPACO.test(s[i])) i++;
    return i;
  }

  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '\n') { fecharComando(); i = corpos(i + 1); continue; }
    if (ESPACO.test(c)) { i++; continue; }
    if (c === '#') { while (i < n && s[i] !== '\n') i++; continue; } // comentario: so aparece entre palavras
    if (c === ';' || c === '(' || c === ')' || c === '|') { fecharComando(); i++; continue; }
    if (c === '&' && s[i + 1] !== '>') { fecharComando(); i++; continue; }

    if (c === '>' || c === '<' || c === '&') {
      // operador de redirecao. `&>` e `&>>` mandam saida e erro para o arquivo.
      let escrita = true;
      let duplica = false;
      if (c === '&') {
        i += 2;
        if (s[i] === '>') i++;
      } else if (c === '>') {
        i++;
        if (s[i] === '>' || s[i] === '|') i++;
        else if (s[i] === '&') { i++; duplica = true; }
      } else {
        escrita = false;
        i++;
        if (s[i] === '<') {
          i++;
          if (s[i] !== '<') {
            // heredoc: <<MARCA, <<'MARCA', <<-MARCA
            const tab = s[i] === '-';
            if (tab) i++;
            const m = palavra(pularEspacos(i));
            i = m.fim;
            if (m.achou) pendentes.push({ marca: m.t, tab: tab, cmd: atual });
            continue;
          }
          i++; // <<< : here-string, a palavra seguinte e texto de entrada
        } else if (s[i] === '(') {
          continue; // <( ): o parentese vira separador
        } else if (s[i] === '&' || s[i] === '>') {
          i++;
        }
      }
      const alvo = palavra(pularEspacos(i));
      i = alvo.fim;
      if (!alvo.achou || !escrita) continue;
      // `>&1`, `>&2`, `>&-` duplicam descritor; `>&arquivo` escreve no arquivo
      if (duplica && !alvo.q && /^(\d+|-)$/.test(alvo.t)) continue;
      atual.redir.push(alvo.t);
      continue;
    }

    const w = palavra(i);
    if (!w.achou) { i++; continue; } // defesa: nunca ficar parado
    i = w.fim;
    // `2>arquivo`: o numero colado ao operador e o descritor, nao uma palavra
    if ((s[i] === '>' || s[i] === '<') && !w.q && /^\d+$/.test(w.t)) continue;
    atual.palavras.push({ t: w.t, q: w.q });
  }
  fecharComando();
  return comandos;
}

/** Nome do programa sem pasta nem extensao de executavel, em minusculas. */
function nomeDoPrograma(t) {
  return String(t).replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

// Parametros de cmdlet do PowerShell que levam valor; os demais (-Force, -Append...) sao chaves sem valor.
const PARAMETROS_PS = ['path', 'literalpath', 'filepath', 'value', 'encoding', 'destination', 'name', 'itemtype',
  'stream', 'width', 'include', 'exclude', 'filter', 'credential', 'delimiter', 'newline'];

/** O PowerShell aceita abreviar o parametro (-Pa, -Dest) quando so um comeca assim. */
function resolverParametroPs(nome) {
  if (PARAMETROS_PS.indexOf(nome) !== -1) return nome;
  if (nome.length < 2) return null;
  const achados = PARAMETROS_PS.filter(function (p) { return p.indexOf(nome) === 0; });
  return achados.length === 1 ? achados[0] : null;
}

/** Argumentos de cmdlet: { nomeados: Map(parametro -> [valores]), pos: [palavras soltas] }. */
function lerArgumentosPs(args) {
  const nomeados = new Map();
  const pos = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    const m = !a.q && /^-([A-Za-z][A-Za-z0-9]*)(?::(.*))?$/.exec(a.t);
    if (!m) { pos.push(a.t); continue; }
    const nome = resolverParametroPs(m[1].toLowerCase());
    if (!nome) continue;
    const valor = m[2] !== undefined ? m[2] : (k + 1 < args.length ? args[++k].t : null);
    if (valor !== null) nomeados.set(nome, (nomeados.get(nome) || []).concat([valor]));
  }
  return { nomeados: nomeados, pos: pos };
}

/** Argumentos estilo unix: as opcoes de `comValor` consomem o valor (colado por = ou a palavra seguinte). */
function lerArgumentosUnix(args, comValor) {
  const opcoes = [];
  const valores = new Map();
  const pos = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a.q || !/^--?[A-Za-z]/.test(a.t)) { pos.push(a.t); continue; }
    const m = /^(--?[A-Za-z][A-Za-z-]*)=(.*)$/.exec(a.t);
    if (m && comValor.indexOf(m[1]) !== -1) { valores.set(m[1], m[2]); continue; }
    opcoes.push(a.t);
    if (comValor.indexOf(a.t) !== -1 && k + 1 < args.length) valores.set(a.t, args[++k].t);
  }
  return { opcoes: opcoes, valores: valores, pos: pos };
}

const ESCREVE_CMDLET = new Set(['set-content', 'sc', 'add-content', 'ac', 'out-file', 'tee-object', 'new-item', 'ni']);
const COPIA_OU_MOVE = new Set(['cp', 'mv', 'install', 'copy', 'move', 'copy-item', 'move-item', 'cpi', 'mi']);
const SO_CMDLET = new Set(['copy', 'move', 'copy-item', 'move-item', 'cpi', 'mi']);
const INTERPRETADOR_DE_SHELL = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const INTERPRETADOR_PS = new Set(['pwsh', 'powershell']);
// chamadas do node que escrevem: o alvo e o 1o argumento, ou o 2o (copiar e renomear)
const NODE_ESCREVE_1 = new Set(['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']);
const NODE_ESCREVE_2 = new Set(['copyFile', 'copyFileSync', 'cp', 'cpSync', 'rename', 'renameSync']);

/** Fichas de um script do node: literais de texto, identificadores e pontuacao. */
function fichasDoScript(script) {
  const fichas = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1|([A-Za-z_$][\w$]*)|(\S)/g;
  let m;
  while ((m = re.exec(script)) !== null) {
    if (m[1] !== undefined) fichas.push({ lit: m[2] });
    else if (m[3] !== undefined) fichas.push({ id: m[3] });
    else fichas.push({ p: m[4] });
  }
  return fichas;
}

/** Caminhos que um script do node (-e ou heredoc) manda escrever, quando o alvo esta escrito na chamada. */
function alvosDeScriptNode(script) {
  const f = fichasDoScript(script);
  const variaveis = new Map();
  const alvos = [];
  const valorDe = function (x) {
    if (!x) return null;
    if (x.lit !== undefined) return x.lit;
    return x.id !== undefined && variaveis.has(x.id) ? variaveis.get(x.id) : null;
  };
  for (let k = 0; k < f.length; k++) {
    // const nome = 'texto'
    if (f[k].id && /^(?:const|let|var)$/.test(f[k].id) && f[k + 1] && f[k + 1].id && f[k + 2] && f[k + 2].p === '=' &&
        f[k + 3] && f[k + 3].lit !== undefined) variaveis.set(f[k + 1].id, f[k + 3].lit);
    if (!f[k].id || !f[k + 1] || f[k + 1].p !== '(') continue;
    if (NODE_ESCREVE_1.has(f[k].id)) {
      const v = valorDe(f[k + 2]);
      if (v !== null) alvos.push(v);
    } else if (NODE_ESCREVE_2.has(f[k].id) && f[k + 3] && f[k + 3].p === ',') {
      const v = valorDe(f[k + 4]);
      if (v !== null) alvos.push(v);
    }
  }
  return alvos;
}

// [System.IO.File]::WriteAllText('a.css', ...) e AppendAllText: o 1o argumento e o arquivo
const PS_ARQUIVO_NET = /\[(?:System\.)?IO\.File\]::(?:Write|Append)\w*\(\s*(['"])(.+?)\1/gi;

function alvosDoArquivoNet(texto) {
  const alvos = [];
  const limpo = texto.replace(/@(['"])[ \t]*\r?\n[\s\S]*?\r?\n\1@/g, ' '); // o corpo de here-string e texto
  PS_ARQUIVO_NET.lastIndex = 0;
  let m;
  while ((m = PS_ARQUIVO_NET.exec(limpo)) !== null) alvos.push(m[2]);
  return alvos;
}

function destinoEmPasta(destino, origens) {
  return origens.map(function (o) { return destino.replace(/[\\/]+$/, '') + '/' + o.replace(/^.*[\\/]/, ''); });
}

/** Os caminhos (como escritos no comando) que um texto de comando manda escrever. */
function escritosPorTexto(texto, ps, profundidade) {
  const alvos = [];
  lerShell(texto, ps).forEach(function (cmd) {
    escritosPorComando(cmd, ps, profundidade).forEach(function (p) { alvos.push(p); });
  });
  if (ps) alvosDoArquivoNet(texto).forEach(function (p) { alvos.push(p); });
  return alvos;
}

/** Os caminhos que UM comando simples escreve. */
function escritosPorComando(cmd, ps, profundidade) {
  const alvos = cmd.redir.slice();
  let k = 0;
  while (k < cmd.palavras.length && (PREFIXOS.has(cmd.palavras[k].t) ||
      (!cmd.palavras[k].q && /^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd.palavras[k].t)))) k++;
  if (k >= cmd.palavras.length) return alvos;
  const nome = nomeDoPrograma(cmd.palavras[k].t);
  const args = cmd.palavras.slice(k + 1);
  const textos = args.map(function (a) { return a.t; });

  if (nome === 'tee') {
    lerArgumentosUnix(args, []).pos.forEach(function (p) { alvos.push(p); });
  } else if (nome === 'sed' || nome === 'gsed' || nome === 'perl') {
    // -i, -i.bak, -ni, -pi, --in-place: edita o arquivo no lugar. Num sed qualquer opcao com `i` e a -i
    // (o resto do grupo e o sufixo da copia); no perl o `i` tem de fechar o grupo ou vir antes de um ponto,
    // senao `-Mstrict` contaria. O roteiro nao e arquivo: e a palavra depois de -e/-f, ou a primeira solta.
    const re = nome === 'perl' ? /^-[A-Za-z]*i(?:[^A-Za-z].*)?$/ : /^-[A-Za-z]*i/;
    const emLugar = args.some(function (a) { return !a.q && (/^--in-place(=.*)?$/.test(a.t) || re.test(a.t)); });
    if (emLugar) {
      const arquivos = [];
      let temRoteiro = false;
      for (let j = 0; j < args.length; j++) {
        const a = args[j];
        if (a.q || !/^-/.test(a.t)) { arquivos.push(a.t); continue; }
        if (/^--(expression|file)$/.test(a.t) || (/^-[A-Za-z]*[ef]$/.test(a.t) && !/^--/.test(a.t))) { temRoteiro = true; j++; }
        else if (/^--(expression|file)=/.test(a.t)) temRoteiro = true;
      }
      (temRoteiro ? arquivos : arquivos.slice(1)).forEach(function (p) { alvos.push(p); });
    }
  } else if (COPIA_OU_MOVE.has(nome)) {
    if (ps || SO_CMDLET.has(nome)) {
      const a = lerArgumentosPs(args);
      const fontes = (a.nomeados.get('path') || []).concat(a.nomeados.get('literalpath') || []);
      let destino = null;
      if (a.nomeados.has('destination')) destino = a.nomeados.get('destination')[0];
      else if (fontes.length) destino = a.pos.length ? a.pos[0] : null;
      else if (a.pos.length >= 2) destino = a.pos[a.pos.length - 1];
      if (destino !== null) {
        if (/[\\/]$/.test(destino)) {
          destinoEmPasta(destino, fontes.concat(a.pos.filter(function (p) { return p !== destino; }))).forEach(function (p) { alvos.push(p); });
        } else {
          alvos.push(destino);
        }
      }
    } else {
      const a = lerArgumentosUnix(args, ['-t', '--target-directory', '-S', '--suffix', '-m', '--mode', '-o', '-g']);
      const pasta = a.valores.get('-t') || a.valores.get('--target-directory');
      if (pasta) {
        destinoEmPasta(pasta, a.pos).forEach(function (p) { alvos.push(p); });
      } else if (a.pos.length >= 2) {
        const destino = a.pos[a.pos.length - 1];
        if (/[\\/]$/.test(destino)) destinoEmPasta(destino, a.pos.slice(0, -1)).forEach(function (p) { alvos.push(p); });
        else alvos.push(destino);
      }
    }
  } else if (ESCREVE_CMDLET.has(nome)) {
    const a = lerArgumentosPs(args);
    const caminhos = [].concat(a.nomeados.get('path') || [], a.nomeados.get('literalpath') || [], a.nomeados.get('filepath') || []);
    (a.nomeados.get('name') || []).forEach(function (p) { alvos.push(p); });
    if (caminhos.length) caminhos.forEach(function (p) { alvos.push(p); });
    else if (a.pos.length) alvos.push(a.pos[0]);
  } else if (nome === 'dd') {
    textos.forEach(function (t) { if (/^of=/.test(t)) alvos.push(t.slice(3)); });
  } else if (nome === 'node' || nome === 'nodejs') {
    const iEval = args.findIndex(function (a) { return !a.q && /^(-e|--eval|-p|--print|-pe)$/.test(a.t); });
    let scripts = [];
    if (iEval === -1) scripts = cmd.docs; // o roteiro vem por heredoc
    else if (iEval + 1 < args.length) scripts = [args[iEval + 1].t];
    scripts.forEach(function (sc) { alvosDeScriptNode(sc).forEach(function (p) { alvos.push(p); }); });
  } else if (profundidade < PROFUNDIDADE_MAXIMA) {
    // programa que roda outro comando escrito em texto: bash -c, eval, powershell -Command
    let interno = null;
    let internoPs = ps;
    if (INTERPRETADOR_DE_SHELL.has(nome)) {
      const ic = args.findIndex(function (a) { return !a.q && /^-[A-Za-z]*c$/.test(a.t); });
      if (ic !== -1 && ic + 1 < args.length) { interno = args[ic + 1].t; internoPs = false; }
    } else if (nome === 'eval') {
      interno = textos.join(' ');
    } else if (nome === 'cmd') {
      // cmd /c "echo x > a.css": a barra invertida do Windows e caminho, como no PowerShell
      const ic = args.findIndex(function (a) { return !a.q && /^\/[ck]$/i.test(a.t); });
      if (ic !== -1) { interno = textos.slice(ic + 1).join(' '); internoPs = true; }
    } else if (INTERPRETADOR_PS.has(nome)) {
      const ic = args.findIndex(function (a) { return !a.q && /^-c(?:o|om|omm|omma|omman|ommand)?$/i.test(a.t); });
      if (ic !== -1 && ic + 1 < args.length) { interno = textos.slice(ic + 1).join(' '); internoPs = true; }
    }
    if (interno !== null) escritosPorTexto(interno, internoPs, profundidade + 1).forEach(function (p) { alvos.push(p); });
  }
  return alvos;
}

/**
 * O caminho que o Git Bash do Windows escreve (/c/pasta/arquivo) volta a ser o do disco. So quando o
 * projeto esta num disco do Windows (cwd como `C:\...`): quem decide e o cwd, nao o sistema que roda.
 */
function caminhoDoShell(p, cwd) {
  const m = /^[A-Za-z]:[\\/]/.test(String(cwd)) ? /^\/([A-Za-z])(?:\/(.*))?$/.exec(p) : null;
  return m ? m[1].toUpperCase() + ':/' + (m[2] || '') : p;
}

/**
 * Os arquivos de estilo que o `comando` de shell escreve, como caminhos relativos ao projeto, sem repetir.
 * `opcoes.ferramenta` ('PowerShell' escolhe o idioma de aspas e de escape) e `opcoes.cwd` (a raiz do
 * projeto: caminho fora dela nao conta, como no portao do Write/Edit). Lista vazia = nada a conferir.
 */
function alvosDeEstiloNoShell(comando, projeto, opcoes) {
  if (typeof comando !== 'string' || comando === '') return [];
  const o = opcoes || {};
  const brutos = new Set(escritosPorTexto(comando, o.ferramenta === 'PowerShell', 0));
  const saida = [];
  brutos.forEach(function (p) {
    if (!p) return;
    if (p.indexOf('$') !== -1) {
      // caminho com variavel: a pasta nao se sabe, mas a extensao no fim do nome sim
      const baixo = p.toLowerCase();
      if (EXTENSOES_ESTILO.some(function (e) { return baixo.endsWith(e); }) && saida.indexOf(p) === -1) saida.push(p);
      return;
    }
    let rel;
    if (o.cwd) {
      rel = caminhoLib.relativoAoProjeto(caminhoDoShell(p, o.cwd), o.cwd);
      if (!rel) return; // fora do projeto, ou o proprio projeto
    } else {
      rel = glob.normalizar(p);
    }
    if (ehArquivoDeEstilo(rel, projeto) && saida.indexOf(rel) === -1) saida.push(rel);
  });
  return saida;
}

/** Mensagem de remedio: o que o esquadro confere e onde, e o que fazer. Nao ensina desvio. */
function motivoShell(alvos) {
  const linhas = [
    'esquadro - arquivo de estilo escrito por comando de shell.',
    '',
    'Arquivo' + (alvos.length > 1 ? 's' : '') + ':'
  ];
  for (const a of alvos.slice(0, 12)) linhas.push('  ' + a);
  if (alvos.length > 12) linhas.push('  ... e mais ' + (alvos.length - 12));
  linhas.push('');
  linhas.push('O esquadro confere os tokens do design.json quando o arquivo de estilo e escrito');
  linhas.push('pela ferramenta Write ou Edit. Escreva este arquivo com Write ou Edit.');
  return linhas.join('\n');
}

module.exports = { EXTENSOES_ESTILO, UNIDADES, ehArquivoDeEstilo, valoresCrus, conferir, motivo, alvosDeEstiloNoShell, motivoShell };
