# Changelog

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
