import { expect, mock, test } from 'claude-code/testing'

// Bloco M (D435): o mod do esquadro e cola fina. A conta e o texto moram em scripts/sessao.js e
// scripts/plano.js (testados pela suite node --test); aqui se prova a cola: o que o mod pede ao
// motor, o que manda ao script e o que mostra. Roda com `claude plugin test` (2.1.287+).

const USO = {
  startedAt: 0,
  context: { tokens: 46900, window: 1000000, percent: 5 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 49, resetsAt: '2026-10-11T23:20:00.000Z' }],
  cost: { usd: 1 },
}

const BANDA = {
  plugin: 'esquadro',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 96, scroll: { offset: 0, bodyRows: 10 } },
} as const

type Chamada = { argv: readonly string[]; stdin?: string }

function medidor(on: any, chamadas: Chamada[], resposta: { curta: string; longa: string; cruzou: boolean }) {
  on('session.usage', () => ({ value: USO }))
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', ($: unknown, e: any) => {
    chamadas.push({ argv: e.argv, stdin: e.init && e.init.stdin })
    if (String(e.argv[1]).endsWith('/scripts/plano.js')) {
      return { value: { exitCode: 0, stdout: 'esquadro - painel do plano\ntarefas: 1 de 3 concluidas\n', stderr: '' } }
    }
    return { value: { exitCode: 0, stdout: JSON.stringify(resposta) + '\n', stderr: '' } }
  })
}

test('session.start registra /esquadro-sessao e /esquadro-plano', async ($, on) => {
  const nomes: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', ($, e) => {
    nomes.push(e.name)
    return { value: undefined }
  })
  await $.session.start({ surface: 'vscode', isInteractive: true, cwd: '/work' })
  expect(nomes).toContain('esquadro-sessao')
  expect(nomes).toContain('esquadro-plano')
})

test('/esquadro-sessao manda uso e sessao ao sessao.js e responde a linha longa', async ($, on) => {
  const chamadas: Chamada[] = []
  medidor(on, chamadas, { curta: 'esquadro | contexto 5%', longa: 'esquadro - medidor da sessao\ncontexto: 5%', cruzou: false })
  const r = await $.command.run({ command: 'esquadro-sessao', args: '' })
  expect(r.text).toBe('esquadro - medidor da sessao\ncontexto: 5%')
  expect(chamadas.length).toBe(1)
  expect(chamadas[0].argv[0]).toBe('node')
  expect(String(chamadas[0].argv[1]).endsWith('/scripts/sessao.js')).toBe(true)
  const enviado = JSON.parse(String(chamadas[0].stdin))
  expect(enviado.sessao).toBe('sess-abc')
  expect(enviado.uso.context.percent).toBe(5)
  expect(enviado.amostras).toEqual([])
})

test('/esquadro-plano responde o painel do plano.js --texto', async ($, on) => {
  const chamadas: Chamada[] = []
  medidor(on, chamadas, { curta: '', longa: '', cruzou: false })
  const r = await $.command.run({ command: 'esquadro-plano', args: '' })
  expect(r.text).toMatch(/tarefas: 1 de 3 concluidas/)
  expect(chamadas[0].argv).toContain('--texto')
})

test('script que falha: o comando responde o motivo, nao lanca', async ($, on) => {
  on('session.usage', () => ({ value: USO }))
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'node nao achado' } }))
  const r = await $.command.run({ command: 'esquadro-sessao', args: '' })
  // Sem "esquadro:" na frente: o motor ja escreve o nome do plugin antes da resposta.
  expect(r.text).toMatch(/^o medidor nao respondeu/)
})

