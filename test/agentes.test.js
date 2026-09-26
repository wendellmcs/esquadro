'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const agentes = require('../scripts/lib/agentes.js');

function pastaTemporaria() {
  // Espaco E acento no caminho: e o caso normal desta maquina, e e o foco de
  // revisao 5. path.join nunca vira concatenacao de string por causa disto.
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'esquadro projecao-'));
  return p;
}

function escrever(raiz, nome, conteudo) {
  const alvo = agentes.caminho(raiz, nome);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, conteudo, 'utf8');
  return alvo;
}

test('agentes: le chave e valor de primeiro nivel', () => {
  const r = agentes.frontmatter('---\nname: busca\nmodel: barato\n---\n\ncorpo\n');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.campos.name, 'busca');
  assert.strictEqual(r.campos.model, 'barato');
});

test('agentes: BOM e CRLF nao quebram a leitura', () => {
  const r = agentes.frontmatter('\uFEFF---\r\nname: busca\r\nmodel: barato\r\n---\r\n');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.campos.model, 'barato');
});

test('agentes: aspas em volta do valor saem', () => {
  const r = agentes.frontmatter('---\nmodel: "barato"\n---\n');
  assert.strictEqual(r.campos.model, 'barato');
});

// Foco de revisao 4: ausente e vazio sao a MESMA resposta - nao declarado.
test('agentes: model ausente fica undefined, nao string vazia', () => {
  const r = agentes.frontmatter('---\nname: busca\n---\n');
  assert.strictEqual(r.campos.model, undefined);
});

test('agentes: model vazio vira null', () => {
  const r = agentes.frontmatter('---\nname: busca\nmodel:\n---\n');
  assert.strictEqual(r.campos.model, null);
});

test('agentes: arquivo sem cerca nao e frontmatter', () => {
  assert.strictEqual(agentes.frontmatter('# so um titulo\n').ok, false);
});

test('agentes: cerca que abre e nunca fecha nao vale como lida', () => {
  const r = agentes.frontmatter('---\nname: busca\nmodel: barato\n');
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.campos, {});
});

test('agentes: pasta ausente devolve existe:false, nao lista vazia', () => {
  const raiz = pastaTemporaria();
  const r = agentes.listar(raiz);
  assert.strictEqual(r.existe, false);
  assert.deepStrictEqual(r.agentes, []);
});

test('agentes: pasta vazia devolve existe:true com lista vazia', () => {
  const raiz = pastaTemporaria();
  fs.mkdirSync(path.join(raiz, '.claude', 'agents'), { recursive: true });
  const r = agentes.listar(raiz);
  assert.strictEqual(r.existe, true);
  assert.deepStrictEqual(r.agentes, []);
});

test('agentes: le os agentes de uma raiz com espaco e acento no caminho', () => {
  const raiz = pastaTemporaria();
  assert.ok(/ /.test(raiz), 'a raiz de teste precisa ter espaco: ' + raiz);
  escrever(raiz, 'busca', '---\nname: busca\nmodel: barato\n---\n');
  escrever(raiz, 'arquiteto', '---\nname: arquiteto\nmodel: caro\n---\n');
  const r = agentes.listar(raiz);
  assert.strictEqual(r.existe, true);
  assert.deepStrictEqual(r.agentes.map((a) => a.nome), ['arquiteto', 'busca']);
  assert.deepStrictEqual(r.agentes.map((a) => a.model), ['caro', 'barato']);
});

test('agentes: agente sem model: aparece com model null, e nao some da lista', () => {
  const raiz = pastaTemporaria();
  escrever(raiz, 'solto', '---\nname: solto\n---\n');
  const r = agentes.listar(raiz);
  assert.strictEqual(r.agentes.length, 1);
  assert.strictEqual(r.agentes[0].model, null);
  assert.strictEqual(r.agentes[0].temFrontmatter, true);
});

