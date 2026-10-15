# Changelog

## 0.8.0 — a revisão compara com a peça de topo, nas duas ordens

**Novo**

- **Chave `referencias` no `projeto.json`.** Opcional, por tipo de entrega (`tela`, `codigo`, `texto`), cada tipo
  uma lista de caminhos ou URLs da melhor peça que existe para ele, no mercado ou no próprio projeto.
  `node scripts/validar.js` reprova tipo desconhecido e lista que não é de texto; o `/esquadro:init` rodado de novo
  funde por tipo. Sem a chave, nada muda.
- **A referência entra no pacote da revisão.** Quando o arquivo revisado tem referência do seu tipo (texto pela
  extensão `.md`, `.markdown` ou `.txt`; tela pela regra de estilo; código o resto), o
  `node scripts/preparar-revisao.js` grava o `R.txt` (cada referência com um cabeçalho; texto inteiro, imagem pelo
  caminho para o inspetor abrir) e uma 2ª passada com A e B trocados em `invertida/`. O campo `aviso` da saída desse comando
  lista as URLs (aceitas, mas o inspetor não abre a página: para ela contar, troque por um arquivo ou print local) e
  cada referência que não se leu, com a causa (corrija a entrada em `referencias` de `.claude/esquadro/projeto.json`
  ou dê ao seu usuário permissão de leitura no arquivo). Sem referência, o pacote sai byte a byte como antes. Se a chave estiver em formato errado, o
  pacote sai sem referência, sem parar, e o mesmo `aviso` manda rodar `node scripts/validar.js`, que diz o que
  corrigir.
- **O inspetor julga cada lado contra a referência.** Com `R.txt`, o veredito traz `vsReferencia` (`vence`, `empata`
  ou `perde`, para A e para B) e `lacunas` (o que separa um lado da referência, com severidade e `arquivo:linha`,
  como o achado). O gancho grava também os vereditos da 2ª passada, em `invertida/vereditos/`.
- **A apuração exige as duas ordens.** O `node scripts/apurar-ronda.js` lê as duas passadas e traz `referencia` na saída: por
  lente, o resultado em cada ordem e o final (perder em uma ordem é perder; vencer nas duas é vencer; o resto,
  empatar), as lacunas do lado novo e as lentes que ficaram atrás. Duas rondas secas só aprovam com toda lente
  empatando ou vencendo, sem lacuna P0/P1; o teto de 3 rondas segue. Achado da 2ª passada sai com `passada: 2`, e a
  refutação dele leva o mesmo campo. Sem referência, a apuração é a de antes.
- **O manual pede a referência antes de fazer.** A seção 4.1 do `padrao` manda nomear, na marcha AAA, a referência
  de topo que se abre (arquivo, print, repositório), nunca uma lembrança; sem ela, "sem referência" e o artefato
  irmão já aprovado.

**Custo:** com referência, cada lente roda duas vezes (o dobro de agentes); a revisão diz isso junto do número de
agentes. Sem a chave `referencias`, a revisão custa o mesmo de antes.

## 0.7.8 — o painel do plano acha o plano certo, conta as sessoes dele e le etapas em tabela

**Corrigido**

- **Plano da sessao sem frente.** A sessao que nao esta ligada a nenhuma frente le agora o Objetivo do
  `.claude/esquadro/escopo.md`; antes, ela via o plano de outra frente (a unica com plano anotado), sem aviso. Quando
  o `escopo.md` nao anota plano e uma so frente anota, o painel mostra o plano dessa frente, diz que a sessao nao esta
  ligada a ela e qual arquivo editar para ligar; com varias, lista as frentes, como antes.
- **A forma que as sessoes ja escrevem.** Alem de `Plano: <caminho>`, vale `plano` seguido do caminho entre crases ou
  aspas, terminado em `.md`. Com as duas formas no Objetivo, vale a que aponta para um arquivo que existe; se os
  dois existem, vale o `Plano:`; se nenhum existe, tambem vale o `Plano:`, e o painel diz que nao consegue le-lo.
- **Sessoes gastas do plano, nao da frente.** As sessoes gastas e a estimativa saem agora das marcas de sessao no
  proprio plano. A sessao 12 anota `(s12: feito)` na caixa `- [x]` do plano que ela marca; caixa refeita por duas
  sessoes leva as duas, `(s12, s13: refeito)`. Cada numero conta uma vez, tambem no plano aberto por `--abrir`. Antes
  contavam as marcas da frente inteira (41 para um plano de 2 sessoes). Plano sem marca: o painel diz como anotar.
- **Plano anotado fora do projeto.** O plano anotado no Objetivo so e lido dentro da pasta do projeto; fora dela, o
  painel diz que nao le e da as duas saidas: anotar um caminho dentro do projeto ou abrir o plano com `--abrir`. Se
  o plano e lido mas a conta falha, o painel diz isso, e nao mais "nao consegui ler", e pede para registrar a
  mensagem como defeito do esquadro.

**Novo**

- **Etapas em tabela.** O painel le o plano que lista as etapas numa tabela: 1a coluna `Etapa`, `Fase`, `Item`,
  `Tarefa` ou `Onda`, uma etapa por linha, comecando pelo id (como `P0` ou `2b-0`). Para marcar uma etapa como feita,
  ponha `[FEITO]` na 1a celula dela. Sem nenhum `[FEITO]` na tabela, o painel segue a ultima `ETAPA <id>` do Objetivo
  do escopo cujo id a tabela tem: as linhas acima dela contam como feitas, e ela como em curso; uma linha "estado
  pelo escopo:" diz isso e como marcar. Sem `ETAPA` com id da tabela, as etapas ficam sem estado (`[?]`). Com um
  `[FEITO]` que seja, so as marcas valem. Vale a 1a dessas tabelas; linha sem id fica fora da conta, e o painel avisa
  quais e pede o id; plano com caixas de passo segue nas caixas. `\|` dentro da celula e barra, nao divisa de coluna,
  e o plano gravado com BOM (a marca invisivel que editores do Windows poem no comeco do arquivo) le igual. Antes, o
  plano do APP (etapas P0-P7 numa tabela) dava "o painel nao consegue contar as tarefas".

**Mudado**

- **`/esquadro:handoff`.** O handoff grava a linha `Plano:` no Objetivo do escopo em vigor e pede a marca da sessao
  em cada caixa marcada, para o painel achar o plano e contar as sessoes no chat novo; no plano em tabela, pede
  `[FEITO]` na celula da etapa fechada e a marca da sessao na mesma linha, e, na 1a marca `[FEITO]`, tambem nas
  etapas anteriores ja feitas (a 1a marca encerra a deducao pelo escopo).

## 0.7.7 — o README conta tudo o que o plugin instala

**Mudado**

- **README completo.** O README passa a cobrir tudo o que o plugin instala e o que esperar de cada coisa: uma
  secao com tudo o que vem instalado (skills, o workflow `esquadro:paralelo`, os agentes, os ganchos por evento e os
  paineis `/esquadro-sessao` e `/esquadro-plano`), os portoes fora da tabela das oito travas (decisao, apelido,
  estilo, handoff, qualidade de resposta, vigia), o `projeto.json` chave por chave, a parte visual (lentes de tela, a escolha visual
  na pagina Artifact, catalogo de estados, alvo de 24 x 24 px, INP, print antes x depois, roteiro de 5 usuarios), os
  scripts de linha de comando que faltavam, o que mora em `modelos/` e nas referencias da `padrao`, e os
  comportamentos das versoes 0.6.0 a 0.7.6 que o README ainda nao contava. Nenhuma frase antiga mudou de sentido.
- **Teste.** O teste do README le do disco as skills, o workflow, os agentes, os eventos de gancho, os paineis, os
  scripts, as chaves do `projeto.json`, as travas, os `modelos/` e as referencias da `padrao`: item novo que chega
  sem README reprova sozinho.

## 0.7.6 — a escolha visual numa pagina Artifact e as lentes de tela mais completas

**Mudado**

- **Escolha visual numa pagina Artifact.** A `esquadro:padrao` ja mandava mostrar a imagem antes de pedir uma
  escolha visual. Agora, quando a sessao tem a ferramenta Artifact (pagina privada no claude.ai), o meio
  preferido e uma pagina com antes, proposta e referencia lado a lado, em claro e escuro, nas larguras de tela que
  o projeto declara (sem declaracao, as que o produto comprovadamente atende: a de notebook, e a de celular so se
  ele roda em celular). O rito e o da imagem: o link primeiro, as 3 opcoes no turno seguinte. Sem a ferramenta, a
  imagem de sempre. A pagina sai do computador: so dado ficticio; tela com dado de cliente ou credencial troca por
  dado ficticio antes de publicar, ou fica na imagem local.
- **Lentes de tela.** A Lente 2 (estados) pede o componente visto sozinho com todos os estados: a pagina dele no
  catalogo de componentes do projeto, ou uma pagina de estados montada para a revisao. A Lente 4
  (acessibilidade) pede alvo de pelo menos 24 x 24 px (WCAG 2.2, criterio 2.5.8, com as excecoes do criterio);
  abaixo disso e P1. A Lente 7 (regressao) mede a resposta ao clique pelo INP (Interaction to Next Paint, o
  tempo do clique ate a tela responder): bom ate 200 ms, ruim acima de 500 ms (web.dev); medido acima de 500 ms
  e P1, entre 200 e 500 ms e P2, sem medicao a lente diz que nao mediu.
- **Marcha AAA.** Com gerador de print, a regressao de tela se prova por comparacao automatica de print antes x
  depois; sem ele, a comparacao foi a olho, e isso se declara. Em funcao visivel nova, o fecho entrega ao dono um
  roteiro de teste de uso com 5 usuarios reais (cerca de 85% dos problemas de uso), que nao bloqueia a entrega.

## 0.7.5 — limiar invalido no projeto.json cai no padrao

**Corrigido**

- **Limiar que nao e numero positivo cai no padrao.** Um valor de `limiares` no `projeto.json` igual a `null`,
  `0`, negativo ou texto entrava cru na conta: `tokensAlarme: null` fazia o alarme de tamanho sair no comeco da
  conversa, e `tokensDeContexto: 0` fazia o aviso sair a zero. Agora so numero positivo vale; o resto fica com
  o padrao. Vale para o medidor, o alarme, o bloco da abertura (que diz os numeros que o medidor usa) e o
  `/esquadro:calibrar`. Um numero escrito como texto (`"300000"`) tambem deixa de valer: grave sem aspas
  (`300000`) para o seu limiar continuar mandando.
