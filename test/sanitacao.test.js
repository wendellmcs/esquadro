'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const sanit = require('../scripts/lib/sanitacao.js');

const RAIZ = path.join(__dirname, '..');
const LOCAIS = sanit.classes(RAIZ);

/**
 * D79: a sanitacao e um PORTAO, nao uma revisao. "Maestrosa, nao pode passar
 * nada" nao se garante com leitura manual no fim - se garante com um detector
 * que roda no `npm test` e REPROVA o repositorio.
 *
 * Este arquivo NAO escreve nenhum vazamento por extenso: as iscas vem das
 * proprias classes. Um teste que contivesse o vazamento de mentira se acusaria
 * na propria varredura.
 */

// ── o instrumento, antes do que ele mede ─────────────────────────────────

test('sanitacao: o autoteste passa - controle positivo E negativo por classe', () => {
  const r = sanit.autoteste(RAIZ);
  const detalhe = r.falhas.map((f) => f.classe + '/' + f.tipo + ': ' + f.porQue).join(' | ');
  assert.ok(r.ok, 'o detector nao se provou: ' + detalhe);
  assert.ok(r.genericas >= 7, 'menos classes genericas do que o desenho previa');
});

test('sanitacao: toda classe tem isca e controle - nenhuma entra sem prova', () => {
  LOCAIS.forEach((c) => {
    assert.ok(c.isca, c.chave + ' sem isca: seria classe que nunca se provou');
    assert.ok(c.controle, c.chave + ' sem controle negativo');
    assert.notStrictEqual(c.isca, c.controle, c.chave + ': isca igual ao controle nao testa nada');
  });
  assert.strictEqual(new Set(LOCAIS.map((c) => c.chave)).size, LOCAIS.length, 'chave de classe repetida');
});

test('sanitacao: o detector publicavel NAO carrega vocabulario privado', () => {
  // D133: nome de pessoa, empresa e projeto interno sao do dono. Se morassem no
  // modulo, ele iria ao repo publico levando o que existe para impedir.
  const fonte = require('node:fs').readFileSync(path.join(RAIZ, 'scripts/lib/sanitacao.js'), 'utf8');
  const achados = sanit.varrerTexto(fonte, 'scripts/lib/sanitacao.js', LOCAIS);
  assert.strictEqual(achados.length, 0,
    'o proprio detector vaza: ' + achados.map((a) => a.classe + ' -> ' + a.trecho).join(', '));
});

test('sanitacao: sem o arquivo local o detector ainda roda, e declara que roda assim', () => {
  const soGenericas = sanit.classes(path.join(RAIZ, 'test'));
  assert.strictEqual(soGenericas.length, sanit.CLASSES_GENERICAS.length);
  assert.ok(sanit.autoteste(path.join(RAIZ, 'test')).ok, 'modo degradado tem de continuar valido');
});

// ── controles negativos que a D79 pagou caro para aprender ───────────────

test('sanitacao: "task-completion" NAO e chave - o falso positivo da D79', () => {
  const r = sanit.varrerTexto('const x = "ta' + 'sk-completion";', 'a.js', LOCAIS);
  assert.strictEqual(r.filter((a) => a.classe === 'segredo').length, 0);
});

test('sanitacao: /mingw64/bin NAO e impressao de maquina, o uname e', () => {
  const caminho = sanit.varrerTexto('/ming' + 'w64/bin/git status', 'a.js', LOCAIS);
  assert.strictEqual(caminho.filter((a) => a.classe === 'impressao_de_maquina').length, 0);
  const uname = sanit.varrerTexto('MINGW64_NT-' + '10.0-26200', 'a.js', LOCAIS);
  assert.strictEqual(uname.filter((a) => a.classe === 'impressao_de_maquina').length, 1);
});

test('sanitacao: caminho generico nao e pessoal; pasta de usuario e', () => {
  assert.strictEqual(sanit.varrerTexto('rm -rf /tmp/build', 'a.js', LOCAIS).length, 0);
  const pessoal = sanit.varrerTexto('C:' + '\\Users\\' + 'fulano\\x', 'a.js', LOCAIS);
  assert.strictEqual(pessoal.filter((a) => a.classe === 'caminho_de_maquina').length, 1);
});

