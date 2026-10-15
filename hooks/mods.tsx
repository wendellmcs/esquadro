import type { Register } from 'claude-code'

// Bloco M (D435) - os mods do esquadro: M1 medidor da sessao, M2 painel do plano.
// Cola fina: a conta e o texto moram em scripts/sessao.js e scripts/plano.js (fonte unica, testados
// pela suite node --test). O mod junta o que o motor mede, chama o script e mostra a resposta.
// D148: nada abre rede - $.session.usage() sem breakdown e local; o resto e node na maquina.
// Terminal, Desktop e chat do VS Code (sonda da s53: o VS Code desenha a faixa e o status): linha de status a cada
// medida (uma linha so - o "\n" vira espaco) e faixa acima do prompt com a linha do plano (pedido 30) e, embaixo
// dela, um botao por vez: o de maior prioridade que o sessao.js devolve em `botoes` (pedido 32; o do handoff quando a
// troca de chat cruzou). Os dois comandos respondem em texto em qualquer tela.
// Desenho: .context/plans/2026-10-11-esquadro-bloco-m-desenho.md.

// Pedido 32 (D519, D522): o acento do esquadro na faixa - a chave de tema no terminal e no Desktop, a cor crua do
// banner no VS Code (la a chave nao pinta). Copia de scripts/lib/identidade.js, conferida por test/identidade.test.js.
const ACENTO_CRU = '#F59E0B'
const ACENTO_TEMA = 'warning'

const MAX_AMOSTRAS = 20
const PRAZO_MS = 10000
// D442/7 (M-5): medida em curso ha mais que isto esta presa (o PRAZO_MS so cobre o process.run; a leitura de
// uso nao tem prazo). A seguinte nao espera mais por ela.
const PRAZO_PRESA_MS = 3 * PRAZO_MS

// Pedido 32: so comando do esquadro vira botao (o texto vem do script; o mod nao poe outra coisa no prompt).
const COMANDO_DO_ESQUADRO = /^\/esquadro:[a-z]+( [^\n]*)?$/
// A ultima resposta vai ao script so pelo fim: o gatilho do paralelo e a oferta, que fecha a resposta.
const MAX_RESPOSTA = 2000

type Botao = { nome: string; texto: string; rotulo: string; comando: string }
type Medida = { curta: string; longa: string; cruzou: boolean; plano?: string; botoes?: Botao[]; guardar?: { historico?: unknown; gastoReal?: unknown } }
type Amostra = { tokens?: number; cincoH?: number }

// Variaveis do modulo: a recarga do mod zera a previsao, que volta com 2 turnos, e os botoes usados e o padrao
// carregado (limite conhecido: depois de recarregar, o botao do padrao pode voltar numa sessao que ja o carregou).
const amostras: Amostra[] = []
let linhaDoPlano = ''
let botoes: Botao[] = []
const usados = new Set<string>()
let ultimaResposta = ''
let padraoCarregado = false
let medindo = false
let medindoDesde = 0
let pendente = false
let geracao = 0

async function rodar($: any, script: string, extra: string[], stdin?: string) {
  const argv = ['node', $.plugin.root + '/scripts/' + script, ...extra]
  return $.process.run(argv, { stdin: stdin, timeoutMs: PRAZO_MS })
}

async function medir($: any): Promise<Medida | null> {
  const uso = await $.session.usage()
  const sessao = await $.session.id()
  // Pedido 31 (D520): o historico das janelas e o gasto real do mes vivem no $.store (conta inteira, entre sessoes);
  // o sessao.js faz a conta e devolve em `guardar` o que gravar de volta. Store que falha: segue sem ele.
  let historico: unknown = undefined
  let gastoReal: unknown = undefined
  try { historico = await $.store.get('historico') } catch (err) {}
  try { gastoReal = await $.store.get('gastoReal') } catch (err) {}
  const r = await rodar($, 'sessao.js', [], JSON.stringify({ uso: uso, amostras: amostras, sessao: sessao,
    historico: historico, gastoReal: gastoReal, resposta: ultimaResposta, padrao: padraoCarregado }))
  if (!r || r.exitCode !== 0) return null
  let m: Medida | null = null
  try {
    const lido = JSON.parse(r.stdout)
    m = lido && typeof lido.curta === 'string' ? lido : null
  } catch (e) {
    return null
  }
  if (m && m.guardar) {
    try { await $.store.set('historico', m.guardar.historico) } catch (err) {}
    try { await $.store.set('gastoReal', m.guardar.gastoReal) } catch (err) {}
  }
  return m
}

/** Pedido 32: o botao a desenhar - o primeiro da lista (ordem de prioridade do script) ainda nao usado. */
function botaoDaVez(): Botao | null {
  for (const b of botoes) {
    if (b && typeof b.nome === 'string' && !usados.has(b.nome) && typeof b.comando === 'string' &&
      COMANDO_DO_ESQUADRO.test(b.comando)) return b
  }
  return null
}

async function agora($: any): Promise<number | null> {
  try {
    const n = await $.clock.now()
    return typeof n === 'number' && isFinite(n) ? n : null
  } catch (err) {
    return null
  }
}