- **Textos.** O README liga o alarme de 450 mil a faixa acima de 500 mil, onde a chamada custa cerca de 4 vezes
  mais, e diz que limiar invalido cai no padrao. Na 0.7.4, "o bloco da abertura diz os 250 mil" vale para o
  padrao: com limiar gravado no projeto, o bloco diz o numero dele.

## 0.7.4 — com o modo continuo ligado, o aviso de tamanho sai a 250 mil

**Mudado**

- **Modo continuo: aviso de troca de chat a 250 mil tokens.** Com `modoContinuo` ligado, o aviso de tamanho
  saia no padrao de 175 mil, embora o modo exista para a sessao longa; no teste numa etapa real, o aviso
  apareceu duas vezes e as sessoes seguiram. Agora, com a chave, o padrao do aviso e 250 mil (o alarme segue
  em 450 mil). O numero que o projeto gravar em `limiares.tokensDeContexto` continua mandando. Sem a chave,
  nada muda: 175 mil. O medidor da sessao mostra o limiar que vale.
- **Modo continuo, textos.** O bloco da abertura, a `esquadro:padrao` e o README dizem os 250 mil; o README
  passa a nomear as quatro coisas que ainda pedem troca de chat, como a skill (faltava o incidente que exigiu
  cirurgia).

## 0.7.3 — pergunta de fato passa no portao de decisao e o modo continuo mais claro

**Mudado**

- **Pergunta de fato passa no portao de decisao com `(fato)` no titulo curto.** Ate a 0.7.2 o portao
  barrava toda pergunta ao dono sem exatamente 3 opcoes e sem a recomendada em primeiro, inclusive a
  pergunta de sintoma ou de dado que so o dono tem, que nao e decisao (nas sessoes do autor, ela acabou
  saindo em texto, duas vezes). Agora `(fato)`, exata e entre parenteses, em maiuscula ou minuscula, no
  `header` (o titulo curto) da pergunta, a libera da regra das 3 opcoes. A marca so conta no `header`: no
  texto da pergunta ou num rotulo, nao. A decisao sem a marca segue barrada, e a mensagem de bloqueio
  passa a ensinar a marca.

**Corrigido**

- **Medidor da sessao: o "0 de N" conta so os gatilhos que podem disparar.** Com o modo continuo ligado,
  os cinco gatilhos que a chave cala entravam no denominador ("troca: 0 de 7"), embora nao pudessem
  disparar. Agora a linha curta diz "0 de 2". Sem a chave `modoContinuo`, nada muda.
- **Modo continuo, textos.** A `esquadro:padrao` diz como saber se o modo esta ligado (a abertura da
  sessao diz), nomeia o que deixa de pedir troca de chat em vez de "todo o resto desta secao" (o
  "Disparou?" segue para os gatilhos que ficam e o "Sempre" nao muda) e poe credencial, permissao e
  seguranca na lista do que ainda vai ao dono; o bloco da abertura e o README dizem o mesmo. No README,
  o item "Ele avisa quando e hora de abrir chat novo" ganha a ressalva do modo continuo.
- **Teste do Jev pela regra de hoje.** O Jev e um modelo externo; `docs/jev` mede o que ele diz contra a
  regra do `/esquadro:auditar`. O `docs/jev/jev.test.js` ainda dizia que 1 termo em comum bastava para a
  sobreposicao de skills; a regra mudou na 0.5.2 (2 termos comuns e fracao de 0,20). O teste agora confere
  os dois limites. O codigo nao mudou.

## 0.7.2 — revisao proporcional ao diff, cd solto que se corrige e filtro de subagente num lugar so

**Mudado**

- **`/esquadro:revisar` passa a ser proporcional ao tamanho da mudanca.** Ate a 0.7.1 toda revisao
  despachava a familia inteira de lentes (6 inspetores numa logica, 9 num codigo de estilo), inclusive para
  trocar uma palavra. Nas revisoes do autor, os diffs pequenos gastaram cerca de 40% dos inspetores e nao
  acharam nenhum defeito real; os defeitos vieram de logica nova ou grande. Agora o `preparar-revisao.js`
  mede o diff contra o HEAD e diz a faixa: ate 3 linhas, 1 inspetor (`correcao`); logica de ate 40 linhas
  com teste vermelho e mutacao, 2 (`correcao` e `borda`); texto, 2 (`correcao` e `microcopy`); arquivo
  novo, logica maior, estilo ou o que nao der para medir, a tabela de familias de antes. Quem revisa pode
  subir de faixa, nunca descer. A regra de parada nao muda: duas rondas secas, teto de 3.
- **Nas faixas pequenas, o inspetor le so o trecho mudado.** `A.txt` e `B.txt` levam o trecho com 20
  linhas de margem; o resto fica em branco, com uma linha `[fora do trecho: linhas a-b]` no inicio de cada
  vao. Os numeros de linha seguem os do arquivo, entao a apuracao e a refutacao nao mudam. O inspetor sabe
  que o vao nao e defeito: o que depender dele vira "nao consigo ver". Na faixa completa, o arquivo inteiro,
  como antes.
- **O `cd` solto no Bash se corrige sozinho em vez de ser barrado.** Era o portao que mais parava o trabalho
  (cerca de 435 idas e voltas por semana nas sessoes do autor): o comando era negado e o agente tinha de
  escrever de novo. Agora o comando vai inteiro num subshell, `( ... )`, e roda: a pasta volta sozinha, e o
  agente fica sabendo da correcao e da forma certa. A permissao continua a de sempre (o portao nao aprova
  nada), e a correcao nao conta como bloqueio para a troca de chat. Seguem negados: o `cd` solto no
  PowerShell (que nao tem subshell que devolva a pasta), o comando que termina em barra e o que nao se le
  inteiro.

**Corrigido**

- **O filtro que separa o retorno de subagente da sua fala fica num lugar so.** Ate a 0.7.1 ele estava
  copiado em dois ganchos (a pergunta sobre o contexto e a sugestao de `/esquadro:aprender`), preso ao
  texto com que o Claude Code entrega o retorno; quando esse texto mudou no 2.1.296, os dois deixaram
  passar ate a 0.7.1 corrigir as duas copias. Agora os dois usam a mesma funcao, e a proxima mudanca da
  forma se corrige uma vez. O comportamento nao muda: nas transcricoes do autor (7291 prompts), o filtro
  novo decide igual ao antigo em todos.
- **README: "os outros cinco gatilhos" virou "sete".** No paragrafo do gatilho de commit, o numero ficou
  para tras quando a tabela de gatilhos cresceu. Um teste passa a conferir esse numero contra os limiares
  do codigo.

## 0.7.1 — painel do plano completo e tres correcoes

**Mudado**

- **Troca de chat por tamanho: o padrao passa de 250 mil para 175 mil tokens.** A medicao da 0.7.0
  contava a leitura do handoff na abertura do chat novo como se fosse a escrita, e a troca saia mais cara
  do que e; por isso ela achou o empate em 250 mil. Medido de novo, so com a escrita: nas sessoes do autor
  cada troca custa US$ 1,56, e 175 mil e o menor limiar em que trocar no fim do turno nao sai mais caro
  que seguir. O alarme firme continua a 450 mil. Quem gravou `limiares.tokensDeContexto` no `projeto.json`
  fica com o numero dele; para voltar ao padrao da 0.7.0, grave `250000` nessa chave. O
  `/esquadro:calibrar` passa a medir a amostra contra o padrao novo: conta as conversas que chegaram a 175
  mil (os minimos seguem 30 sessoes e 10 conversas).
- **`/esquadro-plano` mostra o plano inteiro.** Sem `plano-ativo.json`, o painel acha o plano pelo ultimo
  `Plano: <caminho>` do Objetivo da frente vinculada a sessao (antes dizia "nenhum plano ativo" mesmo com
  plano em curso); le cabecalhos `Tarefa`, `Item`, `Etapa`, `Onda` e `Fase` com numero (`3a` vale) e
  travessao, e `[FEITO]` no cabecalho quando nao ha caixas; e acrescenta o que falta, as sessoes gastas
  (marcas `(sessao N` no Objetivo da frente) e a estimativa das que faltam, com a base da conta. O portao
  de "etapa com subitem aberto" segue lendo so o formato de antes.

**Corrigido**

- **"Hora de trocar de chat" por resposta de subagente.** Quando o retorno de um subagente citava "o
  contexto esta bom?", o aviso saia como se a pergunta fosse sua. O retorno de subagente e o aviso de
  tarefa em segundo plano deixam de contar como pergunta, tambem na forma em que o Claude Code 2.1.296 os
  entrega ("Another Claude session sent a message...", seguido do retorno).
- **Sugestao de `/esquadro:aprender` sem correcao sua.** O mesmo retorno de subagente, quando trazia uma
  frase de correcao, era lido como correcao do dono. Mesmo filtro.
- **Revisao cega que dava ronda seca com P1 novo.** O apurador tratava como repeticao um achado na mesma
  linha, lente e severidade da ronda anterior, mesmo quando a linha tinha sido reescrita entre as rondas.
  Agora o apurador le o texto da linha citada no `A.txt`/`B.txt` de cada ronda: se ele mudou (espacos
  nao contam), o achado conta como novo. O `refutados.json` segue valendo como antes.

## 0.7.0 — menos paradas

**Mudado**

- **Troca de chat por tamanho: o padrao passa de 150 mil para 250 mil tokens.** Medido em 435 sessoes:
  abrir chat novo custa escrever o handoff (o texto de continuacao) mais a rampa (o chat novo so faz a
  primeira edicao com ~119 mil tokens de contexto), e trocar no fim do turno a 150 mil saia 9% mais caro
  que nao trocar; a 250 mil empata. O aviso continua saindo so no fim do turno, nunca no meio da tarefa.
  Chave: `limiares.tokensDeContexto`. Quem ja gravou essa chave no `projeto.json` fica com o numero dela;
  para voltar ao antigo, grave `150000` nela.

**Novo**

- **Alarme a 450 mil tokens** (`limiares.tokensAlarme`). Um segundo aviso, mais firme, que sai uma vez
  mesmo depois do primeiro: acima de 500 mil cada chamada custa cerca de 4 vezes a de 200 a 300 mil.
- **Validar antes de pedir.** A abertura de toda sessao injeta, entre o bloco de paralelismo e o de
  qualidade, a regra de o agente validar sozinho (rodar o teste, abrir o navegador pelo Claude in Chrome
  ou pelo protocolo de depuracao do Chrome, ler o resultado) antes de pedir acao manual, e pedir so o que
  so voce pode, tudo num pedido so. Vale com e sem o modo continuo, e nao tem chave para desligar. A
  skill `padrao` traz a mesma regra.
