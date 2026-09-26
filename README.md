# `esquadro`

Um plugin do Claude Code que **força o agente a provar em vez de afirmar**.

Em português, "fora de esquadro" já significa exatamente aquilo que este plugin existe para pegar:
a coisa que parece certa e não está.

**Todo portão é um script determinístico. Nenhum modelo no meio.** Um portão que dispara no fim de
toda resposta não pode custar token, e um modelo julgando se houve evidência é o mesmo modelo que
inventou a evidência.

---

## As oito travas

| # | Trava | O que bloqueia | Custo em execução |
|---|---|---|---|
| 1 | Entrevista → configuração sob medida | Nada. Gera a configuração do projeto pelo comando `/esquadro:init`. | tokens 1× por projeto, com teto declarado |
| 2 | Revisão cega A/B por lentes distintas | Nada. Apura por script, pelo comando `/esquadro:revisar`. | tokens só quando invocado |
| 3 | Fecho sem evidência | O fim do turno, quando a resposta alega sucesso sem colar a saída. Hook `Stop`. | zero |
| 4 | Arquivo fora do escopo declarado | A escrita, quando o alvo não está no `.claude/esquadro/escopo.md`. Hook `PreToolUse` em `Write` e `Edit`. | zero |
| 5 | Comando destrutivo e sessão concorrente | O comando que apaga, e a escrita em arquivo que outra frente já mexeu. Hook `PreToolUse` em `Bash` e em `Write`/`Edit`, contra a foto do `git status` da abertura. | zero |
| 6 | Agente caro em marcha rápida | O despacho do agente do topo da escada quando o escopo declarado só tem caminhos de marcha `rapida`. Hook `PreToolUse` em `Task`/`Agent`. Conta **todo** despacho, inclusive os que permite. | zero |
| 7 | Criar sem ter procurado | A criação de arquivo **novo** quando nada foi buscado antes no turno. Editar arquivo existente nunca é barrado — quem edita já achou —, e nomear o arquivo no `escopo.md` também libera: declarar já é deliberar. | zero |
| 8 | Catraca afrouxada | A edição que **sobe um teto** ou **desce um piso** (`teto`, `limite`, `maximo`, `tolerancia`; `minimo`, `piso`, `cobertura`). Apertar a régua passa sempre; afrouxar é decisão humana, não efeito colateral de uma correção. | zero |

As travas 3 a 8 são portões de custo zero. **As travas 3 e 5 funcionam sem
`/esquadro:init`.** A trava 4 também funciona sem ele, mas só nega por escopo depois que existir um
`.claude/esquadro/escopo.md` declarado. A trava 6 é a única que **exige** o `projeto.json`: sem a
escada de agentes gravada lá, ela conta o despacho e não opina.

Quantas vezes cada trava disparou neste projeto:

```
node scripts/uso.js
```

Ele lê `.claude/esquadro/contadores.json` e lista os disparos em ordem decrescente, com o total.
É daí que sai o que entra na v2 — não da matriz da pesquisa.

---

## Como instalar

### Para desenvolver

Aponta a sessão para o repositório. Editar um script e reabrir a sessão basta:

```
claude --plugin-dir "<caminho do repositório do esquadro>"
```

### Para o dia a dia

Pelo marketplace local que acompanha o repositório (`.claude-plugin/marketplace.json`):

```
/plugin marketplace add <caminho do repositório do esquadro>
/plugin install esquadro@esquadro-local
```

---

## Os seis comandos

