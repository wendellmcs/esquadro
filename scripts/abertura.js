#!/usr/bin/env node
'use strict';
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const git = require('./lib/git.js');
const fs = require('node:fs');
const path = require('node:path');
const regra = require('./lib/regra.js');
const config = require('./lib/config.js');
const textoLib = require('./lib/texto.js');
const escopoLib = require('./lib/escopo.js');

/**
 * S8/L2-abe-1: caminho que o AGENTE vai copiar para o shell. Aspas duplas servem ao caso normal (espaco,
 * acento, `\` do Windows); com `$`, crase ou `"` o shell reinterpretaria o pedaco, entao vai entre aspas
 * simples (vale no Bash e no PowerShell). Com `'` tambem, so sobra escapar para o Bash.
 */
function caminhoParaShell(p) {
  if (!/[$`"]/.test(p)) return '"' + p + '"';
  if (p.indexOf("'") === -1) return "'" + p + "'";
  return '"' + p.replace(/([\\$`"])/g, '\\$1') + '"';
}

/**
 * S8/A2-4: a reinjecao avisa do projeto.json ilegivel quando ha regras a reinjetar (`nucleo` sai antes sem
 * regras.md ou sem nenhuma regra). Saber isso pela ESTRUTURA, e nao procurando a frase dela no texto, e o que
 * impede o aviso de dobrar se a frase for reescrita.
 */
function reinjecaoJaAvisou(cwd) {
  try {
    return regra.parseRegras(fs.readFileSync(path.join(cwd, '.claude', 'esquadro', 'regras.md'), 'utf8')).length > 0;
  } catch (erro) { return false; }
}

const MARCA_REFERENCIA = 'referencia-avisada.json';

/**
 * D503 (plano d503, Tarefa 6): o aviso de que falta a referencia de topo, uma vez por projeto. So com o projeto.json
 * lido e sem a chave; a marca gravada diz que ja avisou. Marca que nao se grava nao derruba nada: a proxima abertura
 * avisa de novo. R5: ASCII, o texto chega ao Claude.
 */
function avisoDaReferencia(cwd, projeto) {
  if (!projeto || 'referencias' in projeto) return null;
  const marca = config.caminhoEmEsquadro(cwd, MARCA_REFERENCIA);
  if (fs.existsSync(marca)) return null;
  try { fs.writeFileSync(marca, JSON.stringify({ avisadoEm: new Date().toISOString() }) + '\n', 'utf8'); } catch (e) { /* avisa de novo */ }
  return 'esquadro: este projeto nao declara a referencia de topo (chave referencias do .claude/esquadro/projeto.json): ' +
    'a melhor peca que existe para cada tipo de entrega (tela, codigo, texto), que o /esquadro:revisar poe ao lado do ' +
    'trabalho e contra a qual o fecho da entrega AAA cobra a revisao. Para declarar, rode /esquadro:init de novo (Passo 4b) ' +
    'ou ponha a chave a mao; para nunca usar, grave "referencias": {}. Este aviso sai uma vez so.';
}

io.blindar(function () {
  io.lerEntrada(function (e) {
    const cwd = config.raizDoProjeto(e.cwd || process.cwd());
    estado.alterar(e.session_id, function (s) {
      // D17: a foto e tirada uma vez, na abertura. Arquivo que ja estava
      // modificado aqui pertence a outra frente ate prova em contrario.
      // D46: o SessionStart tambem dispara em `compact` e em `resume`, com o
      // MESMO session_id. Sem esta guarda a foto seria refeita com o git status
      // ATUAL, que ja contem o trabalho do proprio agente - e depois de uma
      // compactacao de contexto o agente ficaria barrado nos proprios arquivos.
      // A guarda olha a foto, nao a origem: origem nova no harness nao deixa
      // a trava muda sem avisar.
      if (Array.isArray(s.gitAbertura)) return s;
      const foto = git.modificados(cwd);
      // D49: `null` e "nao consegui fotografar" (git ausente, fora de repo,
      // timeout); `[]` e "arvore limpa". Congelar uma foto que falhou deixaria a
      // trava 5b muda pelo resto da sessao, em silencio - e uma reabertura
      // (`compact`, `resume`) e justamente a segunda chance de conseguir.
      if (foto === null) return s;
      s.gitAbertura = foto;
      s.abertoEm = e.source || null;
      return s;
    });
    // A2: stdout de abertura de sessao entra como contexto que o Claude ve.
    // Roda em toda reabertura de proposito: e depois da compactacao que a regra
    // se perde, e e por isso que ela se reinjeta em vez de so se ler uma vez.
    const projeto = config.carregarProjeto(cwd);
    const texto = require('./lib/reinjecao.js').montar(cwd, e.session_id, e.source);
    if (texto) process.stdout.write(texto);
    // D420/PT-04: projeto.json PRESENTE e ilegivel (config devolve null igual ao ausente) so era
    // avisado dentro da reinjecao, que sai antes quando nao ha regras.md - e os portoes de
    // escopo/intocaveis ficavam desligados sem ninguem saber. Aqui o aviso sai com ou sem regras;
    // quando a reinjecao ja o disse, nao dobra. Falha aberta de proposito: so a mensagem.
    if (!projeto && fs.existsSync(config.caminhoEmEsquadro(cwd, 'projeto.json')) &&
        !reinjecaoJaAvisou(cwd)) {
      process.stdout.write((texto ? '\n' : '') + 'esquadro: .claude/esquadro/projeto.json existe mas nao se le: ' +
        'os portoes de escopo e de intocaveis estao DESLIGADOS ate corrigir. ' +
        'Corrija o JSON (virgula sobrando, aspas) ou rode /esquadro:init de novo.\n');
    }
    // Qualidade de resposta: sai em toda abertura, com ou sem projeto.json, depois das regras;
    // so `qualidadeDeResposta: false` no projeto desliga.
    // D451: a regra de paralelismo, antes da qualidade e no mesmo molde; so `paralelismo: false` desliga.
    const paralelo = require('./lib/paralelismo.js').bloco(projeto);
    if (paralelo) process.stdout.write((texto ? '\n' : '') + paralelo);
    // D467: menos paradas, entre paralelismo e qualidade; sai sempre (com a chave modoContinuo, com o modo continuo).
    const continuo = require('./lib/continuo.js').bloco(projeto);
    process.stdout.write((texto || paralelo ? '\n' : '') + continuo);
    const qualidade = require('./lib/qualidade.js').bloco(projeto);
    if (qualidade) process.stdout.write('\n' + qualidade);
    // D554 (0.9.0): menos codigo, por ultimo, no mesmo molde; so `menosCodigo: false` desliga.
    const enxuto = require('./lib/enxuto.js').bloco(projeto);
    if (enxuto) process.stdout.write('\n' + enxuto);
    const heranca = require('./lib/escopo.js').avisoHeranca(cwd, estado.ler(e.session_id).frente);
    if (heranca) process.stdout.write('\n' + heranca + '\n');

    // O buraco que a D104 mediu e deixou aberto: `intocaveis` com typo fica
    // INERTE em silencio - nao e erro de tipo nem de sintaxe, entao nenhum
    // validador ve. Confere-se UMA vez por sessao, aqui, porque exige listar o
    // repositorio e os portoes de custo zero nao podem pagar isso a cada escrita.
    const projetoLib = require('./lib/projeto.js');
    const rastreados = git.rastreados(cwd);
    const inertes = projetoLib.intocaveisInertes(projeto, rastreados, cwd);
    // F1-C12: `null` e "o git nao respondeu" - e nao e "nenhum inerte". Calar aqui
    // fazia "nao sei" parecer "esta tudo certo". So se diz quando ha o que duvidar.
    if (rastreados === null && projeto && Array.isArray(projeto.intocaveis) && projeto.intocaveis.length) {
      process.stdout.write('\nesquadro: nao sei se ha intocavel inerte (o git nao respondeu).\n');
    }
    if (inertes.length) {
      process.stdout.write('\n' + projetoLib.motivoInerte(inertes) + '\n');
    }
    // D442/5 (S-35, S-68): o aviso de tipo so saia na primeira escrita (portao-escopo), e o dono que pos
    // `"sugerirAprender": "false"` achava que tinha desligado. So o booleano decide (D388, D415).
    const tipos = projetoLib.avisosDeTipo(projeto);
    if (tipos.length) {
      process.stdout.write('\nesquadro: ATENCAO - valor de tipo errado em .claude/esquadro/projeto.json: ' + tipos.join('; ') +
        '. Para ligar ou desligar vale so true ou false, sem aspas: "false" entre aspas NAO desliga.\n');
    }
    // D503 (plano d503, Tarefa 6): sem a chave `referencias`, avisa uma vez por projeto; a marca fica em
    // .claude/esquadro/ (como a da auditoria, depois da foto do git). Com a chave, ate `{}`, calada.
    const avisoRef = avisoDaReferencia(cwd, projeto);
    if (avisoRef) process.stdout.write('\n' + avisoRef + '\n');
    // A2 (D426): auditoria periodica. Depois da foto do git (a marca nao entra nela) e antes do plano
    // ativo, que segue por ultimo. A lib ja nao lanca; o try/catch aqui e a segunda rede, para que
    // nada da auditoria derrube o resto da abertura.
    try {
      const auditoriaTexto = require('./lib/auditoria-periodica.js').avisoDaAuditoria(cwd, projeto);
      if (auditoriaTexto) process.stdout.write('\n' + auditoriaTexto + '\n');
      // Pedido 32 (Tarefa 4 subitem 3): a marca da sessao que acende o botao do /esquadro:auditar na faixa do mod. Plano
      // 091 T6: so com a ordem de cortar (a retroalimentacao sozinha nao pede nada), e ai conta a ordem dada.
      if (require('./lib/auditoria-periodica.js').pedeCorte(auditoriaTexto)) {
        estado.alterar(e.session_id, function (s) { s.auditoriaAvisou = true; s.ordensPendentes = require('./lib/ordens.js').marcarDada(s, 'auditar'); return s; });
      }
    } catch (erro) {
      // S8/A2-3: aqui chega falha do `require` da lib (ela propria ja nao lanca) ou, desde o plano 091 T6, da marca
      // da sessao depois do aviso impresso. Calar deixava a auditoria morta para sempre sem ninguem saber; uma linha
      // diz que nao rodou inteira e por que. A abertura segue.
      process.stdout.write('\nesquadro: auditoria automatica nao rodou inteira (' +
        escopoLib.ascii(textoLib.causaDoErro(erro)).slice(0, 120) + '). O resto da abertura segue igual.\n');
    }
    // Plano 091 (#4, D559): ordem de calibrar (30+ conversas, nunca calibrado). A lib nao lanca; a rede e a do vigia.
    try {
      const calibrar = require('./lib/ordens.js').ordemDoCalibrar(cwd, projeto);
      if (calibrar) {
        process.stdout.write('\n' + calibrar + '\n');
        estado.alterar(e.session_id, function (s) { s.ordensPendentes = require('./lib/ordens.js').marcarDada(s, 'calibrar'); return s; });
      }
    } catch (erro) {
      // Como a auditoria (S8/A2-3): calar esconderia a ordem morta. O botao do calibrar segue na faixa.
      process.stdout.write('\nesquadro: ordem do calibrar nao rodou inteira (' +
        escopoLib.ascii(textoLib.causaDoErro(erro)).slice(0, 120) + '). O resto da abertura segue igual.\n');
    }
    // Plano 091 (#7, D559): sem projeto.json, ordem de perguntar o init. Uma vez por sessao: a reabertura (compact,
    // resume) nao repete; o "depois" e a sessao seguinte.
    try {
      if (!estado.ler(e.session_id).ordemDoInit) {
        const init = require('./lib/ordens.js').ordemDoInit(cwd, projeto, {
          comandoNunca: 'node ' + caminhoParaShell(path.join(__dirname, 'recusar-init.js')) + ' ' + caminhoParaShell(cwd)
        });
        if (init) {
          process.stdout.write('\n' + init + '\n');
          estado.alterar(e.session_id, function (s) { s.ordemDoInit = true; s.ordensPendentes = require('./lib/ordens.js').marcarDada(s, 'init'); return s; });
        }
      }
    } catch (erro) {
      // Idem; se a marca da sessao nao gravou, a ordem pode sair de novo na reabertura, e esta linha diz por que.
      process.stdout.write('\nesquadro: ordem do init nao rodou inteira (' +
        escopoLib.ascii(textoLib.causaDoErro(erro)).slice(0, 120) + '). O resto da abertura segue igual.\n');
    }
    // Bloco V (D426/D437): a novidade da semana do vigia. So le o disco (D148: gancho nenhum abre rede);
    // opt-in por `"vigia": true`; sem a chave so liga no repositorio do plugin (plano 091 #10, pelo cwd cru: a raiz
    // do projeto.json pode ser outra pasta acima). Mesma segunda rede da auditoria.
    try {
      const vigiaTexto = require('./lib/vigia-local.js').avisoDoVigia(projeto, { cwd: e.cwd || process.cwd() });
      if (vigiaTexto) process.stdout.write('\n' + vigiaTexto + '\n');
    } catch (erro) {
      process.stdout.write('\nesquadro: vigia nao rodou (' +
        escopoLib.ascii(textoLib.causaDoErro(erro)).slice(0, 120) + '). O resto da abertura segue igual.\n');
    }
    const planoLib = require('./lib/plano.js');
    const ativo = planoLib.lerAtivo(cwd);
    if (planoLib.donoOutro(ativo, e.session_id)) {
      process.stdout.write([
        '',
        '# esquadro - ATENCAO: outra sessao detem o plano ativo',
        '',
        'Plano: ' + ativo.arquivo,
        'Dono registrado: ' + ativo.sessionId + ' (esta sessao e outra).',
        '',
        'Nao edite esse arquivo nem o log de decisoes sem combinar com o dono.',
        'Numero de decisao se le do disco:',
        '  node ' + caminhoParaShell(path.join(__dirname, 'plano.js')) + ' --proxima-decisao <arquivo>',
        ''
      ].join('\n'));
    }
    process.exit(0);
  });
});
