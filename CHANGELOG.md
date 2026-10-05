# Changelog

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
