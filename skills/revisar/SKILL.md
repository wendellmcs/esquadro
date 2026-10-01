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

O script escreve `A.txt`, `B.txt` e `mapa.json` em `.claude/esquadro/revisao/<arquivo>/<n>/`: cada
arquivo tem a sua base (`<arquivo>` é o caminho com `/` trocado por `__`), e `<n>` é a ronda dele. O
caminho exato vem na saída (`a`, `b`, `vereditos` e `base`); use o que a saída diz, não reconstrua.
**Você não abre `mapa.json`, e nenhum inspetor recebe o caminho dele.**

**Vários arquivos = uma base cada.** Prepare, inspecione e apure um arquivo por vez; cada um tem as
suas rondas e o seu teto de 3. Se a saída avisar "formato antigo", há uma revisão da 0.3.0 em
andamento em pastas numeradas soltas: ela segue na base única até acabar.

Entregue o **arquivo inteiro** ao inspetor. Fatia que corta função no meio faz o inspetor reportar o
corte como defeito e contamina a ronda.

## Passo 2 — ronda 1: as lentes da família certa

**Duas famílias, por decisão do dono.** Elas divergem **por desenho**:
a de código julga código, a de UI julga tela. Não se fundem.

| O que mudou | Quantos inspetores | Onde estão as lentes |
|---|---|---|
| Só lógica (não é de estilo e não monta tela) | **8** | `scripts/lib/veredito.js` → `LENTES` sem `design` |
| Só código | **9** | `scripts/lib/veredito.js` → `LENTES` |
| Só tela | **8** | `scripts/lib/veredito.js` → `LENTES_UI` |
| Código e tela | **17** | as duas listas |

**A mudança toca tela** quando o escopo declarado inclui arquivo de estilo
(`scripts/lib/design.js` → `ehArquivoDeEstilo`) ou markup que o projeto renderiza.
Na dúvida, **as duas famílias** — a marcha mais rigorosa ganha.

**Arquivo só de lógica** — que não é de estilo e não monta tela — dispensa a lente `design` (decisão
do dono, 2026-09-29): são 8 inspetores, as de `LENTES` sem a `design`. Na dúvida, as 9 — a
`design` só sai quando é claro que o arquivo não é de estilo e não monta tela.

Leia as lentes do arquivo, **não de memória**. Despache todos no mesmo disparo, **um subagente
`esquadro:inspetor` por lente**.

Briefing de cada um, exatamente nesta forma:

> Sua lente é **<titulo>** (`<chave>`): <pergunta>.
> Leia apenas estes dois arquivos: `<caminho de A.txt>` e `<caminho de B.txt>`.
> Leia também `<caminho de regua.md>`: é a régua do projeto. Achado de valor fora da régua cita o valor dela.
> Pasta de vereditos: `<caminho de vereditos>`. Não a abra: copie o caminho, sem mexer, no campo `vereditos` do JSON, e ponha a chave da lente (`<chave>`) no campo `lente`.
> Não abra o repositório. Não abra `mapa.json`. Devolva só o JSON do seu formato.

A linha da régua só entra quando a saída do Passo 1 traz `regua` com um caminho. Quando traz
`semRegua`, diga ao usuário que a revisão rodou **sem régua do projeto** — o inspetor julgou pelo
bom senso, não pelo sistema declarado.

**Quem grava é o hook** (`scripts/gravar-veredito.js`, no `SubagentStop` do inspetor e no handback do subagente): ele
tira o JSON da resposta e o grava em `<lente>.json` na pasta `vereditos` que o inspetor devolveu, conferindo que é
a de uma ronda. Ele nunca barra e nunca sobrescreve arquivo que já existe. Antes do Passo 3, **confira que há um
arquivo por lente despachada** em `vereditos/` (lista a pasta e conta). O que o hook avisou que não gravou, ou que
não está lá, grave à mão, como `<lente>.json` (a chave da lente), com o JSON que o inspetor devolveu, no caminho
`vereditos` da saída do Passo 1.

**Declare ao usuário quantos agentes rodaram.** Custo é informação dele, não detalhe seu.

## Passo 3 — apurar por script, nunca por julgamento

    node "${CLAUDE_PLUGIN_ROOT}/scripts/apurar-ronda.js" --arquivo <caminho>

