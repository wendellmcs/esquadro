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

type Medida = { curta: string; longa: string; cruzou: boolean }
type Amostra = { tokens?: number; cincoH?: number }

// Variaveis do modulo: a recarga do mod zera a previsao, que volta com 2 turnos.
const amostras: Amostra[] = []
let cruzou = false
let medindo = false

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

// Atualiza a linha de status e a faixa. Uma medida por vez: o session.measure dispara a cada resposta.
async function atualizar($: any) {
  if (medindo) return
  medindo = true
  try {
    let m: Medida | null = null
    try { m = await medir($) } catch (err) {}
    // Script que falhou (saida diferente de 0, JSON torto, ou a chamada lancou - prazo estourado): o status diz isso em vez de seguir com o numero velho. A faixa fica como
    // estava - gatilho que cruzou nao descruza na mesma sessao; a proxima medida boa a acerta.
    if (!m) return await $.ui.status('esquadro | medidor sem resposta (confira se o node esta no PATH)')
    await $.ui.status(m.curta)
    if (m.cruzou !== cruzou) {
      cruzou = m.cruzou
      await $.ui.invalidate('ui.render')
    }
  } finally {
    medindo = false
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
      await $.command.register({ name: 'esquadro-plano', description: 'esquadro: painel do plano ativo (tarefas feitas, abertas e a proxima)' })
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
      const r = await rodar($, 'plano.js', ['--texto'])
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