test('agentes: arquivo sem frontmatter entra na lista marcado como tal', () => {
  const raiz = pastaTemporaria();
  escrever(raiz, 'rascunho', '# anotacao qualquer\n');
  const r = agentes.listar(raiz);
  assert.strictEqual(r.agentes[0].temFrontmatter, false);
  assert.strictEqual(r.agentes[0].nome, 'rascunho');
});

const molde = require('../scripts/lib/molde.js');

const PROJETO_ENSAIO = {
  versaoConfig: 1, quemDecide: 'dono', provaDePronto: 'npm test',
  modeloDeAmeaca: 'interno', marchas: {}, intocaveis: [], fontesCanonicas: [],
  marchaPadrao: 'padrao', limiares: {}, agentes: { escada: [] }
};

function moldeDoAgente() {
  return fs.readFileSync(path.join(__dirname, '..', 'modelos', 'agente.md'), 'utf8');
}

test('agentes: o molde do agente preenche e valida', () => {
  const texto = moldeDoAgente();
  const valores = {};
  for (const s of molde.slots(texto)) {
    if (s.tipo === 'texto') valores[s.nome] = 'conteudo de ensaio para ' + s.nome;
  }
  const cheio = molde.preencher(texto, valores, PROJETO_ENSAIO);
  const r = molde.validar(cheio);
  assert.strictEqual(r.ok, true, r.erros.join(' | '));
});

test('agentes: o molde produz frontmatter que o proprio leitor consegue ler', () => {
  const texto = moldeDoAgente();
  const valores = {};
  for (const s of molde.slots(texto)) {
    if (s.tipo === 'texto') valores[s.nome] = 'ensaio';
  }
  valores.nome = 'busca';
  valores.apelido = 'barato';
  const cheio = molde.preencher(texto, valores, PROJETO_ENSAIO);
  const f = agentes.frontmatter(cheio);
  assert.strictEqual(f.ok, true, 'o molde tem de gerar frontmatter valido');
  assert.strictEqual(f.campos.name, 'busca');
  assert.strictEqual(f.campos.model, 'barato');
});

// Decisao 12, pela segunda vez e de proposito: a T33 recusa o id na entrevista,
// e o molde recusa de novo na geracao. Duas guardas porque o arquivo gerado sai
// da mao do agente e vai direto para a pasta de configuracao da pessoa.
test('agentes: id de modelo no apelido faz a GERACAO ser recusada', () => {
  const texto = moldeDoAgente();
  const valores = {};
  for (const s of molde.slots(texto)) {
    if (s.tipo === 'texto') valores[s.nome] = 'ensaio';
  }
  valores.apelido = 'claude-haiku-4-5';
  const cheio = molde.preencher(texto, valores, PROJETO_ENSAIO);
  const r = molde.validar(cheio);
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('volatil')), r.erros.join(' | '));
});

const { spawnSync } = require('node:child_process');

const GERADOR = path.join(__dirname, '..', 'scripts', 'gerar-agentes.js');

function semearProjeto(raiz, degraus) {
  const dir = path.join(raiz, '.claude', 'esquadro');
  fs.mkdirSync(dir, { recursive: true });
  const cfg = Object.assign({}, PROJETO_ENSAIO, {
    geradoEm: '2026-09-23',
    plataforma: { so: process.platform, shell: 'bash' },
    comandosBloqueados: [], comandosLiberados: [],
    travas: { fecho: true, escopo: true, destrutivo: true, outraFrente: true },
    agentes: require('../scripts/lib/degraus.js').paraProjeto(degraus)
  });
  fs.writeFileSync(path.join(dir, 'projeto.json'), JSON.stringify(cfg, null, 2), 'utf8');
}

/** As fatias de texto do molde, uma copia por degrau. O nome e o apelido NAO
 *  entram aqui: saem do projeto.json, e o gerador os injeta. */
function respostasEmArquivo(raiz, nomes) {
  const texto = moldeDoAgente();
  const porAgente = {};
  for (const nome of nomes) {
    porAgente[nome] = {};
    for (const s of molde.slots(texto)) {
      if (s.tipo === 'texto') porAgente[nome][s.nome] = 'conteudo de ensaio para ' + s.nome;
    }
  }
  const alvo = path.join(raiz, 'respostas.json');
  fs.writeFileSync(alvo, JSON.stringify(porAgente), 'utf8');
  return alvo;
}