test('sanitacao: dominio reservado nao e vazamento, dominio real e', () => {
  assert.strictEqual(sanit.varrerTexto('x = "teste' + '@exemplo.com"', 'a.js', LOCAIS).length, 0);
  assert.strictEqual(sanit.varrerTexto('x = "alguem' + '@empresa.com.br"', 'a.js', LOCAIS).length, 1);
});

test('sanitacao: versao semantica nao e IP privado', () => {
  assert.strictEqual(sanit.varrerTexto('node 10.0.2 minimo', 'a.js', LOCAIS).length, 0);
  assert.strictEqual(sanit.varrerTexto('gw em 192.' + '168.0.1', 'a.js', LOCAIS).length, 1);
});

test('sanitacao: a excecao de atribuicao nao libera segredo no mesmo arquivo', () => {
  const segredo = sanit.CLASSES_GENERICAS.filter((c) => c.chave === 'segredo')[0].isca;
  const r = sanit.varrerTexto(segredo, '.claude-plugin/plugin.json', LOCAIS);
  assert.strictEqual(r.length, 1, 'excecao por arquivo inteiro deixaria um segredo passar');
});

test('sanitacao: todo achado cita arquivo e linha - regra anti-teatro', () => {
  const isca = sanit.CLASSES_GENERICAS[0].isca;
  const r = sanit.varrerTexto('linha 1\nlinha 2\n' + isca, 'x/y.js', LOCAIS);
  assert.ok(r.length >= 1);
  assert.strictEqual(r[0].arquivo, 'x/y.js');
  assert.strictEqual(r[0].linha, 3);
});

// ── as TRES superficies do repositorio de verdade ────────────────────────

test('sanitacao: docs/ fica fora da superficie publicavel (D132 §1.3)', () => {
  const s = sanit.superficiePublicavel(RAIZ);
  assert.ok(s !== null, 'git nao respondeu - varredura sem veredito nao vale');
  assert.strictEqual(s.filter((a) => a.indexOf('docs/') === 0).length, 0);
  assert.ok(s.length > 50, 'superficie pequena demais: o ls-files provavelmente falhou');
});

test('superficie 1: o CONTEUDO publicavel nao vaza', () => {
  const arquivos = sanit.superficiePublicavel(RAIZ);
  assert.ok(arquivos !== null, 'git nao respondeu');
  const achados = sanit.varrerArquivos(RAIZ, arquivos, LOCAIS);
  const lista = achados.map((a) => a.classe + ' ' + a.arquivo + ':' + a.linha + ' -> ' + a.trecho);
  assert.strictEqual(achados.length, 0, 'vazamento no conteudo:\n  ' + lista.join('\n  '));
});

/**
 * As superficies 2 e 3 sao do HISTORICO, e historico nao se exporta junto: o
 * repositorio publico nasce com commit inicial proprio (D133 §2). Logo elas
 * valem no repositorio PUBLICADO, nao no de trabalho.
 *
 * Como se distingue um do outro sem marcador novo: o repositorio de trabalho e o
 * unico que tem `.sanitacao-local.json` - o vocabulario privado do dono, que o
 * .gitignore mantem fora do git e que por definicao nunca chega ao publico.
 *
 * Isto NAO e afrouxar a catraca para o teste passar. E medir a superficie certa:
 * no export, sem arquivo local, os dois testes rodam e TEM de passar - foi assim
 * que o commit inicial foi conferido antes de existir remoto.
 */
const REPO_DE_TRABALHO = sanit.termosLocais(RAIZ).length > 0;

test('superficie 2: a AUTORIA do historico nao carrega e-mail pessoal (D132 §3)', (t) => {
  if (REPO_DE_TRABALHO) {
    t.skip('repositorio de trabalho: o historico daqui vai para o repo PRIVADO, nunca para o publico');
    return;
  }
  const autores = sanit.autoresDoHistorico(RAIZ);
  assert.ok(autores !== null, 'git log nao respondeu');
  const achados = sanit.varrerAutores(autores);
  assert.strictEqual(achados.length, 0,
    'e-mail em metadado de commit:\n  ' + achados.map((a) => a.trecho).join('\n  '));
});

