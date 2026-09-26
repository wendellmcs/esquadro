---
name: economia
description: Use quando a resposta for fechar tarefa, entregar medicao ou pedir decisao ao dono. Poe o ritual obrigatorio no tamanho certo - o preambulo sai inteiro, a evidencia encolhe para o numero que prova, cada opcao cabe em uma ou duas frases. Nada do ritual e removido, so reformulado.
---

# `/esquadro:economia` — o mesmo ritual, no tamanho certo

Falha de origem: **cobertura não é clareza.** Quando tabela, medição e ressalva saem todas de uma
vez, o ponto principal fica do mesmo tamanho que o secundário, e quem lê tem de garimpar a resposta
dentro da prova. O ritual não está errado — o **tamanho da prosa em volta dele** está.

Esta skill **não afrouxa nenhuma exigência.** Evidência colada continua obrigatória, decisão continua
saindo em três opções com a recomendada marcada, e decisão tomada continua sendo registrada. O que
muda é a forma, e só ela.

## As quatro regras

- ao começar uma resposta → escrever a conclusão na primeira linha, nunca o que você vai fazer
- ao colar evidência → deixar no bloco só as linhas que carregam o número que prova
- ao levar decisão ao dono → escrever cada opção em uma ou duas frases, com a consequência dentro
- ao explicar algo que o dono acabou de ler ou de decidir → cortar, e citar onde está

## Regra 1 — o preâmbulo sai inteiro

Preâmbulo é tudo o que a resposta diz antes de dizer a resposta: anunciar o que vai fazer, repetir o
pedido com outras palavras, agradecer, avisar que vai ser detalhado.

| Sai | Fica |
|---|---|
| "Ótima pergunta. Vou analisar o módulo e em seguida rodar a suíte." | "A suíte passou; o módulo tem um caminho sem teste." |
| "Conforme solicitado, segue a implementação." | (nada — comece pela implementação) |
| "Espero que ajude! Qualquer coisa é só falar." | (nada) |

## Regra 2 — a evidência encolhe, mas o bloco não some

⚠️ **Este é o ponto onde a economia mal aplicada quebra o trabalho.** A trava de fecho bloqueia
qualquer afirmação de sucesso que não venha com bloco de saída. Uma resposta enxuta demais — o número
solto na prosa, sem bloco — **é barrada**, e a economia teria custado uma rodada inteira em vez de
poupar linhas.

O que encolhe é o **conteúdo do bloco**, não o bloco:

- ao encolher a evidência → manter o bloco e deixar dentro dele a linha de resumo, não a saída inteira
- ao não ter rodado algo → declarar que não rodou, porque a declaração também vale como evidência

## Regra 3 — a opção cabe em uma ou duas frases

Três opções continuam sendo três. A recomendada continua vindo primeiro e marcada. O que cabe em
cada uma é **a consequência prática e o custo** — não a reconstrução do raciocínio técnico que levou
até ela.

- ao escrever uma opção → dizer o que acontece na prática e quanto custa, nessa ordem
- ao precisar de mais de duas frases para uma opção → a opção está escondendo duas escolhas; separe

## Regra 4 — não repetir o que o dono acabou de ler

Resumo do que ele mesmo disse, recapitulação da decisão que ele tomou há dois minutos e reexplicação
de um trecho que já está no arquivo são peso morto que competem por atenção com o que é novo.

- ao precisar referenciar algo já dito → citar por `arquivo:linha` ou pelo nome da decisão

## Exemplos

Fecho de tarefa, no formato que a trava de fecho aceita:

````exemplo
Passou. O módulo novo tem 20 testes e a suíte não regrediu.

```
tests 448   pass 446   fail 0   skipped 2
```

Fora do escopo, registrado e não corrigido: o mesmo caminho existe em outro módulo.
````

Entrega com parte não rodada, que continua honesta sendo curta:

````exemplo
Implementado e testado em Windows. Não rodei em Linux nem em macOS — declaro como não testado.

```
tests 12   pass 12   fail 0
```
````

Decisão em três opções, cada uma com a consequência dentro:

````exemplo
O arquivo cresceu além do teto. Três saídas, e recomendo a primeira:

a. **Cortar as regras sem cicatriz (recomendada).** O arquivo volta para dentro do teto hoje, e nada
   que tenha decisão atrás é tocado. Custo: uma revisão de uma hora.
b. **Subir o teto.** Nada é cortado agora e o custo de contexto sobe em toda sessão.
c. **Deixar como está.** Custo zero agora, e o mesmo problema volta maior na próxima auditoria.
````

## O que esta skill NÃO promete

- **Não decide o que é supérfluo no conteúdo.** Ela encurta a forma; cortar conteúdo é auditoria, e
  tem skill própria.
- **Não dispensa evidência, opção nem registro.** Uma resposta curta que afirma sucesso sem bloco de
  saída continua sendo barrada, e está certo que seja.
- **Não vale para o texto que vai a arquivo.** Documento, decisão registrada e plano são lidos por
  quem não estava na conversa; lá a redundância é o que torna o texto legível sozinho.