function rodar(raiz, args) {
  return spawnSync(process.execPath, [GERADOR].concat(args || []), { cwd: raiz, encoding: 'utf8' });
}

const DOIS = [{ agente: 'busca', apelido: 'barato' }, { agente: 'arquiteto', apelido: 'caro' }];

test('agentes: sem --gravar o gerador propoe e NAO escreve arquivo nenhum', () => {
  const raiz = pastaTemporaria();
  semearProjeto(raiz, DOIS);
  const r = rodar(raiz, ['--respostas', respostasEmArquivo(raiz, ['busca', 'arquiteto'])]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('PROPOSTA'), r.stdout);
  assert.strictEqual(fs.existsSync(agentes.caminho(raiz, 'busca')), false, 'proposta nao grava');
});

test('agentes: com --gravar escreve um arquivo por degrau, na pasta certa', () => {
  const raiz = pastaTemporaria();
  semearProjeto(raiz, DOIS);
  const r = rodar(raiz, ['--respostas', respostasEmArquivo(raiz, ['busca', 'arquiteto']), '--gravar']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(agentes.caminho(raiz, 'busca')), r.stdout);
  assert.ok(fs.existsSync(agentes.caminho(raiz, 'arquiteto')), r.stdout);
  const lido = agentes.listar(raiz);
  assert.deepStrictEqual(lido.agentes.map((a) => a.model), ['caro', 'barato']);
});

test('agentes: agente que ja existe e PULADO, e o gerador diz que pulou', () => {
  const raiz = pastaTemporaria();
  semearProjeto(raiz, DOIS);
  escrever(raiz, 'busca', '---\nname: busca\nmodel: nao-mexa\n---\ntrabalho de alguem\n');
  const r = rodar(raiz, ['--respostas', respostasEmArquivo(raiz, ['busca', 'arquiteto']), '--gravar']);
  assert.ok(r.stdout.includes('PULADO'), r.stdout);
  const lido = fs.readFileSync(agentes.caminho(raiz, 'busca'), 'utf8');
  assert.ok(lido.includes('trabalho de alguem'), 'o arquivo de alguem foi sobrescrito');
});

test('agentes: escada desalinhada faz o gerador parar antes de escrever', () => {
  const raiz = pastaTemporaria();
  semearProjeto(raiz, DOIS);
  const cfgPath = path.join(raiz, '.claude', 'esquadro', 'projeto.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.agentes.escada = ['arquiteto', 'busca'];   // ordem trocada de proposito
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  const r = rodar(raiz, ['--respostas', respostasEmArquivo(raiz, ['busca', 'arquiteto']), '--gravar']);
  assert.strictEqual(r.status, 1, r.stdout);
  assert.strictEqual(fs.existsSync(agentes.caminho(raiz, 'busca')), false, 'nao pode escrever com escada torta');
});

test('agentes: projeto sem projeto.json para com erro legivel', () => {
  const raiz = pastaTemporaria();
  const r = rodar(raiz, ['--gravar']);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stdout.includes('init'), r.stdout);
});

// O gerador recusa ANTES de propor quando falta resposta, e diz o que falta.
// Mesmo desenho do scripts/gerar-skill.js, que ja existia - e foi um ensaio em
// sandbox que mostrou que a versao anterior deste teste media a coisa errada.
test('agentes: sem respostas o gerador recusa e nomeia a fatia que falta', () => {
  const raiz = pastaTemporaria();
  semearProjeto(raiz, DOIS);
  const r = rodar(raiz, []);
  assert.strictEqual(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('RECUSADO'), r.stdout);
  assert.ok(r.stdout.includes('papel'), 'tem de dizer QUAL fatia falta: ' + r.stdout);
  assert.strictEqual(fs.existsSync(agentes.caminho(raiz, 'busca')), false);
});
