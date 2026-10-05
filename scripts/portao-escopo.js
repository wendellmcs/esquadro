#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./lib/io.js');
const estado = require('./lib/estado.js');
const config = require('./lib/config.js');
const caminhoLib = require('./lib/caminho.js');
const marchaLib = require('./lib/marcha.js');
const escopoLib = require('./lib/escopo.js');
const glob = require('./lib/glob.js');
const projetoLib = require('./lib/projeto.js');
const design = require('./lib/design.js');
const buscaLib = require('./lib/busca.js');
const catraca = require('./lib/catraca.js');

/** C9: o alvo ja existe? Se nao existe, isto e criacao, e criacao exige busca. */
function existe(cwd, alvo) {
  try { return fs.existsSync(path.join(cwd, alvo)); } catch (err) { return true; }
}

/**
 * X2a: o aviso pega CARONA num `permitir` que ja ia acontecer. Um
 * `io.permitir({systemMessage})` novo na "posicao natural" - antes do passo 1 -
 * derrubava a protecao de `intocaveis`, porque `permitir` sai do portao.
 * Uma vez por sessao, como o `avisouSemConfig` do passo 3, abaixo.
 */
function permitirComAviso(e, s, avisos) {
  if (avisos.length && !s.avisouTipoErrado) {
    estado.alterar(e.session_id, function (x) { x.avisouTipoErrado = true; return x; });
    return io.permitir({ systemMessage: 'esquadro: projeto.json com campo de tipo errado: ' + avisos.join('; ') });
  }
  return io.permitir();
}