test('superficie 3: as MENSAGENS de commit nao vazam (D133)', (t) => {
  if (REPO_DE_TRABALHO) {
    t.skip('repositorio de trabalho: as mensagens daqui vao para o repo PRIVADO');
    return;
  }
  const msgs = sanit.mensagensDoHistorico(RAIZ);
  assert.ok(msgs !== null, 'git log nao respondeu');
  const achados = sanit.varrerMensagens(msgs, LOCAIS);
  const lista = achados.map((a) => a.classe + ' ' + a.arquivo + ' -> ' + a.trecho);
  assert.strictEqual(achados.length, 0, 'vazamento na mensagem:\n  ' + lista.join('\n  '));
});

test('superficie 2 e 3: o detector das duas ainda se prova, mesmo aqui', () => {
  // O skip acima cala a ASSERCAO sobre este repositorio, nunca o instrumento.
  // Sem isto, um detector de historico quebrado passaria despercebido no repo de
  // trabalho e so falharia no export - depois de ja ter dito "limpo".
  assert.strictEqual(sanit.varrerAutores(['F <f' + '@gmail.com>']).length, 1);
  assert.strictEqual(sanit.varrerAutores(['F <1+f' + '@users.noreply.github.com>']).length, 0);
  const isca = [{ sha: 'abc', texto: 'toca ' + 'C:' + '\\Users\\' + 'fulano\\x' }];
  assert.ok(sanit.varrerMensagens(isca, LOCAIS).length >= 1);
});

// == T45 ==================================================================
// O portao das TRES superficies, e o comando que faltava. Ate aqui o modulo
// tinha mais de trezentas linhas e NADA o executava inteiro: so o autoteste e a
// superficie 1 eram chamados. Lib sem comando e codigo que ninguem roda.
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(RAIZ, 'scripts', 'sanitar.js');

function repo(comLeitura) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro sanitar-'));
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', shell: false });
  g(['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.txt'), comLeitura || 'nada aqui\n', 'utf8');
  g(['add', '-A']);
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t' + '@exemplo.com',
    'commit', '-qm', 'inicial'], { cwd: dir, encoding: 'utf8', shell: false });
  return dir;
}

function repoComMensagemSuja() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro msg-'));
  const g = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', shell: false });
  g(['init', '-q']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'nada aqui\n', 'utf8');
  g(['add', '-A']);
  // Suja nas DUAS superficies do historico - o e-mail do autor e a mensagem -
  // e limpa no conteudo: o --so-conteudo tem de ignorar as duas, nao so uma.
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t' + '@empresa.com.br',
    'commit', '-qm', 'ajusta o que alguem' + '@empresa.com.br pediu'],
    { cwd: dir, encoding: 'utf8', shell: false });
  return dir;
}

function sanitar(raiz, extra) {
  return spawnSync(process.execPath, [SCRIPT, '--raiz', raiz].concat(extra || []),
    { encoding: 'utf8', timeout: 60000 });
}

// ── a correcao que a D133 §7 ja tinha pago, e o codigo nao absorveu ──────

test('sanitacao: a superficie inclui o arquivo NOVO que ainda nao foi adicionado', () => {
  const dir = repo();
  const isca = sanit.CLASSES_GENERICAS.filter((c) => c.chave === 'segredo')[0].isca;
  fs.writeFileSync(path.join(dir, 'recem-escrito.js'), 'const k = "' + isca + '";\n', 'utf8');

  const s = sanit.superficiePublicavel(dir);
  assert.ok(s !== null, 'git nao respondeu');
  assert.ok(s.indexOf('recem-escrito.js') !== -1,
    'com `ls-files` puro o arquivo recem-escrito fica invisivel: foi assim que o ' +
    'export saiu com 92 de 95 arquivos, e os que faltavam eram o proprio detector');

  const achados = sanit.varrerArquivos(dir, s, sanit.CLASSES_GENERICAS);
  assert.strictEqual(achados.length, 1, 'o vazamento no arquivo novo tinha de ser pego');
  assert.strictEqual(achados[0].arquivo, 'recem-escrito.js');
});

