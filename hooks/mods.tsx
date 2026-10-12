import type { Register } from 'claude-code'

// Bloco M (D435) - os mods do esquadro: M1 medidor da sessao, M2 painel do plano.
// Cola fina: a conta e o texto moram em scripts/sessao.js e scripts/plano.js (fonte unica, testados
// pela suite node --test). O mod junta o que o motor mede, chama o script e mostra a resposta.
// D148: nada abre rede - $.session.usage() sem breakdown e local; o resto e node na maquina.
// No chat da extensao do VS Code nada desenha: os dois comandos respondem em texto. No terminal e no
// Desktop: linha de status a cada medida e faixa acima do prompt quando a troca de chat cruzou.
// Desenho: .context/plans/2026-10-11-esquadro-bloco-m-desenho.md.

const MAX_AMOSTRAS = 20
const PRAZO_MS = 10000
// D442/7 (M-5): medida em curso ha mais que isto esta presa (o PRAZO_MS so cobre o process.run; a leitura de
// uso nao tem prazo). A seguinte nao espera mais por ela.
const PRAZO_PRESA_MS = 3 * PRAZO_MS

type Medida = { curta: string; longa: string; cruzou: boolean }
type Amostra = { tokens?: number; cincoH?: number }

// Variaveis do modulo: a recarga do mod zera a previsao, que volta com 2 turnos.
const amostras: Amostra[] = []
let cruzou = false
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
  const r = await rodar($, 'sessao.js', [], JSON.stringify({ uso: uso, amostras: amostras, sessao: sessao }))
  if (!r || r.exitCode !== 0) return null
  try {
    const m = JSON.parse(r.stdout)
    return m && typeof m.curta === 'string' ? m : null
  } catch (e) {
    return null
  }
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
      // estava - gatilho que cruzou nao descruza na mesma sessao; a proxima medida boa a acerta.
      if (!m) {
        await $.ui.status('esquadro | medidor sem resposta (confira se o node esta no PATH)')
        continue
      }
      await $.ui.status(m.curta)
      if (m.cruzou !== cruzou) {
        cruzou = m.cruzou
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

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
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
    if (!cruzou || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>esquadro: troca de chat - gatilho contavel cruzou. </Text>
        <Button
          key="esquadro-handoff"
          label="gerar handoff"
          variant="primary"
          onPress={() => $.prompt.fill({ text: '/esquadro:handoff', mode: 'replace' })}
        />
      </Box>
    )
  })
}
