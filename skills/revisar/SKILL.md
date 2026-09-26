---
name: revisar
description: Revisao cega A/B de um arquivo mudado. Rotula os dois lados sem autoria, despacha inspetores de lentes distintas com default reprovar, e apura por script com teto de 3 rondas. Use quando o trabalho estiver escrito e antes de dar por pronto.
argument-hint: "<caminho do arquivo mudado>"
---

# `/esquadro:revisar` — a revisão cega

Falha de origem: **eu sou otimista ao julgar o meu próprio código.** Gerador e avaliador têm os
mesmos pesos; quando eu reviso o que escrevi, eu não leio o código, eu re-derivo o raciocínio que o
produziu — e o raciocínio que produziu o bug reproduz o bug.

## Passo 1 — preparar o pacote cego

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preparar-revisao.js" --arquivo <caminho>

O script escreve `A.txt`, `B.txt` e `mapa.json` em `.claude/esquadro/revisao/<n>/`.
**Você não abre `mapa.json`, e nenhum inspetor recebe o caminho dele.**

Entregue o **arquivo inteiro** ao inspetor. Fatia que corta função no meio faz o inspetor reportar o
corte como defeito e contamina a ronda.

## Passo 2 — ronda 1: as lentes da família certa

**Duas famílias, por decisão do dono.** Elas divergem **por desenho**:
a de código julga código, a de UI julga tela. Não se fundem.

| O que mudou | Quantos inspetores | Onde estão as lentes |
|---|---|---|
| Só código | **9** | `scripts/lib/veredito.js` → `LENTES` |
| Só tela | **8** | `scripts/lib/veredito.js` → `LENTES_UI` |
| Código e tela | **17** | as duas listas |

**A mudança toca tela** quando o escopo declarado inclui arquivo de estilo
(`scripts/lib/design.js` → `ehArquivoDeEstilo`) ou markup que o projeto renderiza.
Na dúvida, **as duas famílias** — a marcha mais rigorosa ganha.

Leia as lentes do arquivo, **não de memória**. Despache todos no mesmo disparo, **um subagente
`esquadro:inspetor` por lente**.

Briefing de cada um, exatamente nesta forma:

> Sua lente é **<titulo>**: <pergunta>.
> Leia apenas estes dois arquivos: `<caminho de A.txt>` e `<caminho de B.txt>`.
> Não abra o repositório. Não abra `mapa.json`. Devolva só o JSON do seu formato.

Grave cada resposta em `.claude/esquadro/revisao/<n>/vereditos/<lente>.json`.

**Declare ao usuário quantos agentes rodaram.** Custo é informação dele, não detalhe seu.

## Passo 3 — apurar por script, nunca por julgamento

    node "${CLAUDE_PLUGIN_ROOT}/scripts/apurar-ronda.js"

Quem decide se a ronda foi seca é o script, não você. Cole a saída dele na resposta.

Quando a revisão **fecha**, o próprio script conta um `revisao_fechada` — é o gatilho contável de
troca de chat, e nada mais no plugin o incrementa. Ele descobre a sessão sozinho; passe
`--sessao <id>` só se precisar forçar. A saída traz `revisaoFechadaContada` para você conferir.

## Passo 4 — rondas seguintes

- **Ronda 1 descobre; as seguintes verificam.**
- A ronda 2 chama **só as lentes que acharam P0 ou P1**, com o briefing reformulado em pergunta
  específica sobre o próprio achado. Ordem de grandeza: **9 → 4 → 2**.
- Antes de cada nova ronda, corrija o que a anterior achou e rode `preparar-revisao.js` de novo.

## Passo 5 — parar

O `apurar-ronda.js` diz quando parar. Três saídas possíveis:

| `motivo` | O que você faz |
|---|---|
| duas rondas secas | Aprovado. Feche dizendo quantos agentes rodaram, em quantas rondas |
| teto de 3 rondas com P0/P1 aberto | **Para.** Leva ao dono com exatamente 3 opções, a recomendada marcada. O que sobrar vira registro |
| ainda não encerrou | Corrige e roda a próxima ronda |

## O que esta revisão não faz

- **Não julga se a interface ficou bonita.** Sem print, a lente visual responde "vaza?" e não
  responde "está bom?". Dito agora, não descoberto no fim.
- **A cegueira é parcial.** Contagem de linhas e comentário de correção entregam qual lado é o novo.
  Por isso o placar A/B é **sinal**, e o achado com `arquivo:linha` é a **prova** — ele se sustenta
  mesmo que o inspetor tenha adivinhado os lados.
- **P2 não vira correção.** Achado fora do escopo do pedido é registro. Qualidade máxima se aplica ao
  que foi pedido, jamais à ampliação do pedido.