test('sanitacao: arquivo ignorado pelo .gitignore fica FORA da superficie', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, '.gitignore'), 'privado.json\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'privado.json'), '{"x":1}\n', 'utf8');
  const s = sanit.superficiePublicavel(dir);
  assert.strictEqual(s.indexOf('privado.json'), -1,
    'sem --exclude-standard o proprio ' + sanit.ARQUIVO_LOCAL + ' entraria na varredura, ' +
    'e o vocabulario privado se acusaria inteiro');
});

test('sanitacao: todo achado diz de QUE superficie veio', () => {
  const isca = sanit.CLASSES_GENERICAS.filter((c) => c.chave === 'segredo')[0].isca;
  const dir = repo('const k = "' + isca + '";\n');
  const r = sanit.auditar(dir);
  assert.ok(r !== null, 'git nao respondeu');
  r.achados.forEach((a) => {
    assert.ok([1, 2, 3].indexOf(a.superficie) !== -1,
      'achado sem superficie: a decisao 13 depende de separar o conteudo do resto');
  });
  assert.strictEqual(r.porSuperficie[1], 1);
  assert.ok(sanit.varrerAutores(['F <f' + '@empresa.com>'])[0].superficie === 2);
  assert.ok(sanit.varrerMensagens([{ sha: 'a', texto: 'k ' + isca }], sanit.CLASSES_GENERICAS)[0]
    .superficie === 3);
});

// ── o comando, exercido como processo ────────────────────────────────────

test('sanitar: repositorio limpo -> saida 0 e veredito nas tres superficies', () => {
  const r = sanitar(repo());
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(/SUPERFICIE 1 conteudo/.test(r.stdout), r.stdout);
  assert.ok(/SUPERFICIE 2 autoria/.test(r.stdout), r.stdout);
  assert.ok(/SUPERFICIE 3 mensagens/.test(r.stdout), r.stdout);
  assert.ok(/LIMPO nas tres superficies/.test(r.stdout), r.stdout);
  assert.ok(r.stdout.indexOf('Fora da superficie: ' + sanit.FORA_DO_PUBLICO.join(', ')) !== -1,
    r.stdout);
});

test('sanitar: vazamento no conteudo -> saida 1, com arquivo, linha e superficie', () => {
  const isca = sanit.CLASSES_GENERICAS.filter((c) => c.chave === 'segredo')[0].isca;
  const r = sanitar(repo('const k = "' + isca + '";\n'));
  assert.strictEqual(r.status, 1, 'vazou e o comando devolveu ' + r.status);
  assert.ok(/VAZOU - 1 achado/.test(r.stdout), r.stdout);
  assert.ok(/S1\s+segredo\s+a\.txt:1/.test(r.stdout), r.stdout);
});

/**
 * A saida deste comando existe para ser colada em relatorio. Imprimir o trecho
 * mudaria o vazamento de lugar em vez de resolve-lo.
 */
test('sanitar: o comando NAO imprime o trecho vazado', () => {
  const isca = sanit.CLASSES_GENERICAS.filter((c) => c.chave === 'segredo')[0].isca;
  const r = sanitar(repo('const k = "' + isca + '";\n'));
  assert.strictEqual(r.stdout.indexOf(isca), -1, 'o segredo saiu no terminal');
  assert.strictEqual(r.stderr.indexOf(isca), -1, 'o segredo saiu no stderr');
});

/**
 * A saida tambem e evidencia colada. Um comando que caca caminho de maquina nao
 * pode abrir a propria saida com o caminho absoluto desta maquina - defeito
 * pego no ensaio, corrigido na origem.
 */
test('sanitar: a raiz sai COMO FOI PEDIDA, nunca resolvida', () => {
  const dir = repo();
  const r = sanitar(dir);
  assert.ok(r.stdout.indexOf('Sanitacao de ' + dir) !== -1, r.stdout.slice(0, 120));
  const comPonto = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  assert.ok(/^Sanitacao de \.$/m.test(comPonto.stdout),
    'sem --raiz a primeira linha tinha de ser um ponto, nao o caminho absoluto:\n' +
    comPonto.stdout.split('\n')[0]);
});