O `--arquivo` é o mesmo do Passo 1 e escolhe a base dele. Sem ele, o script acha a base sozinho se
houver uma só; com mais de uma, para com erro que lista os arquivos.

Quem decide se a ronda foi seca é o script, não você. Cole a saída dele na resposta.

- **Só o lado novo molha a ronda.** O script lê o `mapa.json` de cada ronda: P0/P1 citado no lado
  antigo (o que a mudança conserta, ou já existia) sai em `achadosDoLadoAntigo` — informação, não
  bloqueio. Você continua sem abrir o `mapa.json`: quem o lê é o script.
- **Achado refutado na fonte primária** vai em `refutados.json`, na base do arquivo (a pasta `base`
  da saída do Passo 1):
  `[{ "ronda": 2, "lente": "design", "arquivo": "B.txt", "linha": 471, "severidade": "P1", "prova": "<arquivo:linha ou comando>" }]`.
  A `severidade` é a do achado: refutar o P1 de uma linha não derruba o P0 da mesma linha. Sem `prova`
  ou sem `severidade`, o script para com erro. A saída lista os refutados para o dono conferir.

Quando a revisão **fecha**, o próprio script conta um `revisao_fechada` — é o gatilho contável de
troca de chat, e nada mais no plugin o incrementa. Ele descobre a sessão sozinho; passe
`--sessao <id>` só se precisar forçar (o id leva só letras, números, `_` e `-`; sem valor ou com outro
caractere, o script para com erro). A saída traz `revisaoFechadaContada` para você conferir.
Rodar o script de novo numa revisão já fechada **não conta outra vez**: o fecho fica registrado na
base (`fechada.json`) e a saída diz que já foi contada. Preparar de novo um arquivo cuja revisão já
fechou começa **revisão nova**: o `preparar-revisao.js` move a base inteira para
`.claude/esquadro/revisao-fechada/<arquivo>/<carimbo>/` (nada se apaga; a saída diz o destino em
`arquivada`) e a ronda volta a ser a 1, com o teto de 3 inteiro. O fecho da revisão nova conta de novo.

## Passo 4 — rondas seguintes

- **Ronda 1 descobre; as seguintes verificam.**
- A ronda 2 chama **só as lentes que acharam P0 ou P1**, com o briefing reformulado em pergunta
  específica sobre o próprio achado. Ordem de grandeza: **9 → 4 → 2**.
- Se nenhuma lente achou P0 ou P1, a ronda seguinte chama **ao menos uma** (a de correção): ronda sem
  nenhum veredito não é ronda seca, e o `apurar-ronda.js` para com erro.
- Antes de cada nova ronda, corrija o que a anterior achou e rode `preparar-revisao.js` de novo.

## Passo 5 — parar

O `apurar-ronda.js` diz quando parar. Três saídas possíveis:

| `motivo` | O que você faz |
|---|---|
| duas rondas secas | Aprovado. Feche dizendo quantos agentes rodaram, em quantas rondas |
| teto de 3 rondas com P0/P1 aberto | **Para.** Leva ao dono com exatamente 3 opções, a recomendada marcada. O que sobrar vira registro |
| ainda não encerrou | Corrige e roda a próxima ronda |

## Passo 6 — o que não foi inspecionado

O fecho lista **todo arquivo mudado no escopo que não passou por esta revisão**, e por quê
(escolha de custo, arquivo gerado, fora da família de lentes). Arquivo novo passa, com um lado
vazio: diga que nele a cegueira não existe. Silêncio sobre o que não foi inspecionado equivale a
dizer que foi.

## O que esta revisão não faz

- **Não julga se a interface ficou bonita.** Sem print, a lente visual responde "vaza?" e não
  responde "está bom?". Dito agora, não descoberto no fim.
- **A cegueira é parcial.** Contagem de linhas e comentário de correção entregam qual lado é o novo.
  Por isso o placar A/B é **sinal**, e o achado com `arquivo:linha` é a **prova** — ele se sustenta
  mesmo que o inspetor tenha adivinhado os lados.
- **P2 não vira correção.** Achado fora do escopo do pedido é registro. Qualidade máxima se aplica ao
  que foi pedido, jamais à ampliação do pedido.