// Atualiza a linha de status e a faixa. Uma medida por vez: o session.measure dispara a cada resposta.
// D442/7 (M-1): a que chega durante outra fica pendente e roda logo depois (antes era descartada, e o status
// ficava com o numero da anterior). (M-5): a que esta presa alem do PRAZO_PRESA_MS e largada; o resultado
// dela, se um dia chegar, e velho e nao toca o status (a `geracao` mudou).
async function atualizar($: any) {
  const t = await agora($)
  if (medindo) {
    if (t === null || t - medindoDesde <= PRAZO_PRESA_MS) {
      pendente = true
      return
    }
    await $.ui.status('esquadro | medidor sem resposta (a leitura de uso travou; medindo de novo)')
  }
  medindo = true
  medindoDesde = t === null ? 0 : t
  const minha = ++geracao
  try {
    do {
      pendente = false
      let m: Medida | null = null
      try { m = await medir($) } catch (err) {}
      if (minha !== geracao) return
      // Script que falhou (saida diferente de 0, JSON torto, ou a chamada lancou - prazo estourado): o status diz isso em vez de seguir com o numero velho. A faixa fica como
      // estava; a proxima medida boa a acerta.
      if (!m) {
        await $.ui.status('esquadro | medidor sem resposta (confira se o node esta no PATH)')
        continue
      }
      await $.ui.status(m.curta)
      const plano = typeof m.plano === 'string' ? m.plano : ''
      const novos = Array.isArray(m.botoes) ? m.botoes : []
      // O usado volta a valer quando o sinal dele passa (o nome some da lista): se acender de novo, aparece.
      const nomes = novos.map(b => b && b.nome)
      for (const nome of Array.from(usados)) if (nomes.indexOf(nome) === -1) usados.delete(nome)
      const antes = botaoDaVez()
      botoes = novos
      const depois = botaoDaVez()
      if (plano !== linhaDoPlano || JSON.stringify(antes) !== JSON.stringify(depois)) {
        linhaDoPlano = plano
        await $.ui.invalidate('ui.render')
      }
    } while (pendente)
  } finally {
    if (minha === geracao) medindo = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // A doc manda: register que lanca (nome tomado) pula o resto do gancho - cada um no seu try.
    try {
      await $.command.register({ name: 'esquadro-sessao', description: 'esquadro: medidor da sessao (contexto, janelas de limite, custo, previsao e troca de chat)' })
    } catch (err) {}
    try {
      await $.command.register({ name: 'esquadro-plano', description: 'esquadro: painel do plano (feitas, a proxima, o que falta, sessoes gastas e estimativa)' })
    } catch (err) {}
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    try { await atualizar($) } catch (err) {}
    return r
  })

  // Pedido 32: o botao do padrao some quando a skill do manual (esquadro:padrao, ou a do projeto com "padrao" no
  // nome) e carregada pelo agente principal. So olha; a chamada segue igual.
  on('tool.call', async ($, e: any, next) => {
    try {
      if (!e.agentId && e.tool === 'Skill' && /padrao/i.test(String(e.skill))) padraoCarregado = true
    } catch (err) {}
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    try {
      // Pedido 32: a resposta do agente principal vai ao sessao.js (o gatilho do paralelo); a de subagente, nao.
      if (!e.agentId) ultimaResposta = String(e.answer || '').slice(-MAX_RESPOSTA)
    } catch (err) {}
    try {
      const uso = await $.session.usage()
      const cinco = (uso.rateLimits || []).find((j: any) => j && j.kind === 'five_hour')
      amostras.push({ tokens: uso.context && uso.context.tokens, cincoH: cinco && cinco.percentUsed })
      if (amostras.length > MAX_AMOSTRAS) amostras.shift()
      await atualizar($)
    } catch (err) {}
    return r
  })

  on('command.run', { command: 'esquadro-sessao' }, async $ => {
    let m: Medida | null = null
    try { m = await medir($) } catch (err) {}
    // Sem "esquadro:" na frente: o motor ja escreve o nome do plugin antes da resposta.
    return { text: m ? m.longa : 'o medidor nao respondeu (o node roda scripts/sessao.js do plugin; confira se o node esta no PATH).' }
  })

  on('command.run', { command: 'esquadro-plano' }, async $ => {
    try {
      // D476: sem plano-ativo.json o plano vem da frente vinculada a esta sessao; o script acha o vinculo pelo id.
      // Sem id de verdade, nada de --sessao (String(undefined) seria 'undefined'): o script cai no id do ambiente.
      let sessao = ''
      try { const id = await $.session.id(); if (id) sessao = String(id) } catch (err) {}
      const r = await rodar($, 'plano.js', sessao ? ['--texto', '--sessao', sessao] : ['--texto'])
      if (r && r.exitCode === 0 && r.stdout) return { text: String(r.stdout).replace(/\s+$/, '') }
    } catch (err) {}
    return { text: 'o painel do plano nao respondeu (o node roda scripts/plano.js do plugin; confira se o node esta no PATH).' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = botaoDaVez()
    if ((!b && !linhaDoPlano) || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // Pedido 32: um acento so - a borda e o nome "esquadro" na 1a linha; o resto com o desenho do motor.
    const acento = e.surface === 'vscode' ? ACENTO_CRU : ACENTO_TEMA
    const marca = <Text key="esquadro-marca" color={acento} bold>esquadro </Text>
    return (
      <Box key="esquadro-faixa" flexDirection="column" borderStyle="round" borderColor={acento} paddingX={1}>
        {linhaDoPlano ? (
          <Box key="esquadro-linha-plano">
            {marca}
            <Text key="esquadro-plano">{linhaDoPlano}</Text>
          </Box>
        ) : null}
        {b ? (
          <Box key="esquadro-botao">
            {linhaDoPlano ? null : marca}
            <Text>{b.texto + ' '}</Text>
            <Button
              key={'esquadro-' + b.nome}
              label={b.rotulo}
              variant="primary"
              onPress={async () => {
                // So conta como usado depois de preencher: prompt que falha deixa o botao para outra tentativa.
                try {
                  await $.prompt.fill({ text: b.comando, mode: 'replace' })
                  usados.add(b.nome)
                } catch (err) { return }
                try { await $.ui.invalidate('ui.render') } catch (err) {}
              }}
            />
          </Box>
        ) : null}
      </Box>
    )
  })
}