| Comando | O que faz |
|---|---|
| `/esquadro:init` | Varre o repositório, mostra o que inferiu e faz seis perguntas que varredura nenhuma responde. Grava sempre `.claude/esquadro/projeto.json` e `.claude/esquadro/regras.md`, e registra a conferência do catálogo de modelos da instalação em `.claude/esquadro/catalogo.json`. O resto é opcional: `.claude/esquadro/design.json` (só quando há design system) e, cada um só com aprovação explícita e sem sobrescrever arquivo que já exista, os agentes do projeto em `.claude/agents/`, a skill do projeto em `.claude/skills/<slug>/SKILL.md` e o `AGENTS.md` na raiz. |
| `/esquadro:revisar` | Revisão cega A/B de um arquivo mudado: rotula os dois lados sem autoria, despacha um inspetor por lente, **nove** de código, **oito** de tela, e **dezessete** quando a mudança é de código e de tela, com default reprovar, e apura por script com teto de 3 rondas. |
| `/esquadro:aprender` | Transforma uma correção sua em regra proposta no formato `gatilho -> ação`, mostra pronta, e **só grava depois de aprovação explícita**. |
| `/esquadro:handoff` | Gera o texto de continuação para um chat novo: caminhos, `HEAD`, em que etapa o trabalho está, decisões já tomadas, pendências e erros de método que custaram tempo. Confere os fatos no disco, não na memória. |
| `/esquadro:auditar` | Mede o peso de instrução do projeto contra um teto e aponta o que cortar: skills que se sobrepõem, regras que se contradizem e itens fora da rubrica. Não acrescenta — poda. |
| `/esquadro:economia` | Põe o ritual obrigatório no tamanho certo: o preâmbulo sai inteiro, a evidência encolhe para o número que prova, cada opção cabe em uma ou duas frases. Nada do ritual é removido — só reformulado. |

A sétima skill instalada, `padrao`, **não é comando**: é o manual de execução, que o agente carrega
no começo da tarefa e que traz junto a conferência do mapa de modelos deste projeto.

Só as travas 1 e 2 são comandos. Os outros quatro **não são travas**: `aprender` é o
autoaprimoramento mínimo — o plugin **não aprende sozinho**, ele transforma correção em proposta e
espera o OK; `handoff`, `auditar` e `economia` são ferramentas de manutenção, e nenhum deles bloqueia nada.

---

## As ferramentas de linha de comando

Não são travas nem comandos do agente: são scripts que você roda quando quer o número.

| Rodar | O que devolve |
|---|---|
| `node scripts/uso.js` | quantas vezes cada trava disparou neste projeto |
| `node scripts/cobertura.js` | quais portões este ambiente consegue verificar, quais não, e por quê |
| `node scripts/cicatriz.js` | para cada regra do seu manual: existe decisão, incidente ou achado atrás dela? |
| `node scripts/plataforma.js` | em que sistemas cada trecho dependente de plataforma foi de fato exercitado |
| `node scripts/sanitar.js` | se algum dado seu vazou, nas três superfícies: conteúdo, autoria do histórico e mensagem de commit |
| `node scripts/exportar.js` | monta, numa pasta à parte, exatamente o que iria para um repositório público |
| `node scripts/experimento.js` | monta a tabela de obrigações do seu manual e julga o resultado: o plugin bastou, ou ainda falta manual? |

Os dois últimos existem porque este repositório foi publicado, e a montagem à mão já errou uma vez:
saiu com 92 arquivos de 95, e os que faltavam eram justamente o detector de vazamento e o teste
dele. Quem pegou o erro foi o contador de testes, não a leitura da lista.

---

## O que o `esquadro` NÃO promete

Dito agora para não virar promessa quebrada depois:

- **Sessões concorrentes no caso geral.**
- **Autoaprimoramento automático.**
- **Julgar se a interface ficou bonita.**
- **Regressão silenciosa do provedor.**
- **Impedir que o agente amplie o próprio escopo.**
- **Barrar escrita de arquivo feita por comando de shell.**
- **Distinguir citação de execução num comando.**
- **Tratar caixa de letra igual em todo sistema de arquivos.**
- **Interpretar o comando como um shell interpreta.**
- **Partir o introdutor do `cmd` quando ele vem colado ao comando.**
- **Ler comando embrulhado em base64.**
- **Cobrir toda forma de apagar que existe.**
- **Reconferir o catálogo de modelos quando o plugin é atualizado.**
- **Conferir, no portão de design, medida em `%` ou em unidade que não seja `px`, `rem` ou `em`.**

