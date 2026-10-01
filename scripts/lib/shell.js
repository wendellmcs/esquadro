'use strict';
const fs = require('node:fs');
const path = require('node:path');

// 0.3.5/D294: a tabela que nao se le NAO some calada. A causa fica guardada e o portao a mostra
// (`problemasDaTabela` + `avisoTabela`): o comando passa, e sai aviso. Nada se nega por arquivo
// estragado. O nome do arquivo ja diz o SO: a tabela so vale no win32, mesmo quando nao se leu.
const ARQUIVO_TABELA = 'modelos/shell-win32.json';
const SO_DA_TABELA = 'win32';

function causaDoErro(e) {
  const causa = (e && e.code) ? String(e.code) : (e && e.name ? e.name + ': ' + e.message : String(e));
  return causa.replace(/\s+/g, ' ').slice(0, 200);
}

const CARGA = (function () {
  const vazia = { quando: {}, regras: [], regrasPowerShell51: [] };
  const quebrou = (causa) => ({ tabela: vazia, problema: { tipo: 'arquivo', onde: ARQUIVO_TABELA, causa } });
  let bruta;
  try {
    bruta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', ARQUIVO_TABELA), 'utf8'));
  } catch (e) {
    return quebrou(causaDoErro(e));
  }
  if (!bruta || typeof bruta !== 'object' || Array.isArray(bruta)) return quebrou('o conteudo nao e um objeto de tabela');
  // `regras` ou `regrasPowerShell51` que nao e lista = tabela ilegivel, como o arquivo todo
  const naoLista = ['regras', 'regrasPowerShell51'].filter((k) => bruta[k] !== undefined && !Array.isArray(bruta[k]));
  if (naoLista.length) return quebrou(naoLista.join(' e ') + ' nao e uma lista');
  return {
    tabela: {
      quando: (bruta.quando && typeof bruta.quando === 'object') ? bruta.quando : {},
      regras: bruta.regras || [],
      regrasPowerShell51: bruta.regrasPowerShell51 || []
    },
    problema: null
  };
})();
const TABELA = CARGA.tabela;

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

/**
 * 0.3.5/D294: a regra que nao se compila nao vira `null` calado - devolve a causa junto.
 * Padrao que nao e texto (`new RegExp(undefined)` casa TUDO) tambem e regra que nao se le.
 */
function lerRegra(regra) {
  if (!regra || typeof regra.padrao !== 'string') return { re: null, causa: 'o padrao nao e um texto' };
  try { return { re: new RegExp(regra.padrao), causa: null }; } catch (e) { return { re: null, causa: causaDoErro(e) }; }
}

function compilar(regra) {
  return lerRegra(regra).re;
}

/** As regras que valem para esta plataforma: a do PowerShell 5.1 so com o shell powershell. */
function regrasAplicaveis(p) {
  return TABELA.regras.concat(p.shell === 'powershell' ? TABELA.regrasPowerShell51 : []);
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

  // 0.3.5/D294: o `conferir` so roda fora da ferramenta Bash, ou seja, no PowerShell - as aspas
  // seguem o idioma dele (a barra nao escapa na simples; a dupla escapa com crase).
  const limpo = semLiterais(comando, 'powershell');
  const problemas = [];

  for (const regra of regrasAplicaveis(p)) {
    const re = compilar(regra);
    if (re && re.test(limpo)) {
      problemas.push({ achado: regra.achado, sugestao: regra.sugestao, motivo: regra.motivo });
    }
  }
  return problemas;
}

/**
 * 0.3.5/D294: o que na tabela do PowerShell nao se le, para o portao AVISAR (nunca negar).
 * So onde a tabela valeria: plataforma win32 e ferramenta que nao e a Bash (a mesma porta do
 * `conferir`). Cada problema e `{ tipo: 'arquivo'|'regra', onde, achado?, causa }`; a regra
 * invalida so entra se estiver no conjunto aplicavel (a do PowerShell 5.1 so com shell powershell).
 */
