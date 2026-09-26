---
name: aprender
description: Transforma uma correcao do usuario em regra proposta no formato gatilho -> acao, mostra pronta, e so grava depois de aprovacao explicita. Use quando o usuario corrigir o seu comportamento e a correcao valer para as proximas vezes.
argument-hint: "[a correcao, em uma frase]"
---

# `/esquadro:aprender` — proposta, nunca gravação automática

O plugin **não aprende sozinho.** Ninguém no mercado tem isso, e prometê-lo é promessa que não se
cumpre. O que ele faz é transformar correção em proposta, e esperar o OK.

Motivo do portão, dito sem rodeio: **eu leio correção errado com frequência.** Uma correção mal
entendida gravada sozinha vira lei permanente que passa a me guiar todo dia — e o próprio agente
passaria a escrever o arquivo que o governa.

## Passo 1 — separar o que foi corrigido do que eu entendi

Escreva as duas coisas, lado a lado, para o usuário conferir:

- **O que você disse:** <a frase dele, literal>
- **O que eu entendi:** <a sua leitura, em uma frase>

Se as duas não baterem, ele corrige agora e não daqui a um mês.

## Passo 2 — transformar em `gatilho → ação`

Proibição solta decai com contexto longo; gatilho é convocado pela própria ação.

| Ruim | Bom |
|---|---|
| "não faça hardening não solicitado" | "ao encontrar problema de segurança fora do escopo → registrar e avisar, nunca corrigir" |
| "cuidado com Windows" | "ao escrever comando de shell → usar o shell declarado em `projeto.json`" |

Nada de fato volátil: versão, flag, preço, nome de modelo, nome de evento. O validador recusa.

## Passo 3 — propor, sem gravar

    node "${CLAUDE_PLUGIN_ROOT}/scripts/propor-regra.js" --gatilho "<quando>" --acao "<o que fazer>"

Cole a saída. Ela diz, com todas as letras, que **não gravou nada**.

## Passo 4 — pedir a decisão, em 3 opções

Use `AskUserQuestion`, com a recomendada em primeiro lugar e marcada:

- **Gravar como está** — vira regra deste projeto e volta em toda sessão a partir de agora.
- **Ajustar o texto antes** — você reescreve e propõe de novo; nada é gravado nesta rodada.
- **Não gravar** — vale só para esta conversa, e some quando ela fechar.

## Passo 5 — gravar, só depois do OK

    node "${CLAUDE_PLUGIN_ROOT}/scripts/propor-regra.js" --gatilho "…" --acao "…" --gravar

Cole a saída, que traz o total de regras. **Se o número de regras passar de ~40, avise o usuário:**
arquivo de regra grande dilui a atenção e acelera exatamente a doença que veio curar.