Cada uma dessas quatorze tem o **limite medido** por trás — quantas formas passam, quais falsos
positivos são aceitos e por quê, e qual decisão fechou o assunto. Limites **declarados**, não
descobertos depois.

Boa parte desse limite está exercitada nos testes, que **vão junto**: `test/destrutivo.test.js`
percorre as formas de apagar uma a uma, e cada teste que acusa vem com o par que **não** pode
acusar. É lá que se confere o que está escrito acima.

---

## Os seis limites que não fecham

As quatorze acima são promessas que este plugin **escolheu não fazer**. Estas seis são outra coisa:
propriedades do mundo, que trabalho nenhum resolve. Estão escritas aqui porque limite declarado
não é buraco — buraco é o que ninguém disse.

- **O julgamento custo × capacidade.** Qual modelo vale o preço depende do seu bolso e da sua
  tarefa. O plugin pergunta, registra a sua resposta e confere depois se ela ainda vale; escolher
  por você seria chutar com o seu dinheiro.
- **A janela entre um modelo novo sair e a próxima conferência.** Não há calendário nem aviso: a
  conferência acontece quando você instala e quando pede — atualizar não confere nada, e isso
  está na lista acima. A janela tem o tamanho do intervalo entre os seus próprios usos — quem usa
  muito é conferido muito, e quem quase não usa também quase não despacha agente. O buraco é
  maior onde custa menos.
- **O ambiente da outra pessoa.** Busca desligada por política da empresa, máquina sem rede, conta
  sem acesso a um modelo. Dá para degradar com elegância e dizer o que não deu; não dá para fazer
  funcionar.
- **Campo de configuração que ninguém documentou.** Alguns campos de frontmatter de agente
  funcionam hoje e podem sumir sem aviso, porque nunca foram prometidos. O teste de apelidos vivos
  detecta quando um deles deixa de valer; impedir, não impede.
- **O harness muda.** Evento de hook, formato de plugin, campo de configuração. Guardar o método
  em vez do resultado reduz o estrago — não o elimina.
- **Conferência que vive em instrução não é determinística.** Só hook é garantido. A comparação
  com o catálogo de modelos do harness precisa rodar no agente principal, e instrução a um modelo
  pode ser pulada. É por isso que a guarda que precisa ser garantida — comparar arquivo com
  arquivo — é hook, e não skill.

Há um sétimo, menor, que vale dizer junto porque surpreende: **a auditoria de instruções liga
regra e histórico por palavra exata.** `publicar` não casa `publicado`. A lista de "sem cicatriz"
que ela devolve é pergunta, não sentença.

**E uma exceção, declarada.** O plugin não guarda nome de modelo, com uma exceção: o agente
`inspetor`, que o `/esquadro:revisar` despacha, declara no próprio arquivo um apelido de modelo
e um esforço, para que toda revisão não saia no modelo mais caro da sessão. É o único lugar. Se
o apelido deixar de valer, o teste de apelidos vivos acusa e diz qual — rode
`node scripts/provar-apelidos.js --plugin` e sonde de novo.

---

## Em que sistemas isto rodou

**Windows, e só.** Linux e macOS **não foram testados** — nem aqui nem em integração contínua,
que este projeto não tem.

Isso não quer dizer a mesma coisa em todo ponto do código, e a diferença está medida. Boa parte
do que depende de sistema entra por **parâmetro**, e aí o comportamento dos três se exercita de
qualquer máquina: a tabela de idioma de shell recebe a plataforma de quem chama, não a adivinha.
O que sobra depende do sistema de verdade, e sobre esse trecho ninguém mediu nada fora do Windows.

```
node scripts/plataforma.js
```

