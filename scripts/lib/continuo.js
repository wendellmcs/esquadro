'use strict';

/**
 * D466/D467/D468 (0.7.0): menos paradas. A abertura injeta este bloco em toda sessao, no molde do de
 * paralelismo (paralelismo.js). Ligado por padrao (D467): validar pelo proprio agente antes de pedir acao
 * manual ao dono. Sob a chave `modoContinuo` (desligada ate o teste da D465; so o booleano true liga):
 * os gatilhos de CALADOS nao pedem troca de chat (saude.js le a mesma lista) e o agente decide sozinho o
 * tecnico. ASCII puro: sai por hook.
 */
const CHAVE = 'modoContinuo';
const TETO = 1100;

// D468: o que a chave cala. Seguem disparando o tamanho (tokensDeContexto), o alarme e os bloqueios.
const CALADOS = ['revisoesFechadas', 'decisoesDoDono', 'commits', 'turnosComTrabalho', 'arquivosTocados'];

const TITULO = '# esquadro - menos paradas (toda sessao)';
const VALIDAR = '1. Antes de pedir acao manual ao dono, valide voce mesmo: rode o teste, abra o navegador (Claude in Chrome ou CDP), leia o resultado. Peca so o que so ele pode: credencial, publicar ou implantar, tela com dado de cliente no login dele; e junte tudo num pedido so.';

const LIGADO = [
  '2. Modo continuo ligado: so o tamanho da conversa (aviso e alarme) e os bloqueios de portao pedem troca de chat; revisoes, decisoes, commits, turnos e arquivos nao encerram a sessao.',
  '3. Releia o trecho do plano no arquivo antes de cada subitem.',
  '4. Escolha tecnica dentro do escopo: decida, registre o motivo e liste no fecho. Pergunte ao dono so o irreversivel, o externo (publicar, push, envio), o de custo e o de produto.'
];

/** A chave ligada? So o booleano true (D388/D415): "true" entre aspas nao liga. */
function ativo(projeto) {
  const objeto = !!projeto && typeof projeto === 'object' && !Array.isArray(projeto);
  return objeto && projeto[CHAVE] === true;
}

/** O bloco da abertura: sempre a regra de validar; com a chave, as do modo continuo. */
function bloco(projeto) {
  const ligado = ativo(projeto);
  return [TITULO, '', VALIDAR]
    .concat(ligado ? LIGADO : [])
    .concat(['', ligado
      ? 'Desligar o modo continuo: "' + CHAVE + '": false em .claude/esquadro/projeto.json.'
      : 'Modo continuo (troca de chat so por tamanho, decisao tecnica sem parar): "' + CHAVE + '": true em .claude/esquadro/projeto.json.'])
    .join('\n') + '\n';
}

module.exports = { CHAVE, TETO, CALADOS, ativo, bloco };
