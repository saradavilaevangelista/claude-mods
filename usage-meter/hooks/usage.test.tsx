import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-meter',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, columns: 80 },
} as const

test('the band shows chat fill and both limits, on terminal and desktop', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 18 },
      { kind: 'seven_day', percentUsed: 73.5 },
    ],
    changed: ['context', 'rateLimits'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: '42%' }))?.text).toBe('42%')
    expect((await ui.find({ type: 'Text', text: '18%' }))?.text).toBe('18%')
    expect((await ui.find({ type: 'Text', text: '74%' }))?.text).toBe('74%')
    await ui.unmount()
  }
})

test('after more than an hour idle, "Don\'t send" holds the message back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let asked = 0
  on('prompt.submit', (_, e) => ({ text: e.text, origin: e.origin }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', (_, e: any) => {
    asked += 1
    const q = e.questions[0]
    return { result: { questions: e.questions, answers: { [q.question]: "Don't send" } } } as any
  })

  const first = await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect('drop' in first).toBe(false)

  await clock.advance(2 * 60 * 60 * 1000)
  const second = await $.prompt.submit({ text: 'back again', wait: false, origin: { kind: 'composer' } })
  expect(asked).toBe(1)
  expect('drop' in second).toBe(true)
})