Ele imprime a matriz ponto a ponto e termina dizendo quantos deles seguem sem teste em cada
sistema. A lista **não é escrita à mão**: é varrida do código a cada rodada da suíte, e a suíte
reprova se aparecer no código um ponto dependente de sistema que a matriz não declara. Lista
escrita à mão envelhece calada; esta não tem como.

---

## Como desligar uma trava

Em `.claude/esquadro/projeto.json`, na chave `travas`:

```json
{
  "travas": {
    "fecho": false,
    "destrutivo": true,
    "outraFrente": true,
    "escopo": true
  }
}
```

As quatro chaves são obrigatórias e booleanas. **Três desligam de verdade:**

| Chave | `false` desliga |
|---|---|
| `fecho` | a cobrança de evidência no fim do turno (trava 3). O ledger de contadores continua sendo escrito. |
| `destrutivo` | o bloqueio de comando destrutivo (trava 5). |
| `outraFrente` | o bloqueio por arquivo de outra frente (trava 5). |

**`escopo` é a exceção, e está dito aqui para não enganar ninguém:** a chave é obrigatória no
schema, mas **nenhum portão a lê**. Pôr `"escopo": false` não desliga a trava 4 — a decisão do
portão é idêntica com ela ligada ou desligada. Ficou assim de propósito: uma trava que devolvesse
"permitir" antes da verificação de intocáveis faria uma configuração que hoje **nega** passar a
**permitir** um segredo. Nada piora; uma coisa deixa de melhorar.

Trava que você desligou fica desligada. Religar calado seria a mentira que este plugin existe para
impedir.

As travas 1 e 2 são comandos: desliga-se não invocando.

**As travas 6, 7 e 8 também não têm botão**, e está dito aqui pelo mesmo critério de honestidade da
`escopo` acima: nenhuma delas lê a chave `travas`. O que as desliga:

| Trava | O que a desliga |
|---|---|
| 6 · agente caro | não declarar `agentes.escada` no `projeto.json` — sem escada, o portão não opina e só conta |
| 7 · criar sem procurar | nomear o arquivo no `escopo.md`, ou fazer uma busca antes. Não há como desligar de vez |
| 8 · catraca afrouxada | nada. É a única sem saída, e de propósito: uma catraca que se desliga sozinha não é catraca |

---

## Para entender por quê

Cada trava nasceu de uma falha **nomeada** — mecanismo sem falha de origem é decoração, e foi por
esse critério que o que não tinha origem ficou de fora. A falha aparece no comentário de cabeçalho
do módulo que a resolve, e na mensagem que o portão devolve quando nega:

| Falha | Onde ela virou mecanismo |
|---|---|
| "declaro pronto sem ter olhado a saída" | `scripts/portao-fecho.js` · `scripts/lib/evidencia.js` |
| "sou otimista ao julgar o meu próprio código" | `skills/revisar/SKILL.md` · `scripts/lib/veredito.js` |
| "invento escopo que ninguém pediu" | `scripts/portao-escopo.js` · `scripts/lib/escopo.js` |
| "prefiro criar arquivo novo a entender o que já existe" | `scripts/lib/busca.js` |
| "quando o teste me atrapalha, tenho vontade de mexer no medidor" | `scripts/lib/catraca.js` |
| "escrevo o comando do mundo médio, que é Linux" | `scripts/lib/shell.js` |
| "não enxergo outra sessão trabalhando no mesmo lugar" | `scripts/lib/git.js` |
| "custo não me dói" | `scripts/portao-agente.js` · `scripts/lib/custo.js` |
| "julgo mal estética quando não há referência nomeada" | `scripts/lib/design.js` |

O registro completo — a autoavaliação de origem, a pesquisa, o desenho e o log de decisões — **não
é publicado**, por escolha de quem escreveu: é diário de trabalho, não documentação de produto.
O que a ferramenta faz está aqui e nos testes; por que ela faz assim está no código, ao lado da
linha que decide.