- **Modo continuo** (`"modoContinuo": true` em `.claude/esquadro/projeto.json`, desligado por padrao).
  So o booleano `true` liga. Com ele, so tres coisas pedem troca de chat: o tamanho da conversa (aviso e
  alarme), os bloqueios de portao (no limiar `limiares.bloqueios`, 6 por padrao) e a sua pergunta sobre
  o contexto; revisoes, decisoes, commits, turnos e arquivos nao encerram a sessao. Em troca, o agente
  rele o plano antes de cada subitem, decide sozinho a escolha tecnica dentro do escopo e lista no fecho;
  a voce ele segue perguntando o irreversivel, o externo (publicar, push, envio), o de custo e o de produto.
- **`/esquadro:calibrar`.** Le as transcricoes que o Claude Code guarda deste projeto (so a conversa
  principal), mede a partir de quantos tokens trocar de chat ainda compensa e sugere o limiar. So numeros
  saem do script, nenhum trecho de conversa. Com menos de 30 sessoes, ou menos de 10 conversas que chegaram
  ao limiar padrao, a amostra e pequena e o limiar atual fica. Ele so grava no `projeto.json` com
  `--gravar` (aceita de 50000 ate abaixo do alarme), que a skill so roda depois do seu sim.

## 0.6.6 — dois erros calados passam a avisar

**Corrigido**

- **Proxima decisao com caminho errado.** `scripts/plano.js --proxima-decisao` com um caminho que nao
  existe respondia `1` sem dizer nada, e a decisao saia com o numero 1 num projeto que ja tinha outras. O
  `1` continua (projeto novo ainda nao tem arquivo de decisoes), mas agora vem com um aviso que mostra
  o caminho procurado. Uma pasta no lugar do arquivo para com erro.
- **Autorizacao do paralelo recusava arquivo valido.** O `settings.local.json` gravado pelo PowerShell
  5.1 comeca com uma marca invisivel (BOM), e o arquivo vazio era tratado como JSON quebrado: nos dois
  casos a autorizacao do `/esquadro:paralelo` nao era gravada. Agora a marca e ignorada e o arquivo
  vazio vale como sem configuracao.

## 0.6.5 — o agente de leitura conta linhas certo

**Corrigido**

- **Contagem de linhas errada no PowerShell.** Pedido para contar as linhas de um arquivo de 121, o agente
  `leitor` do `/esquadro:paralelo` respondeu 110: usou `Measure-Object -Line`, que pula linha vazia, e
  disse que era o mesmo que `wc -l`. O agente agora traz como contar nos dois shells, avisa desse
  comando e de que, sem quebra de linha no fim do arquivo, os dois shells diferem em uma linha. Medido no VS Code com a 0.6.4: tres leituras custaram 38.514 tokens, contra 169.098 antes dela.

## 0.6.4 — leitura em paralelo custa menos

**Mudado**

- **Tarefa so de leitura do `/esquadro:paralelo` abre leve.** Cada agente de leitura nascia com as
  instrucoes do projeto, a memoria e a lista de skills, e tres leituras simples custaram cerca de 169
  mil tokens. Agora quem so le roda no agente `leitor` do plugin, que abre sem esse peso e sem
  ferramenta de edicao: medido, uma leitura caiu de cerca de 56 mil para 6 mil tokens. Quem edita
  segue como antes, com as regras do projeto e copia isolada do repositorio.

## 0.6.3 — o paralelo roda no VS Code em Windows

**Corrigido**

- **`/esquadro:paralelo` recusado no VS Code em Windows.** O Git para Windows instala o plugin trocando
  o fim de linha de cada arquivo, e o VS Code recusava o workflow antes da janela de aprovacao, por ver
  um caractere escondido no script. O repositorio agora fixa o fim de linha (`.gitattributes`), e um
  teste reprova se o workflow tiver caractere de controle. Quem ja tem a 0.6.2 recebe a correcao na
  proxima atualizacao do plugin.

## 0.6.2 — menos contexto, mais paralelo

Medido nas sessoes do autor: as chamadas com conversa acima de 150 mil tokens eram 61% do total e 71%
do custo, e a abertura de cada inspetor carregava listas que ele nunca usa. Esta versao corta os dois e
ensina o Claude a nao ficar parado esperando agente.

**Novo**

- **Trabalho em paralelo.** A abertura de toda sessao traz quatro regras curtas: agente em segundo
  plano nao e motivo para parar; agentes que editam ao mesmo tempo rodam isolados; relatorio de agente
  e alegacao; e o freio de custo (modelo mais barato que resolve, no maximo 8 por disparo). Desligar: a
  chave `paralelismo` com `false` em `.claude/esquadro/projeto.json`.
- **Workflow `/esquadro:paralelo`.** Com 3 ou mais tarefas independentes, o Claude oferece o workflow,
  diz quantos agentes, qual modelo e o custo, e so roda depois do seu sim. Ele aplica o freio sozinho:
  8 por disparo (diz quais ficaram de fora), Haiku para quem so le e Sonnet para quem edita, copia
  isolada do repositorio para quem edita, e cada resultado volta com a evidencia que o agente colou.
- **Autorizacao uma vez so.** O `/esquadro:init` pergunta se o workflow pode rodar sem janela de
  aprovacao e, no sim, grava a regra em `.claude/settings.local.json` (arquivo pessoal, fora do git)
  sem tocar nas outras permissoes.
- **O tamanho da conversa conta.** Setimo gatilho de troca de chat: conversa acima de 150 mil tokens
  de contexto. O plugin le o fim do registro da sessao no fim de cada turno (pode vir um turno
  atrasado); o medidor `/esquadro-sessao` usa o numero ao vivo.

**Mudou**

- **Inspetor e juiz mais leves.** Os dois agentes da revisao cega so leem (`Read`, `Grep`, `Glob`) e
  abrem sem a lista de skills e sem as instrucoes do projeto (pede o Claude Code 2.1.271 ou mais novo).
- **Revisao de arquivo so de logica: 6 inspetores**, nao 8. Saem as lentes de medidor e de escopo, que
  quase nunca acharam defeito real nesse tipo de arquivo.

## 0.6.1 — onze ajustes de uso

Os itens que a revisao da 0.6.0 deixou registrados e que se esbarram no uso normal. Cada um com teste
escrito antes; o portao de fecho tambem passou por revisao cega.

**Corrigido**

- **Comando destrutivo.** `git restore` com opcao que nao muda o descarte antes do `.` (`-q`, `--ours`,
  `--theirs`, `--merge`, `--conflict=`, a abreviacao `--work` do `--worktree`...) apagava a arvore e
  passava; agora e barrado como o `git restore .`. `restore --staged -q .` (so o indice) e `-p .`
  (interativo) seguem liberados.
- **Portao de fecho.** Intencao nao e mais lida como alegacao: "vou concluir a tarefa", "antes de fechar
  a etapa", "concluindo a fase". E passam a ser lidas: "Tarefa 3: concluida", "tarefa nº 3", "a tarefa 3
  ja esta concluida", "onda 7b concluida", "tarefa 1.2 concluida". Id que o plano nao tem como cabecalho
  `Tarefa N` (7b, 1.2) e cobrado pela tarefa em andamento, nunca pela Tarefa 7 ou 1 por engano.
- **Medidor da sessao.** A medida que chega enquanto outra mede nao se perde mais; se a leitura de uso
  travar, a linha de status diz isso e mede de novo em vez de congelar no ultimo numero. Percentual sai
  inteiro; janela sem nome, gatilho incompleto e previsao infinita sao omitidos em vez de virar
  "undefined" ou "Infinity". No painel do VS Code, o "o que fazer" nao emenda mais no ultimo item.
- **Painel do plano.** `plano-ativo.json` gravado com BOM (comum no Windows) vale de novo, inclusive no
  portao de fecho; o que existe mas nao se le diz isso em vez de "nenhum plano ativo"; sem plano, o
  painel mostra o caminho real do `plano.js` para abrir um. A saida JSON do `plano.js` nao conta
  tarefa sem caixa de passo como concluida (`semCaixas`).
- **Chave de liga/desliga com valor torto.** `"sugerirAprender": "false"` (entre aspas) nao desliga, e
  agora a abertura da sessao avisa; a conferencia final do `/esquadro:init` (`validar.js`) reprova; o
  re-init aceita as
  seis chaves (`sugerirAprender`, `auditarNaAbertura`, `qualidadeDeResposta`, `portaoDecisao`,
  `portaoHandoff`, `vigia`).
- **`/esquadro:aprender`.** Regra que e so o comeco de outra ja gravada era recusada como "JA EXISTE";
  a duplicata agora e a linha inteira.
- **Novidade da semana do vigia.** Linha longa quebra em ate tres linhas na tela, sem partir o link;
  antes, cortava em 200 caracteres.
- **README.** O paragrafo dos comandos `/esquadro-sessao` e `/esquadro-plano` diz as tres causas de o
  comando nao aparecer (inclusive o esquadro antigo, com o comando de atualizar), que a forma com
  dois-pontos nao existe, e o que o painel responde sem plano ativo.

## 0.6.0 — os numeros na tela, e a correcao que vira regra

Uma revisao completa do plugin (scripts, ganchos, skills, agentes e testes) e o que ela trouxe de
novo. Cada falha confirmada foi corrigida com teste escrito antes; o comportamento novo vem com teste;
a suite inteira roda com `npm test`.

**Novo**

- **Medidor da sessao e painel do plano, dentro do Claude Code.** Dois comandos que vem com o plugin,
  como *mods* (extensoes que o proprio Claude Code roda na sessao; exigem o Claude Code 2.1.287 ou mais
  novo). `/esquadro-sessao` mostra o contexto usado, as janelas de limite (5h e semana) com a hora em
  que renovam, o custo, a previsao em turnos e cada gatilho de troca de chat com o valor e o limiar.
  `/esquadro-plano` mostra o plano ativo: tarefas feitas, abertas e a proxima. No terminal e no app
  Desktop o medidor tambem fica na linha de status, e quando um gatilho cruza aparece uma faixa acima
  do prompt com o botao "gerar handoff". Nada disso abre rede.