test('sanitar: sem git NAO devolve 0 - devolve 2, e diz que nao mediu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro sem git-'));
  const r = sanitar(dir);
  assert.strictEqual(r.status, 2, 'dizer "limpo" sobre o que nao leu e o silencio que isto quebra');
  assert.ok(/NAO DEU PARA MEDIR/.test(r.stderr), r.stderr);
});

test('sanitar: sem o vocabulario local o comando DECLARA que roda assim', () => {
  const r = sanitar(repo());
  assert.ok(r.stdout.indexOf('SEM ' + sanit.ARQUIVO_LOCAL) !== -1, r.stdout);
  assert.ok(/NAO estao sendo procurados/.test(r.stdout),
    'rodar so com as genericas e legitimo; nao dizer que rodou assim, nao');

  // Controle: COM vocabulario, o aviso some e a conta diz quantas classes
  // locais rodaram. Aviso impresso sempre e o mesmo silencio, ao contrario.
  const dir = repo();
  fs.writeFileSync(path.join(dir, '.gitignore'), sanit.ARQUIVO_LOCAL + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, sanit.ARQUIVO_LOCAL), JSON.stringify({
    termos: [{ chave: 'sintetica', nome: 'sintetica', padrao: 'MARCA-INTERNA',
               isca: 'x MARCA-INTERNA y', controle: 'outra coisa' }]
  }), 'utf8');
  const com = sanitar(dir);
  assert.strictEqual(com.stdout.indexOf('SEM ' + sanit.ARQUIVO_LOCAL), -1, com.stdout);
  assert.ok(com.stdout.indexOf(sanit.CLASSES_GENERICAS.length +
    ' classes genericas + 1 do vocabulario local') !== -1, com.stdout);
});

/**
 * Decisao 13: so o CONTEUDO reprova a suite. Este e o teste que a prova - e ele
 * precisa de um repositorio que vaze nas superficies 2 e 3 e NAO no conteudo, senao
 * as duas saidas seriam 0 por coincidencia e o --so-conteudo nao mediria nada.
 */
test('sanitar: --so-conteudo julga a superficie 1 e ignora as outras duas', () => {
  const dir = repoComMensagemSuja();
  const tudo = sanitar(dir);
  assert.strictEqual(tudo.status, 1, 'a mensagem suja tinha de reprovar a rodada inteira');
  assert.ok(/SUPERFICIE 3 mensagens\s+1 commits\s+-> 1/.test(tudo.stdout), tudo.stdout);
  // O placar e a lista sao a leitura do relatorio: cada linha diz a SUA
  // superficie, e o achado do historico nao pode sair rotulado como conteudo.
  assert.ok(/SUPERFICIE 1 conteudo\s+1 arquivos\s+-> 0/.test(tudo.stdout), tudo.stdout);
  assert.ok(/SUPERFICIE 2 autoria\s+historico\s+-> 1/.test(tudo.stdout), tudo.stdout);
  assert.ok(/VAZOU - 2 achado/.test(tudo.stdout), tudo.stdout);
  assert.ok(/^ {2}S2 {2}autoria_do_historico /m.test(tudo.stdout), tudo.stdout);
  assert.ok(/^ {2}S3 {2}email /m.test(tudo.stdout), tudo.stdout);

  const so1 = sanitar(dir, ['--so-conteudo']);
  assert.strictEqual(so1.status, 0,
    'a suite roda em copia SEM historico: mensagem de commit nao pode reprova-la');
  assert.ok(/LIMPO no conteudo/.test(so1.stdout), so1.stdout);
});

/**
 * O instrumento antes do que ele mede. Se o autoteste do detector falha, nao ha
 * veredito nenhum a dar - e dar 'limpo' seria a pior saida possivel, porque e a
 * que ninguem confere.
 */