io.blindar(function () {
  io.lerEntrada(function (e) {
    const cwd = config.raizDoProjeto(e.cwd || process.cwd());
    const entrada = e.tool_input || {};
    const alvo = caminhoLib.relativoAoProjeto(entrada.file_path, cwd);
    if (!alvo) return io.permitir();

    // Escopo por frente: o arquivo de UMA frente tem o mesmo passe livre do
    // escopo.md (logo abaixo) e vincula a sessao a ela. Nome fora da classe
    // [a-zA-Z0-9_-] e negado sem gravar nada: sem isto o arquivo seria escrito
    // com um nome e o leitor procuraria outro, e a sessao acharia que esta
    // vinculada sem estar.
    const frenteAlvo = escopoLib.frenteDoAlvo(alvo);
    if (frenteAlvo && !frenteAlvo.valido) {
      estado.incrementar(e.session_id, 'frente_invalida');
      return io.negarFerramenta(escopoLib.motivoNomeDeFrente(alvo));
    }

    // D35: o passe livre e do ARQUIVO de escopo, nao da pasta. Sem ele nao ha
    // como declarar escopo; com ele largo demais, projeto.json e contadores.json
    // ficariam gravaveis sem portao e sem contagem.
    // D38: comparacao sem diferenciar caixa - o sistema de arquivos nao diferencia,
    // e "Escopo.md" nao pode escapar do passe livre so por causa da letra.
    if (alvo.toLowerCase() === escopoLib.ARQUIVO || frenteAlvo) {
      // D34: conta a ampliacao tambem na CRIACAO, e so quando a lista "Dentro" cresce.
      let atual = '';
      try { atual = fs.readFileSync(path.join(cwd, alvo), 'utf8'); } catch (err) { atual = ''; }
      const depoisTexto = escopoLib.conteudoDepois(atual, entrada);
      const depois = depoisTexto === null ? null : escopoLib.parse(depoisTexto);
      if (escopoLib.ampliou(escopoLib.parse(atual), depois)) {
        estado.incrementar(e.session_id, 'escopo_ampliado');
      }
      // Ultima frente escrita vence: uma sessao so tem um vinculo por vez.
      if (frenteAlvo) estado.alterar(e.session_id, function (x) { x.frente = frenteAlvo.nome; return x; });
      return io.permitir();
    }

    const projeto = config.carregarProjeto(cwd);
    const s = estado.ler(e.session_id);
    const esc = escopoLib.carregar(cwd, s.frente);
    const arquivoEmVigor = escopoLib.arquivoEmVigor(cwd, s.frente);
    // X2a e X2b sao calculados AQUI, antes de qualquer decisao: nenhuma saida
    // de portao nova e inserida acima do canal de aviso.
    const travas = projetoLib.travasDe(projeto);
    const avisos = projetoLib.avisosDeTipo(projeto);

    // 1. Intocaveis: nega sempre, e o escopo nao libera.
    if (projeto && glob.casaAlgum(projeto.intocaveis, alvo)) {
      estado.incrementar(e.session_id, 'intocavel');
      return io.negarFerramenta(escopoLib.motivoIntocavel(alvo));
    }

    // 2. Trava 5b: arquivo que ja estava modificado quando a sessao abriu (D17).
    // D45: a comparacao ignora a caixa. Mesma razao da D38: o sistema de arquivos
    // do Windows nao diferencia, e sem isto "GUIA.md" escapava da 5b por 1
    // caractere - decisivo em caminho de marcha rapida, onde o passo 5 nem chega
    // a ser avaliado. D49: a dobra acontece AQUI, e nao no git.js, porque a foto
    // tem outro consumidor (a varredura do /esquadro:init) que mostra o nome do
    // arquivo ao dono - e la o nome tem de ser o que esta no disco.
    // X2b: com a trava desligada a 5b nao dispara, e o fluxo SEGUE para os
    // passos 3-5 - nao vira `permitir`. Trava nenhuma pode virar bypass.
    const alvoBaixo = alvo.toLowerCase();
    const deOutraFrente = travas.outraFrente !== false &&
      Array.isArray(s.gitAbertura) && s.gitAbertura.some(function (p) {
      return String(p).toLowerCase() === alvoBaixo;
    });
    if (deOutraFrente && !escopoLib.dentro(alvo, esc)) {
      estado.incrementar(e.session_id, 'outra_frente');
      return io.negarFerramenta(escopoLib.motivoOutraFrente(alvo, arquivoEmVigor));
    }

    // 3. Sem projeto.json o portao de escopo nao roda. Avisa uma vez por sessao.
    if (!projeto) {
      if (!s.avisouSemConfig) {
        estado.alterar(e.session_id, function (x) { x.avisouSemConfig = true; return x; });
        return io.permitir({
          systemMessage: 'esquadro: este projeto nao tem .claude/esquadro/projeto.json. Rode /esquadro:init para ligar o portao de escopo.'
        });
      }
      return io.permitir();
    }

    // 3b. D244/defeito 7: o que o escopo declara FORA e negado em qualquer marcha, e ganha
    // do "Dentro": a declaracao do "nao vou tocar" e a mais especifica das duas.
    const foraDeclarado = escopoLib.declaradoFora(alvo, esc);
    if (foraDeclarado) {
      estado.incrementar(e.session_id, 'fora_declarado');
      return io.negarFerramenta(escopoLib.motivoDeclaradoFora(alvo, foraDeclarado, arquivoEmVigor));
    }

    // 4. Marcha rapida nao exige escopo. Sem burocracia onde nao ha risco.
    const marcha = marchaLib.resolverMarcha(alvo, projeto);
    if (!marchaLib.exigeEscopo(marcha)) return permitirComAviso(e, s, avisos);

    // 5. Marcha padrao ou AAA: escopo declarado, e o arquivo dentro dele.
    if (!esc) {
      estado.incrementar(e.session_id, 'sem_escopo');
      return io.negarFerramenta(escopoLib.motivoSemEscopo(alvo, marcha, arquivoEmVigor));
    }
    if (!escopoLib.dentro(alvo, esc)) {
      estado.incrementar(e.session_id, 'fora_do_escopo');
      return io.negarFerramenta(escopoLib.motivoFora(alvo, marcha, esc, arquivoEmVigor));
    }

    // 6. C9: arquivo NOVO exige ter procurado antes. Editar o que ja existe nao,
    // porque quem edita ja achou. Vem depois do escopo de proposito: "fora do
    // escopo" e a resposta mais especifica, e tem de ganhar quando as duas valem.
    if (!existe(cwd, alvo) && !s.buscouNesteTurno && !buscaLib.nomeadoNoEscopo(alvo, esc)) {
      estado.incrementar(e.session_id, 'criou_sem_buscar');
      return io.negarFerramenta(buscaLib.motivo(alvo));
    }

    // 7. B7: subir a catraca e decisao humana, nunca efeito colateral de uma
    // correcao. So vale para Edit, que e onde ha um "antes" para comparar - em
    // Write de arquivo novo nao existe catraca anterior para afrouxar.
    if (typeof entrada.old_string === 'string' && typeof entrada.new_string === 'string') {
      const frouxo = catraca.afrouxou(entrada.old_string, entrada.new_string);
      if (frouxo.length) {
        estado.incrementar(e.session_id, 'catraca_afrouxada');
        return io.negarFerramenta(catraca.motivo(alvo, frouxo));
      }
    }
    // Modulo opcional: sem .claude/esquadro/design.json, nada dispara.
    if (design.ehArquivoDeEstilo(alvo, projeto)) {
      const sistema = config.carregarDesign(cwd);
      const conteudo = (entrada.content !== undefined) ? entrada.content : entrada.new_string;
      if (sistema && typeof conteudo === 'string') {
        const r = design.conferir(conteudo, sistema);
        if (!r.ok) {
          estado.incrementar(e.session_id, 'token_fora_do_sistema');
          return io.negarFerramenta(design.motivo(alvo, r.fora, sistema));
        }
      }
    }
    permitirComAviso(e, s, avisos);
  });
});