- **Correcao vira sugestao de regra.** Quando a sua mensagem parece uma correcao ao jeito de o Claude
  trabalhar ("eu ja te disse", "da proxima vez..."), ele atende o pedido e oferece, em uma linha, virar
  regra com `/esquadro:aprender`. O gancho nunca grava: quem grava e a skill, depois do seu sim. No
  maximo uma sugestao a cada cinco turnos. Desliga com `"sugerirAprender": false` no `projeto.json`.
- **A auditoria roda sozinha.** Na abertura da sessao, no maximo uma vez a cada 7 dias, o plugin roda
  a auditoria do `/esquadro:auditar` e so fala se algo passou do limite: peso de instrucao, skills que
  se sobrepoem, regras que se contradizem, skill do projeto parada ha 90 dias ou mais. Os prazos ficam
  em `limiares` (`diasEntreAuditorias`, `diasSkillParada`); desliga com `"auditarNaAbertura": false`.
- **Para quem mantem o plugin: a novidade da semana na abertura.** Com `"vigia": true` no
  `projeto.json` (desligado por padrao), a abertura mostra uma vez o arquivo semanal que o
  `scripts/vigia-puxar.js` trouxe para `~/.claude/esquadro/vigia`, marcado como dado, nao instrucao.
  Quem busca o arquivo e uma tarefa agendada; gancho nenhum abre rede.
- **Ferramentas de linha de comando:** o README mostra como rodar cada script a partir da pasta do
  plugin instalado (`node "<plugin>/scripts/uso.js"`), e os avisos que mandam rodar um script citam o
  caminho real, nunca uma variavel nao expandida.

**Corrigido**

- **Comando destrutivo.** Passam a ser barrados: `push` forcado com `-f` agrupado a outras opcoes,
  `clean` com o `-f` depois de outra opcao, `checkout`, `restore` e `switch` que descartam a arvore
  inteira, e escrita direta em disco. Opcao global do git com valor entre aspas nao escapa mais.
  `checkout -- <arquivo>` e `restore --staged .` seguem liberados. Padrao invalido em
  `comandosLiberados` nao libera nada.
- **Estado que nao grava nao abre portao.** Se a pasta de estado do plugin nao aceita escrita, nada
  que estaria barrado passa por isso. Um `projeto.json` invalido e dito como invalido, nao como
  ausente, tambem na abertura.
- **O fecho com plano ativo cobra a etapa certa:** a tarefa citada (todas, quando sao varias), a que
  esta em andamento quando nao ha numero, nunca uma tarefa futura. Plano ativo que nao pode ser lido e
  avisado.
- **Catraca.** `max-width`, `min()`, `maxWidth` e variavel local `max`/`min` deixam de ser regua;
  constante em caixa alta, nome com sufixo e numero com unidade seguem sendo. Anotacao de tipo entre o
  nome e o numero nao esconde a regua.
- **Token fora do design system.** Seletor de id com letras hexadecimais nao e mais cor; cor em valor
  de varias linhas, em argumento de mixin e em fallback de `var()` passa a ser achada; comentarios de
  bloco sao respeitados.
- **`sanitar` nao diz LIMPO sem ter lido.** Arquivo que nao abre, vocabulario local quebrado e
  `excecaoEm` invalido saem com 2. Arquivo com acento no nome, UTF-16 com BOM e pasta pessoal do macOS
  e do Windows em qualquer caixa entram na conferencia; binario sai como "nao conferido", com o motivo.
- **`/esquadro:init` na reconfiguracao** preserva o que a entrevista nao perguntou de novo (limiares,
  chaves postas a mao, subchaves de agentes) e declara o escopo antes de gravar a configuracao. Valor
  com `: ` no cabecalho de um agente gerado sai entre aspas, e quebra de linha ali e recusada.
- **`/esquadro:aprender`** recusa gatilho ou acao com quebra de linha: a regra e uma linha so.
- **`cicatriz.js`** aceita um arquivo, e nao so uma pasta, em `--manual` e `--corpus`.

## 0.5.4 — o portao do handoff erra menos

Ajustes que a revisao cega da 0.5.3 deixou registrados. O comportamento novo vem com teste; a suite
inteira roda com `npm test`.

- **O portao do prompt do handoff segue mais de perto o CommonMark ao procurar o bloco de codigo.**
  Cerca com 4 colunas de recuo ou mais (contadas a partir do conteudo do item de lista em que esta)
  nao abre nem fecha bloco: e bloco recuado. O tab conta ate a proxima coluna multipla de 4, tambem
  logo depois do `>` de uma citacao: `>`, tab e a cerca abrem o bloco. A cerca aberta numa citacao
  fecha quando a citacao acaba, e o texto depois dela nao conta como corpo. Dentro da cerca, uma
  linha `>` fora de citacao e corpo, e uma linha so de espaco nao separavel (NBSP) tambem.
- **Estado corrompido nao dispara o aviso de troca de chat pelos arquivos tocados.** Se o registro
  dos arquivos tocados nao for uma lista (texto, objeto), ele conta zero, como ja acontecia com as
  decisoes e os commits.
- **O motivo do portao do prompt do handoff** pede o prompt "num bloco de codigo (tres crases ou tres
  tis)", no lugar da cerca crua seguida de virgula.
- **README:** a mensagem literal do portao do prompt do handoff entra na lista do que cada portao
  responde quando nega; a tabela de `travas` diz que `fecho: false` nao desliga esse portao; o
  paragrafo dele vira frases curtas e diz o que acontece com ele desligado; a descricao do
  `/esquadro:handoff` cita o portao e a excecao do aviso de troca de chat.
- Comentarios de `portao-fecho.js`, `marcar-trabalho.js`, `abrir-turno.js` e `lib/saude.js`
  alinhados ao que o codigo faz.

## 0.5.3 — o prompt do handoff chega ao chat

Gravar o handoff so no arquivo deixava o chat novo sem o texto para colar. O fim de turno passa a
cobrar o prompt na resposta. O comportamento novo vem com teste; a suite inteira roda com `npm test`.

- **O turno que gravou um handoff sem o prompt em bloco e barrado.** Arquivo de handoff e um `.md`
  com data `AAAA-MM-DD-` na frente do nome e "handoff" no nome (`<data>-<assunto>-handoff.md`) ou
  dentro de uma pasta `handoff/`. Se o turno gravou um desses e a resposta final nao tem bloco de
  codigo (cerca de tres crases ou de tres tis, com corpo nao vazio; cerca sem fecho, dentro de
  citacao ou de item de lista tambem conta), o fim do turno e barrado, uma vez, com o motivo dizendo o que fazer: colar
  o prompt agora, em bloco, nesta resposta final.
- **Um bloqueio so, com todos os motivos.** Se o mesmo turno tambem tem subitem aberto ou ficou sem
  evidencia, os motivos saem juntos no mesmo bloqueio.
- **O aviso de troca de chat nao manda colar de novo.** No turno que gravou o handoff e ja tem o bloco
  na resposta final, a ordem ao Claude passa a ser apontar para o bloco acima, sem rodar o handoff nem
  colar outra vez.
- **Como desligar:** `"portaoHandoff": false` no `projeto.json`. O `travas.fecho: false` nao o
  desliga.
- **Limites:** o portao le so a resposta final (bloco colado numa mensagem anterior do mesmo turno
  nao conta) e confere que ha um bloco, nao que o bloco e o prompt. So o arquivo gravado por
  ferramenta de arquivo marca o turno; o gravado por comando de shell, nao.
- Sao **22 baldes** de contador: 17 que negam, 5 que so contam.

## 0.5.2 — o auditar so acusa sobreposicao de verdade, e os portoes dizem por que barram

A sobreposicao de skills do `/esquadro:auditar` passa a pedir mais que uma palavra em comum, e uma
leva de ajustes do que as revisoes cegas anteriores deixaram registrado. Os comportamentos novos vem
com teste; a suite inteira roda com `npm test`.

- **O `/esquadro:auditar` so acusa sobreposicao com 2 termos ou mais em comum.** Antes, 1 termo em
  comum entre as descricoes de duas skills bastava. Agora sao 2 termos ou mais **e** a fracao de
  termos comuns (os comuns sobre todos os termos do par) de 0,20 ou mais. Numa bateria de 80 pares
  marcados, a regra antiga acusava 40, 39 deles sem sobreposicao; a nova acusa so o par que se
  sobrepoe. Segue sendo aviso, nao bloqueio.
- **O portao de estilo le mais formas de comando de shell** (so vale com `.claude/esquadro/design.json`):
  - caminho em variavel que o proprio comando define antes (`OUT=x; ... > "$OUT/a.css"`,
    `$out = 'x'`) vira o valor dela e passa pela conferencia normal: fora do projeto, nao conta. A
    variavel que vem de fora, ou que e definida dentro de `bash -c`/`eval`, segue sem valor;
  - no PowerShell, `(Join-Path a b)` e lido como o caminho `a/b`, nao como o fim do comando;
  - `-InputObject` (`Out-File`, `Tee-Object`) e o conteudo, nao o arquivo escrito;
  - `New-Item -Path pasta -Name arquivo` escreve `pasta/arquivo`, nao os dois soltos;
  - copia para destino sem extensao (`cp a.css src`), `.` ou `..` vai para dentro da pasta. Nome de
    arquivo sem extensao (`cp a.css Makefile`) tambem vira pasta: e o limite da leitura;
  - `bash`/`sh` sem `-c` le o roteiro do heredoc (`bash <<EOF`), salvo quando recebe arquivo de roteiro;
  - a negacao diz por que: o esquadro nao le o conteudo que um comando de shell vai gravar.
- **O fim de sessao limpa tambem as marcas de veredito.** As marcas `<id>.veredito-<agente>.marca`,
  que acumulavam na pasta de estado, saem pela mesma regra dos 7 dias. A pasta se le entrada a
  entrada, com o prazo conferido antes de cada uma: pasta grande nao gasta mais o tempo da limpeza
  antes de comecar.
- **O portao de decisao diz o remedio de cada causa.** Opcao nula, em texto solto ou sem `label` em
  texto barra, com "cada opcao e { label, description }". Cada causa traz o que fazer: "deixe
  exatamente 3", "ponha (Recomendado) no rotulo dela", "a marca vai so na 1a opcao". A marca repetida
  em duas opcoes sai como "as opcoes 2 e 3".
- **O peso de instrucao nao conta o mesmo arquivo duas vezes.** Fonte declarada que tambem e
  `regras.md` ou `SKILL.md`, `./CLAUDE.md` ao lado de `CLAUDE.md`, ou `claude.md` e `CLAUDE.md` onde o
  disco ignora caixa: vale a primeira citacao. Fonte com caminho absoluto passa a ser lida
  (contava 0). O metodo ao lado do numero diz de onde vieram as fontes: declaradas, candidatas
  (achadas pela varredura) ou nenhuma.