function problemasDaTabela(plataforma, ferramenta) {
  const p = plataforma || {};
  if (p.so !== SO_DA_TABELA || ferramenta === 'Bash') return [];
  const lista = CARGA.problema ? [CARGA.problema] : [];
  const confere = (regras, dono) => regras.forEach((regra, i) => {
    const { causa } = lerRegra(regra);
    if (causa) lista.push({ tipo: 'regra', onde: dono + '[' + i + ']', achado: String((regra && regra.achado) || '(sem achado)'), causa });
  });
  confere(TABELA.regras, 'regras');
  if (p.shell === 'powershell') confere(TABELA.regrasPowerShell51, 'regrasPowerShell51');
  return lista;
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

/**
 * 0.3.5/D294: o texto do aviso (ASCII, como o resto). Diz qual arquivo ou regra quebrou e a causa, e
 * que a trava de idioma esta desligada - por inteiro (arquivo) ou so naquelas regras - ate consertar.
 */
function avisoTabela(problemas) {
  const linhas = ['esquadro - a tabela de idioma do PowerShell nao esta valendo. O comando rodou normalmente.', ''];
  for (const p of problemas) {
    linhas.push(p.tipo === 'arquivo'
      ? '  arquivo ' + p.onde + ' do plugin nao se leu: ' + p.causa
      : '  regra "' + p.achado + '" (' + p.onde + ' em ' + ARQUIVO_TABELA + ') tem padrao invalido: ' + p.causa);
  }
  linhas.push('');
  linhas.push(problemas.some((p) => p.tipo === 'arquivo')
    ? 'A trava de idioma de shell esta DESLIGADA ate consertar esse arquivo (nada e negado por ele).'
    : 'A trava de idioma esta DESLIGADA so para as regras acima; as outras seguem valendo.');
  linhas.push('Conserte o arquivo no plugin esquadro e abra uma sessao nova. Este aviso sai uma vez por sessao.');
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// 0.3.4/item 2 (D286) e 0.3.5/D293: o `cd` solto.
//
// A pasta atual PERSISTE entre uma chamada e outra das ferramentas Bash e PowerShell, em
// qualquer SO. A raiz dos portoes nao muda com o `cd` (config.js), mas o comando seguinte cai na
// pasta errada: um `git` sem caminho age no outro repositorio. Por isso esta funcao NAO e a
// tabela do win32 (que e de idioma): vale em qualquer plataforma e em qualquer das duas
// ferramentas. "Solto" = no nivel de cima do comando, fora de texto, de comentario e de subshell.
//
// 0.3.5/D293: UMA leitura do comando, caractere a caractere, por idioma (a pilha de regex da 0.3.4
// errava o que a camada de cima ja tinha tirado). A mesma passada sabe aspas, comentario,
// heredoc/here-string, subshell e POSICAO DE COMANDO, e devolve so os eventos de pasta, em ordem.
// E heuristica, nao um parser de bash nem de PowerShell.
//
// Bash: `( )`, `$( )`, crase, `<( )` e cada elo de cano `|` sao subshell (a pasta volta); `{ ; }`,
//   `if`, `then`, `do` NAO isolam. `$'..'` tem escape com barra. Palavra-chave (`then do else elif
//   if while until`) so vale em posicao de comando; o braco de `case` comeca depois do `)`.
//   Funcao definida guarda os eventos do corpo e a CHAMADA em posicao de comando os repete: o
//   achado e o `cd` de dentro (a palavra que muda a pasta), nao o nome da funcao. Funcao chamada
//   em OUTRO comando (outra chamada da ferramenta) nao se ve.
// PowerShell: NADA isola - nem `& { }`, nem `( )`, nem `$( )` (que RODA, ate dentro de aspa dupla).
//   A crase dentro da palavra escapa o caractere (`c`d` = `cd`). Chave de hashtable `@{ cd = 1 }`
//   nao e comando. So o par Push-Location com Pop-Location no mesmo comando devolve a pasta.
// ---------------------------------------------------------------------------

const PALAVRA_CHAVE_BASH = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until']);
// `cd..` e `cd\` sao funcoes do PowerShell 5.1 (medido, D290); `sl\` nao e comando.
const CD_PS = new Set(['cd', 'chdir', 'sl', 'set-location', 'cd..', 'cd\\']);
const PUSH_PS = new Set(['push-location', 'pushd']);
const POP_PS = new Set(['pop-location', 'popd']);
const HEREDOC = /<<(-?)[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/y;
const FUNCAO_VAZIA = /[ \t]*\([ \t]*\)/y;

/** Devolve os eventos de pasta do comando, em ordem: { p: 'cd'|'push'|'pop', achado, arg }. */
function lerComando(s, idioma) {
  const ps = idioma === 'powershell';
  const n = s.length;
  const eventos = [];
  const funcoes = new Map(); // nome -> eventos do corpo
  const heredocs = [];       // marcadores abertos, lidos na proxima quebra de linha
  const delim = ps ? ' \t\r\n;&|(){}' : ' \t\r\n;&|()<>';
  let isolado = 0;
  let prof = 0;

  const emitir = (ev) => { if (!isolado) eventos.push(ev); };
  const temArgumento = (i) => {
    while (s[i] === ' ' || s[i] === '\t') i++;
    return i < n && !/[\n\r;|&})#]/.test(s[i]);
  };

  // `i` aponta para o primeiro caractere depois da aspa que abre; devolve o indice depois da que fecha.
  const aspaSimples = (i) => { const j = s.indexOf("'", i); return j < 0 ? n : j + 1; };
  const aspaAnsi = (i) => {
    for (; i < n; i++) {
      if (s[i] === '\\') i++;
      else if (s[i] === "'") return i + 1;
    }
    return n;
  };
  const aspaDupla = (i) => {
    while (i < n) {
      const c = s[i];
      if (c === (ps ? '`' : '\\')) i += 2;
      else if (c === '"') return i + 1;
      else if (c === '$' && s[i + 1] === '(') i = ler(i + 2, ')', !ps); // no PowerShell o $( ) roda
      else if (c === '`') i = ler(i + 1, '`', true);                       // so chega aqui no bash
      else i++;
    }
    return n;
  };
  // depois da quebra de linha: pula o corpo de cada heredoc aberto, na ordem
  const corposDeHeredoc = (i) => {
    while (heredocs.length) {
      const h = heredocs.shift();
      while (i < n) {
        let fim = s.indexOf('\n', i);
        if (fim < 0) fim = n;
        const linha = s.slice(i, fim).replace(/\r$/, '');
        i = fim + 1;
        if ((h.tab ? linha.replace(/^\t+/, '') : linha) === h.marca) break;
      }
    }
    return Math.min(i, n);
  };

  // Le ate `fecha` (ou o fim). `isola`: o que esta dentro nao conta (subshell do bash).
  function ler(i, fecha, isola) {
    if (prof >= 100) return n; // aninhamento absurdo: para de ler em vez de estourar a pilha
    prof++;
    if (isola) isolado++;
    const pilha = []; // bash: case/grupo/funcao; PowerShell: bloco/hash
    let cmdPos = true;
    let palavra = '';
    let seg = { ini: eventos.length, cano: false }; // o comando de agora; em cano, nada dele conta
    let defPendente = null; // nome de funcao do bash esperando o `{` do corpo
    let esperaNome = false; // viu `function`
    let condicional = false; // o comando de agora vem depois de && ou ||: pode nao rodar
    let aposOperador = false; // nada lido desde o && ou ||: a quebra de linha continua a lista
    const topo = () => pilha[pilha.length - 1];
    const noPadrao = () => { const t = topo(); return !!t && t.t === 'case' && t.fase === 'padrao'; };

    const fimDoComando = () => {
      if (seg.cano && eventos.length > seg.ini) eventos.length = seg.ini;
      seg = { ini: eventos.length, cano: false };
    };
    const separador = () => {
      fimDoComando();
      const t = topo();
      cmdPos = !(t && t.t === 'hash') && !noPadrao(); // chave de hashtable e padrao de case nao sao comando
    };

    // A palavra acabou, `i` aponta para o delimitador. Devolve o indice (anda se leu `()` de funcao).
    const palavraPronta = (i) => {
      const w = palavra;
      palavra = '';
      aposOperador = false;
      if (!ps && w === 'esac' && topo() && topo().t === 'case' && (cmdPos || noPadrao())) {
        pilha.pop(); cmdPos = false; return i;
      }
      if (!cmdPos) { defPendente = null; return i; }
      if (!ps) {
        if (w === '{') {
          pilha.push(defPendente ? { t: 'funcao', nome: defPendente, ini: eventos.length } : { t: 'grupo' });
          defPendente = null;
          return i; // segue em posicao de comando
        }
        const nome = esperaNome ? w : null;
        esperaNome = false;
        const t = topo();
        defPendente = null;
        if (w === '}') {
          if (t && (t.t === 'grupo' || t.t === 'funcao')) {
            pilha.pop();
            if (t.t === 'funcao') { funcoes.set(t.nome, eventos.splice(t.ini)); seg.ini = Math.min(seg.ini, eventos.length); }
          }
          cmdPos = false; return i;
        }
        if (nome === null && PALAVRA_CHAVE_BASH.has(w)) return i;
        if (nome === null && w === 'function') { esperaNome = true; return i; }
        if (nome === null && w === 'case') { pilha.push({ t: 'case', fase: 'padrao' }); cmdPos = false; return i; }
        FUNCAO_VAZIA.lastIndex = i;
        const vazia = FUNCAO_VAZIA.exec(s);
        if (nome !== null || (vazia && /^[\w.:-]+$/.test(w))) { // `f() {` e `function f {`
          defPendente = nome !== null ? nome : w;
          cmdPos = true;
          return vazia ? i + vazia[0].length : i;
        }
        if (w === 'cd') emitir({ p: 'cd', achado: w });
        else if (w === 'pushd') emitir({ p: 'push', achado: w, arg: temArgumento(i) });
        else if (w === 'popd') emitir({ p: 'pop', achado: w, cond: condicional });
        else if (funcoes.has(w)) funcoes.get(w).forEach(emitir);
      } else {
        const b = w.toLowerCase();
        if (CD_PS.has(b)) emitir({ p: 'cd', achado: b === 'cd..' || b === 'cd\\' ? w.slice(0, 2) : w }); // `cd..` e `cd\` -> `cd`
        else if (PUSH_PS.has(b)) emitir({ p: 'push', achado: w, arg: temArgumento(i) });
        else if (POP_PS.has(b)) emitir({ p: 'pop', achado: w, cond: condicional });
      }
      cmdPos = false;
      return i;
    };

    while (i < n) {
      const c = s[i];
      if (c === fecha && !(c === ')' && noPadrao())) { if (palavra) palavraPronta(i); i++; break; }
      if (palavra !== '' && delim.includes(c)) { i = palavraPronta(i); continue; }

      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '\n') { i++; separador(); if (!aposOperador) condicional = false; if (!ps) i = corposDeHeredoc(i); continue; }
      if (c === '#' && palavra === '') { while (i < n && s[i] !== '\n') i++; continue; }
      if (ps && c === '<' && s[i + 1] === '#' && palavra === '') {
        const j = s.indexOf('#>', i + 2);
        i = j < 0 ? n : j + 2;
        continue;
      }

      if (c === ';') {
        if (!ps && topo() && topo().t === 'case' && (s[i + 1] === ';' || s[i + 1] === '&')) {
          topo().fase = 'padrao'; fimDoComando(); cmdPos = false; condicional = false; i += 2; continue; // `;;` fecha o braco
        }
        separador(); condicional = false; i++; continue;
      }
      if (c === '&') {
        if (s[i - 1] === '<' || s[i - 1] === '>' || s[i + 1] === '>') { i++; continue; } // `2>&1`, `&>`
        separador();
        condicional = aposOperador = s[i + 1] === '&';
        i += s[i + 1] === '&' ? 2 : 1; continue;
      }
      if (c === '|') {
        if (s[i + 1] === '|') { separador(); condicional = aposOperador = true; i += 2; continue; }
        if (!ps && noPadrao()) { i++; continue; } // `a|b)` do case
        if (ps) separador(); else { seg.cano = true; cmdPos = true; } // cada elo do cano e subshell no bash
        i += s[i + 1] === '&' ? 2 : 1;
        continue;
      }
      if (c === '(') {
        if (!ps && noPadrao()) { i++; continue; }
        i = ler(i + 1, ')', !ps);
        cmdPos = false; aposOperador = false;
        continue;
      }
      if (c === ')') {
        const t = topo();
        if (!ps && t && t.t === 'case' && t.fase === 'padrao') { t.fase = 'corpo'; cmdPos = true; }
        i++; continue;
      }
      if (ps && c === '{') { pilha.push({ t: 'bloco' }); cmdPos = true; i++; continue; }
      if (ps && c === '}') { pilha.pop(); cmdPos = false; i++; continue; }
      if (!ps && c === '<') {
        if (s.startsWith('<<<', i)) { i += 3; continue; }
        HEREDOC.lastIndex = i;
        const m = s[i + 1] === '<' ? HEREDOC.exec(s) : null;
        if (m) { heredocs.push({ marca: m[3], tab: m[1] === '-' }); i += m[0].length; continue; }
        i++; continue;
      }
      if (!ps && c === '>') { i++; continue; }

      // daqui para baixo e caractere de palavra
      if (ps && c === '@' && s[i + 1] === '{') { // @{ }: o que esta dentro e chave, nao comando
        if (palavra) palavraPronta(i);
        pilha.push({ t: 'hash' }); cmdPos = false; i += 2; continue;
      }
      if (ps && c === '@' && palavra === '' && (s[i + 1] === "'" || s[i + 1] === '"') && /^[ \t]*\r?\n/.test(s.slice(i + 2, i + 40))) {
        const j = s.indexOf('\n' + s[i + 1] + '@', i + 2); // here-string: o corpo e texto
        palavra = '@';
        i = j < 0 ? n : j + 3;
        continue;
      }
      if (c === "'") { i = aspaSimples(i + 1); palavra += "'"; continue; }
      if (c === '"') { i = aspaDupla(i + 1); palavra += '"'; continue; }
      if (!ps && c === '$' && s[i + 1] === "'") { i = aspaAnsi(i + 2); palavra += "'"; continue; }
      if (c === '$' && s[i + 1] === '(') { i = ler(i + 2, ')', !ps); palavra += '$'; continue; }
      if (c === '$' && s[i + 1] === '{') { const j = s.indexOf('}', i); i = j < 0 ? n : j + 1; palavra += '$'; continue; }
      if (!ps && c === '`') { i = ler(i + 1, '`', true); palavra += '`'; continue; }
      if (c === (ps ? '`' : '\\')) { // escape; no fim da linha e continuacao
        const k = s[i + 1] === '\n' ? 2 : (s[i + 1] === '\r' && s[i + 2] === '\n' ? 3 : 0);
        if (k) { if (palavra) { i = palavraPronta(i); continue; } i += k; continue; }
        if (i + 1 < n) palavra += s[i + 1];
        i += 2; continue;
      }
      palavra += c; i++;
    }
    if (palavra) palavraPronta(i);
    fimDoComando();
    if (isola) isolado--;
    prof--;
    return i;
  }

  ler(0, '', false);
  return eventos;
}

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
 * Pilha do Push/Pop, igual nos dois idiomas, na ordem do texto: Pop com a pilha vazia nao faz nada
 * (medido no 5.1); cd com a pilha vazia esta solto; cd com pilha nao vazia nao; Push que sobra na
 * pilha esta solto - salvo o Push-Location sem caminho, que so empilha a pasta atual (medido).
 * Pop depois de && ou || pode nao rodar: nao desempilha (`pushd x && make && popd` nega).
 */
function cdSolto(comando, ferramenta, plataforma) {
  const forma = idiomaDoCd(ferramenta, plataforma);
  const pilha = [];
  for (const ev of lerComando(String(comando == null ? '' : comando), forma)) {
    if (ev.p === 'push') pilha.push({ achado: ev.achado, mudou: ev.arg });
    else if (ev.p === 'pop') { if (!ev.cond) pilha.pop(); }
    else if (!pilha.length) return { forma, achado: ev.achado };
    else pilha[pilha.length - 1].mudou = true;
  }
  const sobra = pilha.find((p) => p.mudou);
  return sobra ? { forma, achado: sobra.achado } : null;
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

module.exports = { TABELA, semLiterais, conferir, problemasDaTabela, avisoTabela, motivo, cdSolto, motivoCdSolto };