test('sanitar: detector que nao se prova NAO da veredito - saida 2', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, sanit.ARQUIVO_LOCAL), JSON.stringify({
    termos: [{ chave: 'quebrada', nome: 'classe quebrada', padrao: 'NUNCA_CASA_ISTO',
               isca: 'uma isca que o padrao nao acha', controle: 'outra coisa' }]
  }), 'utf8');
  const r = sanitar(dir);
  assert.strictEqual(r.status, 2, 'detector sem prova nao pode devolver 0 nem 1');
  assert.ok(/O DETECTOR NAO SE PROVOU/.test(r.stderr), r.stderr);
  assert.ok(/controle positivo/.test(r.stderr), r.stderr);
});

// ── a superficie AUTORIA: nenhuma excecao carregando peso ────────────────

/**
 * Decisao 20 do plano: publica-se sob o usuario, nao sob o nome civil. A
 * consequencia mecanica e esta - com o nome trocado, NENHUMA excecao precisa
 * existir. Excecao que segura um achado de verdade e um buraco declarado, e um
 * buraco declarado que ninguem relê vira um buraco esquecido.
 */
test('sanitacao: nenhuma excecao esta carregando peso', () => {
  const carregando = [];
  LOCAIS.filter((c) => Array.isArray(c.excecaoEm) && c.excecaoEm.length > 0).forEach((c) => {
    const semExcecao = Object.assign({}, c, { excecaoEm: undefined });
    c.excecaoEm.forEach((rel) => {
      let conteudo;
      try { conteudo = fs.readFileSync(path.join(RAIZ, rel), 'utf8'); } catch (e) { return; }
      const achados = sanit.varrerTexto(conteudo, rel, [semExcecao]);
      if (achados.length > 0) carregando.push(c.chave + ' em ' + rel + ' (' + achados.length + ')');
    });
  });
  assert.deepStrictEqual(carregando, [],
    'ha excecao segurando achado de verdade - o arquivo publicado depende dela: ' +
    carregando.join(' | '));
});

/** Controle: o teste acima passa por vacuidade se o instrumento for cego. */
test('sanitacao: o teste acima SABE reconhecer excecao que carrega peso', () => {
  const classe = { chave: 'sintetica', nome: 'sintetica', padrao: /MARCA-INTERNA/g,
                   excecaoEm: ['a/b.txt'] };
  assert.strictEqual(sanit.varrerTexto('x MARCA-INTERNA y', 'a/b.txt', [classe]).length, 0,
    'a excecao tinha de calar o achado');
  const sem = Object.assign({}, classe, { excecaoEm: undefined });
  assert.strictEqual(sanit.varrerTexto('x MARCA-INTERNA y', 'a/b.txt', [sem]).length, 1,
    'sem a excecao tinha de acusar - senao o teste acima nao mede nada');
});

/**
 * O export e auditado ANTES do primeiro commit - e so ali a auditoria ainda
 * serve para alguma coisa, porque depois do push o historico e publico. Um
 * detector que devolvesse 'nao sei' nesse estado empurraria a conferencia para
 * depois do ato irreversivel.
 */
test('sanitar: repositorio SEM commit nenhum e medivel - 0 nao e o mesmo que nao sei', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro sem commit-'));
  spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', shell: false });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'nada aqui\n', 'utf8');
  spawnSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8', shell: false });

  assert.strictEqual(sanit.semCommits(dir), true);
  assert.strictEqual(sanit.semCommits(repo()), false,
    'com commit tinha de ser false: um git log que falhasse passaria por historico vazio');
  assert.deepStrictEqual(sanit.autoresDoHistorico(dir), []);
  assert.deepStrictEqual(sanit.mensagensDoHistorico(dir), []);

  const r = sanitar(dir);
  assert.strictEqual(r.status, 0, 'sem historico nao ha o que vazar: ' + r.stdout + r.stderr);
  assert.ok(/SUPERFICIE 3 mensagens\s+0 commits/.test(r.stdout), r.stdout);
});

/** Controle: pasta que NAO e repositorio continua sendo 'nao sei', nao 'limpo'. */
test('sanitar: pasta que nao e repositorio segue sendo NAO SEI, nao vazio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro nao repo-'));
  assert.strictEqual(sanit.semCommits(dir), false,
    'sem isto, qualquer pasta do disco passaria por repositorio limpo');
  assert.strictEqual(sanit.autoresDoHistorico(dir), null);
});