- **Apuracao da revisao cega.** Achado com linha 0 ou negativa e descartado como sem `arquivo:linha`
  (antes molhava a ronda e nao tinha como ser refutado). Os pares para o juiz saem so entre vizinhos
  em ordem de linha, sem comparar todos com todos; a lista sai igual. `mesmos: null` pela API vale
  como sem juiz.
- **Textos:** no init, a pergunta dos lugares de registro e uma por lugar, cada uma com as suas 3
  opcoes, e a opcao de nao gravar a skill avisa que a resposta dos lugares de registro nao fica gravada
  em lugar nenhum; no init e na skill
  `padrao`, a skill de execucao do projeto e a que diz "Gerado por `/esquadro:init`" (com mais de
  uma, pergunta-se ao dono; sem nenhuma, vale a escrita a mao); no `revisar`, "com mais de 50 pares,
  lotes de ate 50"; no README, o `portaoDecisao` em "Como desligar uma trava" e o orcamento de 1,5 s
  do fim de sessao (o `timeout` do `hooks.json` nao o aumenta).

## 0.5.1 — a recomendada e uma so, a lista vazia barra e o juiz nao aponta um achado para ele mesmo

Tres ajustes do que a revisao cega da 0.5.0 deixou registrado. Os comportamentos novos vem com teste;
a suite inteira roda com `npm test`.

- **A recomendada e uma so.** O `portao-decisao.js` confere a marca em todas as opcoes, nao so na
  primeira: a marca tambem na 2a ou na 3a opcao barra a pergunta, e a mensagem diz quais opcoes
  repetiram a marca.
- **Lista de perguntas vazia barra.** `AskUserQuestion` com `questions: []` passava sem conferencia;
  agora o portao barra com "nenhuma pergunta na lista".
- **O juiz nao aponta um achado para ele mesmo.** Um `mesmos.json` com `novo` igual a `outro` para a
  apuracao com erro e a instrucao de copiar o par como veio em `paresCandidatos`; antes saia o aviso
  "provavel mesmo defeito que" a propria chave.

## 0.5.0 — o juiz que aponta achado repetido e o portao da pergunta ao dono

Duas pecas da frente do decisor local: um modelo pequeno entra na revisao cega so para
avisar, e a regra das 3 opcoes deixa de ser so texto. Os comportamentos novos vem com teste; a suite
inteira roda com `npm test`.

- **O juiz de "mesmo defeito" so avisa.** Agente novo `juiz-mesmo` (`model: haiku`, `effort: low`,
  sem `Write` nem `Edit`). O `apurar-ronda.js` passa a listar `paresCandidatos`: cada achado P0/P1
  novo da ultima ronda ao lado de outro achado do lado novo, no mesmo arquivo, a ate 10 linhas, com
  chave diferente. No Passo 3 do `/esquadro:revisar`, um juiz recebe a lista (lotes de ate 50 pares),
  a resposta vai em `mesmos.json` e a saida mostra `provaveisMesmos`. **A contagem nao muda:** ronda
  seca, abertos e teto seguem iguais, e o achado novo continua molhando a ronda. Repeticao de algo ja
  corrigido se prova na fonte, pelo `refutados.json`; a palavra do juiz nao e prova. `mesmos.json`
  ilegivel ou que nao e lista para a apuracao com a instrucao de corrigir ou apagar.
- **A pergunta ao dono passa por um portao.** Gancho novo antes do `AskUserQuestion`
  (`portao-decisao.js`): barra a pergunta que nao tem exatamente 3 opcoes, ou cuja primeira opcao
  nao traz a marca entre parenteses — `(Recomendado)`, `(Recomendada)`, `(Recommended)` ou
  `(Recom.)`, em qualquer caixa. Palavra solta ("Recomendado: x") ou negacao ("Nao recomendado") nao
  e a marca. A mensagem diz o que refazer. Um projeto com outra regra o desliga com
  `"portaoDecisao": false` no `.claude/esquadro/projeto.json` (so o booleano desliga). Falha do
  proprio portao libera a pergunta.
- **README:** tabela de ganchos com o portao novo (dez pontos do ciclo); a secao dos agentes e a
  excecao declarada de modelo passam a nomear o `inspetor` e o `juiz-mesmo`.

## 0.4.4 — o estilo escrito pelo shell passa pelo design, o fim de sessao limpa o estado velho e o commit conta pela linha do git

Tres pendencias que o usuario sente, do backlog de achados, e ajustes no init, na lente de seguranca,
no `/esquadro:auditar` e no README. Os comportamentos novos vem com teste; a suite inteira roda com
`npm test`.

- Sao **21 baldes** de contador: 16 que negam, 5 que so contam.
- **O arquivo de estilo escrito por comando de shell passa pelo design.** Gancho novo na entrada
  `Bash|PowerShell` (`portao-estilo.js`, balde `estilo_por_shell`): com `.claude/esquadro/design.json`,
  o comando que escreve arquivo de estilo e negado, e a mensagem manda usar Write ou Edit, que conferem
  os tokens. Sem o `design.json`, nada muda. O leitor do comando e heuristico: o que ele nao pega esta
  em "O que o esquadro NAO promete", no README.
- **O fim de sessao limpa o estado velho.** Gancho `SessionEnd` novo (`fim-sessao.js`): apaga os
  arquivos de sessao parados ha mais de 7 dias, nunca o da sessao que fecha, para o `--resume` seguir
  funcionando.
- **O commit conta pela linha do git.** Quando o Claude Code nao informa o `gitOperation` (ele some com
  `-q` e com `git -C` em caminho com espaco), o contador le a linha `[branch sha]` que o `git commit`
  imprime. Commit com `-q` nao imprime a linha e segue sem contar; o README diz isso.
- **O peso de instrucao conta as fontes candidatas.** Sem `projeto.json`, o init e o `/esquadro:auditar`
  somam ao peso os candidatos a fonte canonica que a varredura achou, marcados como candidatos
  (`fontes: 'candidatas'`). Fontes declaradas no `projeto.json` mandam, mesmo vazias.
- **Init: onde cada coisa se registra.** Passo 4b novo: pergunta um arquivo para as decisoes do dono,
  um para as duvidas abertas e um para o progresso do plano. No re-init com a skill do projeto ja
  gravada, o 7c nao grava por cima: o init mostra o trecho para o dono por na skill e avisa quando a
  resposta nao fica gravada.
- **Lente de seguranca de codigo:** tres conferencias antes de abrir P0 e a regra do P2, como a lente
  de tela.
- **README:** a versao nova chega alguns minutos depois de abrir a sessao e o aviso pode nao aparecer
  no painel (`claude plugin list` confere o que esta no disco); tabela de ganchos com os dois novos;
  subtitulo e link dos comandos corrigidos.

## 0.4.3 — o aviso de troca de chat que chega ao Claude, mensagens que dizem o que fazer e a doutrina de uso comum

Quem instala o plugin passa a ganhar a troca de chat com handoff, que antes so vinha do `CLAUDE.md`
de quem o escreveu. Nenhum portao novo. Os comportamentos novos vem com teste; a suite inteira roda
com `npm test`.

- **O aviso de troca de chat chega ao Claude, nao so a tela.** No fim do turno, uma vez por sessao, o
  Claude recebe a ordem de rodar `/esquadro:handoff`, dizer que e hora de abrir chat novo citando o
  gatilho e colar o prompt pronto. Se o fim de turno ja for de um laco de continuacao, o aviso espera
  o proximo. Funciona sem o `/esquadro:init`, com os limiares padrao.
- **Dois gatilhos novos e uma pergunta que dispara.** Contam as decisoes suas respondidas nas
  perguntas de escolha (padrao 3) e os commits que passaram (padrao 3, lidos do
  `gitOperation.commit.sha` que o Claude Code informa; sem o campo, o commit nao conta). Perguntar se
  o contexto ou a memoria da conversa esta bom dispara na hora, a cada vez.
- **README:** o que dispara, o que nao (erro de medicao e o tamanho da conversa, que gancho nao
  enxerga), como conferir que os ganchos rodam, o estilo de resposta (output style) e a atualizacao
  automatica pelo `~/.claude/settings.json` (`autoUpdate: true` na entrada do `esquadro-local`),
  porque o painel do VS Code nao tem o botao.
- **Mensagens que dizem o que fazer.** A medicao de qualidade diz como julgar os pares que faltam, o
  que conferir quando a abertura do plugin nao aparece ou aparece duas vezes, e qual chave do
  `projeto.json` falta quando o bloco aparece onde nao devia. A tabela de idioma nao mostra mais
  "undefined" quando a regra nao tem sugestao, e o subshell sugerido vem explicado.
- **O molde de agente ganha `effort`, `tools`, `maxTurns` e a escalada.** O gerador recusa, dizendo o
  valor aceito, esforco fora da lista, `maxTurns` que nao e inteiro positivo, ferramenta com nome
  invalido (nome de ferramenta MCP, com hifen, vale) e valor de tipo errado; o `escalaPara` sai da
  ordem da escada, nao da resposta.
- **Doutrina de uso comum na skill `padrao`.** Agente que edita por casamento exato nao fica no degrau
  mais barato; subagente que cai por limite de uso e relancado em outro modelo; tres conferencias antes
  de abrir P0 de seguranca; numero medido so depois da ultima edicao; as duas provas da mutacao;
  decisao anunciada e decisao gravada; hora so depois do `date`; escolha visual mostra a imagem antes
  de perguntar. As armadilhas de ambiente (`06-ambiente.md`) ganham: credencial que nao se contorna,
  envio e regeneracao no mesmo turno, comando que lista o ambiente e vaza segredo, codigo de saida de
  comando encanado, falha de `fork` do Git Bash, o `bash` do WSL e o caminho curto do Windows. No
  init, o `AGENTS.md` espelhado e conferido junto do `CLAUDE.md`.

## 0.4.2 — o leitor do `cd` mais fiel ao shell, a medicao que nao perde execucao paga e testes mais firmes

A segunda metade das pendencias conferidas contra o codigo: o leitor do `cd` solto e a tabela de
idioma, a medicao de qualidade e a higiene dos testes. Nenhum portao novo. Os comportamentos novos vem
com teste; a suite inteira roda com `npm test`.

