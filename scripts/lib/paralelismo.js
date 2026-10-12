'use strict';

/**
 * D444/D449/D451: a regra de trabalho em paralelo que a abertura injeta em toda sessao, no molde do bloco de
 * qualidade de resposta (qualidade.js). Ela tambem esta na skill portatil, mas a skill so chega quando e chamada
 * (0 de 221 sessoes medidas): por isso o gancho. ASCII puro: sai por hook. O teto de agentes e o mesmo do
 * workflows/paralelo.js (TETO_PADRAO), e um teste confere os dois.
 */
const CHAVE = 'paralelismo';
const TETO = 700;

const BLOCO = [
  '# esquadro - trabalho em paralelo (toda sessao)',
  '',
  '1. Agente em segundo plano: siga com a proxima tarefa que nao depende dele; espere so quando a proxima precisar do resultado.',
  '2. Agentes que editam ao mesmo tempo: cada um isolado (isolation: worktree). Relatorio de agente e alegacao: confira o critico na fonte.',
  '3. Freio de custo: o modelo mais barato que resolve; no maximo 8 agentes por disparo.',
  '4. 3 ou mais tarefas independentes: ofereca o /esquadro:paralelo dizendo quantos agentes, qual modelo e o custo; so rode depois do sim.',
  '',
  'Desligar neste projeto: "' + CHAVE + '": false em .claude/esquadro/projeto.json.'
].join('\n') + '\n';

/** O bloco, ou null quando o projeto desligou. So o booleano `false` desliga (D388/D415). */
function bloco(projeto) {
  const objeto = !!projeto && typeof projeto === 'object' && !Array.isArray(projeto);
  return objeto && projeto[CHAVE] === false ? null : BLOCO;
}

module.exports = { CHAVE, TETO, BLOCO, bloco };
