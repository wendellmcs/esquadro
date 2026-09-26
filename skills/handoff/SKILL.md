---
name: handoff
description: Gera o texto de continuacao para um chat novo, com tudo que o proximo precisa para continuar exatamente de onde parou. Use quando um gatilho contavel de saude de contexto disparar, quando fechar uma etapa de plano longo, ou quando o usuario pedir.
argument-hint: "[nome curto do trabalho]"
---

# `/esquadro:handoff` — a ponte entre chats

O desvio começa quando o plano passa a ser executado de memória. **Handoff é ponte entre chats, não
substituto do plano.**

## Passo 1 — conferir os fatos no disco, não na memória

Rode, e cole a saída:

    git -C . rev-parse HEAD
    git -C . rev-parse --abbrev-ref HEAD
    git -C . status --short
    node "${CLAUDE_PLUGIN_ROOT}/scripts/uso.js"

**Número que vai para o handoff se lê do disco.** Nunca do handoff anterior, e nunca de memória.

## Passo 2 — escrever o arquivo

Em `.claude/esquadro/handoff/AAAA-MM-DD-<slug>.md`, com **todas** estas seções:

1. **Ordem de leitura** — caminho absoluto do plano, do ledger e do handoff anterior, na ordem.
2. **Topologia** — cada repositório envolvido, com branch e **SHA do HEAD**, colados do passo 1.
3. **Onde estamos** — em que etapa do plano, e qual é a próxima, **com o texto da etapa conferido no
   arquivo**, não parafraseado.
4. **Decisões humanas já tomadas** — na forma "não perguntar de novo", com a data.
5. **Pendências e bloqueios que NÃO são achado desta sessão** — falha pré-existente é isto, e sem
   esta seção o próximo chat vai "descobrir" e perder tempo.
6. **Erros de método que custaram tempo** — para não se repetirem.
7. **Arquivos de terceiros deixados intocados** — do `git status` do passo 1.
8. **Prompt pronto para colar**, em bloco de código.

**Nunca inclua segredo, credencial ou dado de cliente.**

## Passo 3 — oferecer a troca, na mesma resposta

Não basta gerar o arquivo. Na **mesma resposta**:

1. diga com todas as letras que é hora de abrir chat novo, **citando qual gatilho disparou**;
2. **cole o prompt pronto no chat, em bloco de código** — o usuário tem de copiar sem abrir nada;
3. **não pergunte "sigo?" antes de oferecer a troca.** A troca vem primeiro; se ele preferir
   continuar, ele diz.