- **O `cd` solto lido como o shell le.** Atribuicao, `time`, `!` e palavra entre aspas na frente deixam
  o `cd` em posicao de comando (`x=1 cd y` nega). Funcao do PowerShell so roda quando e chamada, e o
  que vem depois do `=` de atribuicao e lido como comando (`$x = Set-Location y` nega). Grupo `{ }` em
  cano roda em subshell e nao nega. `pushd a && popd` nao nega; `popd` dentro de `if`/`while` ou de
  funcao chamada depois de `&&` pode nao rodar e nao conta como volta. Comando com mais de 100 niveis
  de aninhamento nao e lido inteiro e passa a ser negado, com mensagem propria.
- **A tabela de idioma mais robusta.** Arquivo salvo com BOM se le; padrao vazio ou so de espaco e
  regra que nao se le (antes casava tudo); regra sem `achado` nao derruba a mensagem; o conferir e o
  aviso da tabela usam a mesma plataforma. O aviso diz que o comando seguinte ja usa a tabela
  consertada, a frase "troque de idioma" deixou a caixa alta e o eco do comando para em 120
  caracteres, dizendo o tamanho.
- **A medicao de qualidade nao perde execucao paga.** Falha ao ler a saida do claude vira motivo da
  geracao, que se grava; a gravacao final diz o que ficou sem gravar; "o claude rodou e foi parado"
  se separa de "nao rodou". `--prompt` sem valor e recusado com mensagem propria; arquivo do prompt que
  cairia em `.claude/esquadro/` ou `.git/` do brinquedo e recusado antes da 1a execucao; a dica de
  tirar as aspas de `ESQUADRO_CLAUDE`; montagem com mais de 10 minutos e dada como morta mesmo com o pid
  vivo.
- **A regua do voto do juiz mudou (leia antes de comparar rodadas).** Valem como "nao sei" tambem as
  frases curtas em 1a pessoa ("nao consigo dizer", "nao da para saber", "impossivel decidir"); aspas
  baixas e angulares simples citam; os preenchedores do hangul nao escondem o "nao sei"; aspa em numero
  impar na linha nao forma citacao; o fecho curvo usado dos dois lados so cita quando e o unico par da
  linha. Na duvida, o voto vira empate. Os votos reais ja medidos nao mudaram, mas uma rodada nova nao
  se compara com uma antiga sem dizer isso.
- **Testes mais firmes.** A catraca de tempo do portao destrutivo mede de novo antes de reprovar (um
  pico isolado sob carga nao derruba mais a suite); os testes de agentes e do `AGENTS.md` apagam a pasta
  temporaria que criam; a
  mensagem de teste pulado mostra o caminho com `/`. No init, o molde do `AGENTS.md` sai com acento e
  linhas de ate 100 caracteres, e o JSON de respostas e apagado no fim.

## 0.4.1 — erros que dizem a causa em portugues, o revisar mais firme e o escopo que nao se perde em link

A primeira metade das pendencias conferidas contra o codigo (mensagens, portoes, escopo e o
instrumento do revisar). Nenhum portao novo. Os comportamentos novos vem com teste; a suite inteira
roda com `npm test`.

- **Erro de arquivo dito em portugues, com o codigo no fim.** Os avisos que repetiam a mensagem do
  Node em ingles passam a dizer a causa: "nao existe", "sem permissao", "e uma pasta", "parte do
  caminho nao e uma pasta", "em uso", "ja existe", "disco cheio", com o codigo (`ENOENT`, `EACCES`...)
  entre parenteses. Vale nos scripts do revisar, na reinjecao, no escopo, na auditoria e no exportar.
- **O escopo nao se perde em link nem em arquivo ilegivel.** Arquivo de frente que existe e nao se le
  diz a causa e o que conferir. Frente que e link para fora do projeto nao e lida; pasta `escopos/`
  que e link para fora da lista vazia, com uma linha dizendo por que. Uma linha `---` deixou de virar item. Na
  reinjecao, o plano ativo se confere pelo caminho real, campo que nao e texto vira "Plano ativo
  ilegivel" (nunca `undefined`), e o corte da linha longa nao parte um emoji ao meio.
- **O revisar mais firme.** As duas lentes que tinham o mesmo nome nas duas familias agora se
  distinguem: "Fidelidade ao design system" e "Estados obrigatorios" ganham "(codigo)" e "(tela)", e a
  refutacao casa a lente certa. O gravador nao remapeia veredito antigo com o nome sem sufixo. O
  `apurar` le valor que comeca com `--` como valor, a menos que seja flag do uso; um `mapa.json`
  estragado vira "(mapa ilegivel)" na listagem em vez de derrubar o comando; entrada nula no
  `refutados.json` e "entrada invalida". O `preparar` nao deixa pasta vazia quando o arquivamento
  falha, avisa da revisao fechada no formato antigo, segue se outro `preparar` ja arquivou, e ignora
  `## ` dentro de bloco de codigo ao achar a regua. O gravador recusa pasta de ronda fora do projeto e,
  quando grava o veredito mas a marca falha, diz na hora que gravou.
- **Portoes e libs menores.** `travas`, `marchas` e `limiares` parciais no `projeto.json` se fundem por
  chave com o padrao, em vez de substituir o bloco inteiro. Catalogo consultado mais de um dia no
  futuro e invalido. Exportar sem nada para copiar e erro. A abertura diz "nao sei" quando o git nao
  responde. A auditoria tira o `\r` do CRLF ao medir e diz por que o `regras.md` e ilegivel. O portao
  destrutivo avisa mesmo quando gravar o estado falha. Sairam o campo `ultimaFerramenta` do estado, a
  funcao `extrairTokens` e as ferramentas `search` e `ls` da busca, que nada usava.
- **Dois baldes novos no contador, para o que o portao de escopo barra por motivos diferentes:**
  `frente_invalida` (nome de arquivo de frente fora da classe permitida) e `fora_declarado` (o arquivo
  casa o que o escopo declara "Fora"). Antes os dois somavam em `fora_do_escopo`, e quem lia o contador
  nao sabia qual dos tres motivos tinha barrado. Os dois entram na soma de bloqueios do gatilho de
  saude. Sao **20 baldes** de contador: 15 que negam, 5 que so contam.

## 0.4.0 — o bloco de qualidade de resposta, e a economia que saiu

Um recurso novo, ligado por padrao, e uma skill aposentada. Nenhum portao novo: o recurso nao barra
nada. Os comportamentos novos vem com teste; a suite inteira roda com `npm test`.

- **Toda sessao abre com um bloco de seis regras de clareza para as respostas ao usuario.** A
  abertura da sessao injeta o bloco: conclusao na primeira linha, sem preambulo nem cortesia, termo
  tecnico explicado na primeira vez, uma linha entre ferramentas, evidencia reduzida a linha que
  prova no bloco de saida, e nada de repetir o que o usuario acabou de ler ou decidir. O "Sai/Fica"
  de cada regra esta no proprio bloco. Texto gravado em arquivo (plano, decisao, handoff) fica fora.
  Funciona sem `/esquadro:init`: sem `projeto.json`, o bloco e tudo o que a abertura imprime. O
  custo e um bloco curto por abertura e nenhum por turno, com teto prendido por teste. O README traz
  o bloco literal e o numero de caracteres, e um teste prende que ele e igual ao que a abertura injeta.
- **Como desligar:** `"qualidadeDeResposta": false` em `.claude/esquadro/projeto.json`. So `false`
  desliga; outro tipo segue ligado e o portao de escrita avisa "qualidadeDeResposta tem de ser true ou false",
  como os outros avisos de tipo do `projeto.json`.
  O `init` nao pergunta nem grava a chave, e projeto ja gravado nao precisa mudar.
- **O bloco so entrou porque ganhou uma medicao A/B cega.** Doze perguntas congeladas, tres
  condicoes (com o bloco, a resposta padrao e o caveman), cada par julgado nas duas ordens por um
  inspetor que nao sabe qual lado e qual. Contra o caveman: 12 vitorias, 0 derrotas, 0 empates.
  Contra a resposta padrao: 4 vitorias, 3 derrotas, 5 empates. Tokens de saida, somados nas 12
  execucoes de cada condicao: padrao 30462, caveman 12732, com o bloco 22888. Medido no Sonnet; no
  Opus, nao medido. A margem contra a resposta padrao e curta, o texto foi ajustado uma vez olhando
  as derrotas destas mesmas perguntas (sobreajuste possivel), e sessao longa nao foi medida. O
  instrumento vem no plugin: `scripts/medir-qualidade.js`, com as perguntas em
  `modelos/qualidade-prompts.json`; o placar inteiro esta no README.
- **A `/esquadro:economia` saiu.** As regras dela foram para dois lugares: a regra do tamanho das
  opcoes (uma ou duas frases, com a consequencia e o custo dentro; mais que isso e duas escolhas) foi
  para a skill `padrao`, e as outras viraram o bloco da abertura. A skill e o teste dela sairam do
  plugin; o instrumento de fecho (a resposta enxuta que ainda traz o bloco de saida passa, e sem o
  bloco e barrada) segue provado, agora com exemplos proprios. A skill `padrao` passa a apontar para
  o bloco da abertura, e o teste de "todo comando que o CHANGELOG anuncia existe" aceita o comando
  que o proprio CHANGELOG diz que saiu, em qualquer entrada.
- **O README ganha o passo a passo para ligar a atualizacao automatica** do marketplace, em "Como
  instalar": plugin de terceiro nao se atualiza sozinho ate esse botao ser ligado.
- **Os contadores nao mudaram:** sao **18 baldes** de contador: 13 que negam, 5 que so contam.

## 0.3.5 — o `cd` solto lido de uma vez, a tabela do PowerShell que avisa e a auditoria que nao cala

Tudo o que a revisao da 0.3.4 deixou registrado. Nenhum portao novo. Os comportamentos novos vem com
teste; a suite inteira roda com `npm test`.