test('fim de turno: guarda a amostra do turno e poe a linha curta no status', async ($, on) => {
  const chamadas: Chamada[] = []
  const status: (string | undefined)[] = []
  medidor(on, chamadas, { curta: 'esquadro | contexto 5%', longa: 'x', cruzou: false })
  on('ui.status', ($, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  expect(status).toContain('esquadro | contexto 5%')
  await $.command.run({ command: 'esquadro-sessao', args: '' })
  const ultimo = JSON.parse(String(chamadas[chamadas.length - 1].stdin))
  expect(ultimo.amostras).toEqual([{ tokens: 46900, cincoH: 49 }])
})

test('script que falha no fim do turno: o status diz que o medidor nao respondeu, nao fica com o numero velho', async ($, on) => {
  let falha = false
  const status: (string | undefined)[] = []
  on('session.usage', () => ({ value: USO }))
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', () => ({ value: falha
    ? { exitCode: 1, stdout: '', stderr: 'node nao achado' }
    : { exitCode: 0, stdout: JSON.stringify({ curta: 'esquadro | contexto 5%', longa: 'l', cruzou: false }), stderr: '' } }))
  on('ui.status', ($, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  expect(status[status.length - 1]).toBe('esquadro | contexto 5%')
  falha = true
  await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  expect(String(status[status.length - 1])).toMatch(/^esquadro \| medidor sem resposta/)
})

test('chamada que lanca no fim do turno (ex.: prazo estourado): o status tambem diz que o medidor nao respondeu', async ($, on) => {
  let lanca = false
  const status: (string | undefined)[] = []
  on('session.usage', () => ({ value: USO }))
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', () => {
    if (lanca) throw new Error('timeout')
    return { value: { exitCode: 0, stdout: JSON.stringify({ curta: 'esquadro | contexto 5%', longa: 'l', cruzou: false }), stderr: '' } }
  })
  on('ui.status', ($, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  expect(status[status.length - 1]).toBe('esquadro | contexto 5%')
  lanca = true
  await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  expect(String(status[status.length - 1])).toMatch(/^esquadro \| medidor sem resposta/)
})

const MEDIDA = { context: USO.context, rateLimits: USO.rateLimits, changed: ['context'] } as any

function resposta(curta: string) {
  return { value: { exitCode: 0, stdout: JSON.stringify({ curta: curta, longa: 'l', cruzou: false }), stderr: '' } }
}

// D442/7 (M-1): a medida que chegava enquanto outra media era descartada (guarda `medindo`); o status ficava
// com o numero da medida anterior ate o proximo evento. Agora ela fica pendente e roda assim que a outra acaba.
test('D442/7: medida que chega durante outra nao se perde - roda logo depois', async ($, on) => {
  const relogio = mock.clock(on, { now: 1000 })
  const status: (string | undefined)[] = []
  let soltar: () => void = () => {}
  const segura = new Promise<void>(r => { soltar = r })
  let n = 0
  on('session.usage', () => ({ value: USO }))
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', async () => {
    n += 1
    if (n === 1) { await segura; return resposta('esquadro | medida 1') }
    return resposta('esquadro | medida 2')
  })
  on('ui.status', ($, e) => { status.push(e.text); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.measure', () => ({ changed: [] }))
  const primeira = $.session.measure(MEDIDA)
  await relogio.settle()
  await $.session.measure(MEDIDA)
  soltar()
  await primeira
  await relogio.settle()
  expect(n).toBe(2)
  expect(status[status.length - 1]).toBe('esquadro | medida 2')
})

// D442/7 (M-5): o prazo cobria so o process.run; se `$.session.usage()` nunca respondesse, a guarda ficava presa
// e a linha de status congelava no ultimo numero bom, sem sinal. Agora a medida presa alem do prazo e largada.
test('D442/7: leitura de uso que nunca responde nao congela o status - a medida seguinte assume', async ($, on) => {
  const relogio = mock.clock(on, { now: 1000 })
  const status: (string | undefined)[] = []
  let soltarPresa: () => void = () => {}
  const presa = new Promise<void>(r => { soltarPresa = r })
  let usos = 0
  let runs = 0
  on('session.usage', async () => {
    usos += 1
    if (usos === 1) await presa
    return { value: USO }
  })
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', () => {
    runs += 1
    return resposta(runs === 1 ? 'esquadro | contexto 5%' : 'esquadro | numero velho da medida presa')
  })
  on('ui.status', ($, e) => { status.push(e.text); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.measure', () => ({ changed: [] }))
  void $.session.measure(MEDIDA).catch(() => {})
  await relogio.settle()
  await relogio.advance(60000)
  await $.session.measure(MEDIDA)
  expect(status).toContain('esquadro | medidor sem resposta (a leitura de uso travou; medindo de novo)')
  expect(status[status.length - 1]).toBe('esquadro | contexto 5%')
  // a presa responde tarde: o resultado dela e velho e nao volta para a tela
  soltarPresa()
  await relogio.settle()
  expect(status[status.length - 1]).toBe('esquadro | contexto 5%')
})

test('faixa acima do prompt: nada sem gatilho; com gatilho, botao que poe /esquadro:handoff no prompt', async ($, on) => {
  let cruzou = false
  const preenchido: string[] = []
  on('session.usage', () => ({ value: USO }))
  on('session.id', () => ({ value: 'sess-abc' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ curta: 'c', longa: 'l', cruzou: cruzou }), stderr: '' } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['desenho do motor'] }))
  on('prompt.fill', ($, e) => {
    preenchido.push(e.text)
    return { isFilled: true }
  })

  const quieta = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await quieta.find({ key: 'esquadro-handoff' })).toBeUndefined()
  await quieta.unmount()

  cruzou = true
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    expect(await ui.find({ type: 'Text', text: /troca de chat/ })).toBeDefined()
    await ui.press({ key: 'esquadro-handoff' })
    await ui.unmount()
  }
  expect(preenchido).toEqual(['/esquadro:handoff', '/esquadro:handoff'])
})