- **O `cd` solto se acha numa leitura so do comando.** O detector era uma pilha de filtros, e cada
  um errava o que o outro ja tinha tirado ou ainda nao. Agora o comando se le de uma vez, no idioma
  da ferramenta: aspas (com `$'...'` no Bash), comentario, heredoc e here-string, subshell e cada elo
  de cano no Bash, a subexpressao `$( )` do PowerShell (que roda, mesmo dentro de aspa dupla), chave
  de hashtable, e se a palavra esta mesmo em posicao de comando. Passam a ser negados: o `cd` depois
  de um `<<EOF` escrito em comentario, `"$(Set-Location X)"`, o `cd` no braco de um `case`,
  `` c`d `` e o `cd` depois de uma aspa `$'...'`. Deixam de ser negados: `@{ cd = 1 }`,
  `Push-Location` sem caminho, `sl\`, `then` e `do` como argumento, `pushd X; ...; popd` no Bash,
  `echo a | cd X` e a definicao de uma funcao com `cd` (chamar a funcao segue negado). Um `popd`
  depois de `&&` ou `||` nao conta como volta garantida.
- **A tabela do PowerShell que nao se le avisa, em vez de calar.** Se `modelos/shell-win32.json` nao
  se le, ou uma regra dela nao compila, a trava de idioma se desligava calada. Agora o comando passa
  e sai um aviso, uma vez por sessao, com o arquivo ou a regra e a causa. A tabela tambem passou a
  ler as aspas como o PowerShell le. O contador ganhou o balde `shell_tabela_quebrada`, que so conta:
  sao **18 baldes** de contador: 13 que negam, 5 que so contam.
- **A auditoria diz quando nao leu as regras.** Um `regras.md` que nao se le dava "nenhuma
  contradicao". Agora a saida ganha a chave `regras`: lidas, ou nao lidas com a causa e o que fazer.
  A medida do `MEMORY.md` conta linhas e bytes fora da carga a partir do mesmo corte, e a dica de
  erro muda com a causa (caminho, pasta no lugar do arquivo, permissao).
- **Os avisos do gravador de vereditos dizem o que fazer.** O aviso traz a lente quando ela se le, e
  explica como gravar a mao (salvar o JSON do inspetor como `<pasta>/<lente>.json`), em vez de
  "como antes".
- **`destrutivo: false` no `projeto.json` desliga tambem o `cd` solto**, como ja fazia; agora o
  README e o `init` dizem isso, e um teste prende.

## 0.3.4 — vereditos gravados sozinhos, `cd` solto negado e a memoria medida

Tres pontos medidos no uso da 0.3.3. Os comportamentos novos vem com teste; a suite inteira roda com
`npm test`.

- **Os vereditos da revisao cega se gravam sozinhos.** Um hook novo (`gravar-veredito.js`) le a
  resposta do inspetor pelos dois caminhos que o Claude Code entrega (`SubagentStop` e o
  `SubagentHandback`) e grava `<lente>.json` na pasta de vereditos da ronda. O inspetor devolve a
  chave da lente e a pasta que o briefing passou; o hook so grava se ela for a `vereditos` de uma
  ronda de verdade, com `A.txt` e `B.txt` ao lado. Nunca sobrescreve, nunca barra o inspetor e nunca
  cala: o que nao gravou vira aviso com a causa e a pasta, para gravar a mao como antes.
- **`cd` solto e negado nas ferramentas Bash e PowerShell.** A pasta atual persiste de uma chamada
  para a outra, e o `git` seguinte age no repositorio errado. O portao agora nega o `cd` no nivel de
  cima do comando e mostra a forma que devolve a pasta: subshell no Bash, `Push-Location` com
  `Pop-Location` no PowerShell, ou `git -C`/`npm --prefix`. Texto entre aspas, comentario e corpo de
  heredoc nao contam; o escape e o `comandosLiberados` do `projeto.json`. As tres instrucoes do
  proprio plugin que usavam `cd` solto mudaram para a forma aceita. O contador ganhou o balde
  `cd_solto`: sao **17 baldes** de contador: 13 que negam, 4 que so contam.
- **A auditoria mede o `MEMORY.md`.** Com `--memoria <caminho>` (a skill passa o caminho), a saida
  ganha a chave `memoria`: linhas, bytes, maior linha e o que fica fora da carga da sessao, contra o
  limite da documentacao (as primeiras 200 linhas ou 25 KB, lido como 25.000 bytes). A medida sai a
  parte e nao soma no teto de instrucao. Sem caminho, ou arquivo que nao se le, diz "nao medida" e a
  causa.

## 0.3.3 — revisao que nao aprova sem voto, e revisao nova que comeca do zero

Dois defeitos da revisao cega, e o acabamento dos pontos que a revisao da 0.3.2 deixou registrados.
Nenhum portao novo. Os comportamentos novos vem com teste; a suite inteira roda com `npm test`.

- **Ronda sem voto nao e ronda seca.** Uma ronda sem nenhum veredito contava como seca, e duas
  assim aprovavam a revisao sem nenhum inspetor lido. Agora o `apurar-ronda.js` para com erro que
  diz qual ronda e o que fazer (gravar os vereditos dela, ou apagar a pasta da ronda preparada por
  engano); a pasta de vereditos que nao se le para com a causa, em vez de contar como vazia. Se
  nenhuma lente achou nada grave, a ronda seguinte chama ao menos uma.
- **Revisao nova de arquivo ja revisado comeca do zero.** Preparar de novo um arquivo cuja revisao
  ja fechou herdava as rondas antigas e o teto gasto. Agora o `preparar-revisao.js` move a revisao
  fechada inteira para `.claude/esquadro/revisao-fechada/<arquivo>/<carimbo>/` (nada se apaga), diz
  para onde ela foi e comeca na ronda 1.
- **Apuracao da revisao.** `refutados.json` que nao e lista e `mapa.json` presente mas corrompido
  param com erro que cita o arquivo; antes viravam lista vazia e ronda sem mapa, calados. O arquivo
  revisado e reconhecido tambem com `../` no meio do caminho e, quando o disco diz que e o mesmo
  arquivo, com outra caixa. O id de sessao que vem do ambiente so e conferido quando o fecho vai ser
  contado. Erro da apuracao diz onde corrigir; fecho contado sem sessao avisa que nao entrou no
  contador de nenhuma e como evitar na proxima (`--sessao <id>`).
- **Preparo da revisao.** Git que falha ao ler o `HEAD` (processo morto, objeto que nao se le) nao
  passa mais por arquivo novo; repositorio sem commit segue tratando tudo como novo. Arquivo maior
  que o limite no `HEAD` tem mensagem propria, sem "rode de novo". A regua do projeto e lida antes
  de criar a pasta e gravada junto com o pacote, e "nenhuma regua declarada" so aparece quando nao
  ha regua. Arquivo com nome comecando por `--` e aceito, e `--semente ''` e erro de uso. O aviso do
  formato antigo procura o id em todas as pastas numeradas, e as mensagens de git ausente e de id
  nao achado dizem o proximo passo.
- **Portao de escopo.** Link simbolico em `escopos/` cujo destino fica fora do projeto nao entra na
  lista de frentes (antes a linha do objetivo do destino aparecia no aviso). Marcador `-` sozinho
  na linha nao e item. Frente que nao se le diz que nao se leu, com o codigo do erro, em vez de
  "(sem objetivo)". As mensagens do intocavel e da trava 5 dizem onde a lista mora e o que a
  ampliacao do escopo conta, em tom neutro.
- **Reinjecao.** O aviso do `projeto.json` diz a causa (nao se le, com o codigo do erro; JSON
  quebrado; nao e objeto) e que `/esquadro:init` de novo o regrava com as respostas dadas. Regras
  ou plano que nao se leem viram uma linha com a causa, em vez de sumir calados. Plano apontado para
  fora do projeto nao se le. Cada valor do `projeto.json` entra numa linha so, com limite de tamanho.

## 0.3.2 — mensagens que dizem o que fazer, e erro que nao passa calado

Acabamento dos pontos que a revisao da 0.3.1 deixou registrados. Nenhum portao novo. Os
comportamentos novos vem com teste; a suite inteira roda com `npm test`.

- **Apuracao da revisao.** `--sessao` sem valor, ou com caractere fora de letras, numeros, `_` e
  `-`, para com erro antes de contar (vale tambem para o id que vem do ambiente). Um `fechada.json`
  que se le mas nao e o registro do fecho (ex.: `{}`) para com erro, em vez de contar o fecho de
  novo. O arquivo de uma revisao no formato antigo e comparado sem diferenca de grafia (barra
  invertida, `./` na frente). "refutados.json ilegivel" cita a base e diz o que fazer, e a leitura
  das rondas tem um tratamento so, com o proximo passo.
- **Preparo da revisao.** Git que nao responde ao ler o `HEAD` (tempo esgotado, falha ao iniciar)
  para com erro e nao grava nada; antes o arquivo passava por novo, com o lado antigo vazio. Falha
  ao ler o arquivo ou ao gravar o pacote diz o caminho e o que fazer, sem stack trace; a pasta de
  ronda que ficou pela metade e citada, para ser apagada. `--arquivo` ou `--semente` sem valor e
  erro de uso. O aviso do formato antigo diz para onde mover as pastas: `revisao/<id>/`, com o id.
- **Portao de escopo.** As mensagens dizem o que e a marcha (o nivel de rigor que o
  `projeto.json` da ao caminho), o que a trava 4 e a trava 5 guardam e o que e uma frente. Link
  simbolico para arquivo em `escopos/` e frente; link quebrado e pasta nao sao. A lista de frentes
  tira so o arquivo vinculado: em disco que diferencia caixa, `Foo.md` e `foo.md` sao duas frentes.
- **Reinjecao.** Um `projeto.json` presente e ilegivel (JSON quebrado, ou que nao e objeto) deixa
  de sumir calado: uma linha diz que ele nao se le e o que fazer. Ausente segue como antes.

## 0.3.1 — revisao por arquivo e acabamento do escopo por frente

Pendencias achadas na revisao da 0.3.0 e no uso dela. Nenhum portao novo. Os comportamentos novos
vem com teste; a suite inteira roda com `npm test`.

- **Revisao cega, uma base por arquivo.** O `preparar-revisao.js` grava em
  `.claude/esquadro/revisao/<arquivo>/<n>/`, e o `apurar-ronda.js --arquivo <caminho>` apura a base
  daquele arquivo: varios arquivos revisados juntos deixam de se misturar como rondas de uma revisao
  so. Sem `--arquivo`, uma base unica e achada sozinha; com mais de uma, o script para e lista os
  arquivos. Revisao em andamento no formato de antes (pasta numerada solta em `revisao/`) segue
  nele ate acabar, com aviso.
- **Fecho contado uma vez.** Revisao fechada grava `fechada.json` na base; rodar o apurar de novo nao
  conta o fecho outra vez, e a saida diz que ja foi contado.
- **Apuracao que nao cala.** Erro que antes passava em silencio agora para com o que fazer:
  `--arquivo` sem valor, arquivo sem base quando so ha revisao de outro, `fechada.json` ilegivel,
  falha ao gravar o fecho, e erro de leitura que nao e "nao existe".
- **Arquivo so de logica.** O `/esquadro:revisar` dispensa a lente `design` em arquivo que nao e de
  estilo e nao monta tela: as de codigo sem ela. Na duvida, todas as de codigo.
- **Escopo por frente.** O aviso de vinculo diz o que fazer se a tarefa mudou; a lista de frentes da
  abertura nao repete a vinculada e some quando fica vazia; uma pasta chamada `x.md` em `escopos/`
  nao e frente; a reinjecao cita a frente pelo nome do arquivo que vale.
- **Sessao sem interacao.** O README explica que em `claude -p` o Claude Code nega escrever em
  `<projeto>/.claude/**`: o arquivo da frente tem de existir antes, e o agente le antes de editar.

## 0.3.0 — escopo por frente

Duas frentes de trabalho no mesmo projeto deixam de disputar um `escopo.md` so. Nenhum portao novo:
muda o arquivo que o portao de escopo le.

- **Escopo por frente.** Cada frente pode ter o seu arquivo em `.claude/esquadro/escopos/<frente>.md`,
  no mesmo formato do `escopo.md`. Editar esse arquivo vincula a sessao a frente, e a partir dai o
  portao de escopo, o de agente caro, a reinjecao das regras e o aviso de abertura leem so ele. Sem
  vinculo, vale o `escopo.md` de sempre: projeto que ja usa o plugin nao precisa mudar nada.
  Aposentar uma frente e mover o arquivo dela para fora da pasta. Nome de frente com caractere fora
  de letras sem acento, numeros, `_` e `-` e negado.
- **Abertura.** Havendo frentes na pasta, a sessao abre com a lista delas e o objetivo de cada uma,
  e com o jeito de se vincular. As mensagens de negacao citam o arquivo de escopo em vigor.
- **Versao.** O `package.json` passa a ter a versao do manifesto, e um teste reprova se discordarem.

## 0.2.0 — correcao dos portoes

Doze defeitos achados usando o plugin num projeto real, e um achado da revisao deles. Cada correcao
tem teste que reprovava antes e mutacao plantada que o teste acusa. Nenhum portao novo: o que muda e
onde os de antes erravam.

- **Raiz do projeto.** Os hooks acham o projeto subindo a partir da pasta da sessao: sessao aberta
  numa subpasta passa a ler o `projeto.json`, as regras e o `escopo.md` da raiz.
- **Escopo.** Caminho com anotacao depois dele (`src/** (so o modulo X)`) passa a casar; a secao
  "Fora" nega em qualquer marcha; escopo herdado de outra tarefa ganha aviso.
- **Revisao cega.** So os achados do lado novo contam para a ronda; os do lado antigo saem listados a
  parte. Achado refutado na fonte primaria vai em `refutados.json`, com prova e severidade. Arquivo
  novo vira pacote com um lado vazio. A regua do projeto vai no pacote, e o inspetor a le.
- **Idioma de shell.** O portao olha a ferramenta: no Windows o Bash e o Git Bash, e `&&` nele nao e
  idioma errado. Here-string do PowerShell nao e lida como comando.
- **Comando destrutivo.** O corpo de um heredoc so deixa de ser lido quando o comando inteiro e um
  unico `cat` ou `tee` com corpo inerte, texto que o bash nao executa; qualquer outra coisa no comando,
  le tudo. `-Confirm:$false` conta como forcado, como o `-f` do `rm`.
- **Contador de agentes.** Trava por sessao e gravacao atomica: despachos em paralelo nao perdem
  contagem.
- **Aviso de `intocaveis`.** Padrao que aponta para pasta que existe no disco, fora do git, deixa de
  ser dado como padrao que nao pega nada.
- **Menores.** `experimento.js`: linha do outro manual com id repetido ganha o prefixo `outro:`, e a
  prosa sai no stderr (o stdout e JSON puro). Modulo de design: `.04em` e lido como medida.

## 0.1.0 — v1

Primeira versao. Oito travas; todo portao e um script deterministico, sem modelo no meio.

Cada trava nasceu de uma falha nomeada — mecanismo sem falha de origem e decoracao, e foi por esse
criterio que o que nao tinha origem ficou de fora.

### Portoes de custo zero, sempre ligados

- **Trava 3 — fecho sem evidencia.** Bloqueia o fim do turno quando a resposta alega sucesso sem
  colar a saida. Bloqueia tambem quando ha subitem aberto na tarefa do plano ativo.
- **Trava 4 — arquivo fora do escopo.** Bloqueia a escrita fora do `escopo.md` declarado, e o
  arquivo marcado como intocavel mesmo quando o escopo o cobriria.
- **Trava 5 — comando destrutivo e sessao concorrente.** Bloqueia o comando que apaga sem volta, o
  idioma de shell errado, e a escrita em arquivo que outra frente ja mexeu — contra a foto do
  `git status` tirada na abertura da sessao.
- **Trava 6 — agente caro em marcha rapida.** Bloqueia o despacho do modelo do topo quando o escopo
  so tem caminhos de marcha rapida. Conta todo despacho, inclusive os que permite.
- **Trava 7 — criar sem ter procurado.** Bloqueia arquivo novo quando nada foi buscado no turno.
  Editar existente nunca e barrado, e nomear o arquivo no `escopo.md` libera.
- **Trava 8 — catraca afrouxada.** Bloqueia a edicao que sobe um teto ou desce um piso. Apertar a
  regua passa sempre. Unica trava sem botao de desligar.

Modulo opcional, so com `design.json`: bloqueia cor ou medida fora do design system. Medida so se
confere em `px`, `rem` e `em`: `%` e as outras unidades passam sem conferencia.

### Comandos

- **`/esquadro:init`** — varre o repositorio, mostra o que inferiu e faz **seis** perguntas que
  varredura nenhuma responde; a sexta e a escada de agentes do projeto, do mais barato ao mais
  caro, com o apelido de modelo de cada degrau. Grava sempre `projeto.json` e `regras.md`, e
  registra a conferencia do catalogo de modelos da instalacao em `catalogo.json`. O resto e
  opcional: `design.json`, so quando ha design system, e, cada um so com aprovacao explicita e sem
  sobrescrever arquivo que ja exista, os agentes do projeto em `.claude/agents/`, a `SKILL.md` do
  projeto e o `AGENTS.md` na raiz. Rodado de novo no mesmo projeto, reabre a configuracao: pergunta
  so o que faz sentido reperguntar e mostra o que mudou antes de gravar.
- **`/esquadro:revisar`** — revisao cega A/B em lentes distintas: **nove** de codigo, **oito** de
  tela, e **dezessete** quando a mudanca e de codigo e de tela. Default reprovar, apuracao por
  script, teto de tres rondas.
- **`/esquadro:aprender`** — correcao vira regra proposta no formato `gatilho -> acao`; nada e
  gravado sem aprovacao explicita.
- **`/esquadro:handoff`** — texto de continuacao para um chat novo, conferido no disco.
- **`/esquadro:auditar`** — mede o peso de instrucao contra o teto e aponta o que cortar:
  sobreposicoes, contradicoes e itens fora da rubrica.
- **`/esquadro:economia`** — poe o ritual obrigatorio no tamanho certo: o preambulo sai inteiro, a
  evidencia encolhe para o numero que prova, e nada do ritual e removido, so reformulado.

A skill `padrao` vem junto e nao e comando: e o manual de execucao, que o agente carrega no comeco
da tarefa. Ela absorve a skill universal que existia em separado, e declara as duas familias de
lentes e qual delas o `revisar` despacha para cada mudanca.

### O mapa de modelos que envelhece

Nenhum nome de modelo mora no plugin: os apelidos nascem no projeto, pela entrevista, e a deteccao
de envelhecimento e uma escada de gatilhos. A unica excecao e o agente `inspetor`, que o `revisar`
despacha, e ela esta declarada no README.

- **Gatilho 1 — na instalacao.** Ao terminar, o `init` confere o catalogo de modelos e registra a
  conferencia. Atualizar o plugin nao confere nada, e isso esta dito no README.
- **Gatilho 2 — no agente principal.** A skill `padrao` compara os apelidos gravados no projeto com
  o catalogo que o harness entregou na sessao. Nunca num subagente: ele recebe a propria
  identidade, nao o catalogo. O cache e o limite de frequencia da consulta ficam num script que
  nao abre conexao.
- **Gatilho 3 — hook.** Compara o `model:` de cada agente com o apelido gravado no `projeto.json`,
  arquivo com arquivo, offline. Avisa, deixa passar e mostra o conserto nas duas direcoes, porque
  nao tem como saber qual dos dois lados envelheceu.
- **Apelidos vivos.** `node scripts/provar-apelidos.js` monta o roteiro, o agente principal sonda,
  e a suite reprova quando um apelido sondado foi recusado. Sem sondagem, fica "nao provado", e
  isso nao reprova. `--plugin` sonda o apelido do proprio `inspetor`.

### Ferramentas de linha de comando

- `node scripts/cobertura.js` — quais portoes este ambiente verifica, quais nao, e por que.
- `node scripts/cicatriz.js` — para cada regra do manual, se existe decisao, incidente ou achado
  atras dela. Mede e propoe; podar e decisao de quem mantem o manual.
- `node scripts/plataforma.js` — em que sistemas cada trecho dependente de plataforma foi de fato
  exercitado. A matriz e varrida do codigo, e a suite reprova ponto novo que ela nao declare.
- `node scripts/sanitar.js` — o detector de sanitacao como comando, nas tres superficies. A suite
  reprova so pelo conteudo; autoria e mensagem exigem o historico do git, e ficam no comando.
- `node scripts/exportar.js` — monta, numa pasta a parte, exatamente o que iria para um repositorio
  publico, com a mesma lista que o detector audita, e confere quantos arquivos copiou.
- `node scripts/experimento.js` — monta a tabela de obrigacoes do seu manual, cruzada com a de
  outro manual passado por `--manual`, e julga o resultado gravado do experimento: o plugin bastou,
  ou ainda falta manual. O veredito sai no codigo de saida; so o experimento mal feito reprova a
  suite.

### Medicao

- Controle positivo **e** negativo por mecanismo, em toda a suite. O numero de testes nao fica
  congelado aqui de proposito: ele muda a cada mudanca e ninguem volta a um changelog para
  corrigi-lo. Quem quiser o numero roda `npm test` e le o que saiu.
- **16 baldes** de contador: 12 que negam, 4 que so contam. `node scripts/uso.js` lista os disparos.
- Detector de sanitacao embutido: reprova o repositorio se dado pessoal vazar, em tres superficies
  — conteudo dos arquivos, autoria do historico e mensagem de commit.
