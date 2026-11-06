import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const NOTE = '# Handoff\n## Done\nBuilt X\n## Next\nShip it\n## Unsure\nNone\n## Files that matter\n/p/a.ts'

function engine(on: On) {
  const written: Record<string, string> = {}
  const compacted: unknown[] = []
  const clock = mock.clock(on, { now: Date.UTC(2026, 10, 6, 14, 30) })
  on('command.register', () => ({ value: { command: 'handoff' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.toast', (_, e: any) => (toasts.push(e.text), { value: undefined }) as any)
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', (_, e: any) => (console.log('LOG', e.text), { value: undefined }) as any)
  on('model.fork', () => ({ value: { isAnswered: true, text: NOTE, usage: USAGE } }) as any)
  on('fs.write', (_, e: any) => ((written[e.path] = e.text), { value: undefined }) as any)
  on('session.compact', (_, e) => (compacted.push('engine'), { messages: e.messages }))
  // Stands for the built-in /compact: it waits while the test body raises
  // session.compact, as the engine would.
  let asked!: () => void
  let finish!: () => void
  const isAsked = new Promise<void>(r => (asked = r))
  const isFinished = new Promise<void>(r => (finish = r))
  on('command.run', { command: 'compact' }, async () => {
    asked()
    await isFinished
    return { text: 'Compacted' }
  })
  const after = { isAsked, finish }
  on('session.measure', (_, e) => ({ changed: e.changed }))
  return { written, compacted, clock, after }
}

export const toasts: string[] = []
const PATH = '/p/.claude/handoffs/handoff-2026-11-06-14-30.md'

test('/handoff writes the note, saves it and restarts the chat from it', async ($, on) => {
  const { written, compacted, clock, after } = engine(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'handoff', args: '', origin: { kind: 'composer' }, presentation: 'text' } as any)
  expect((r as any).text).toContain('restart')
  const running = clock.advance(1)
  await after.isAsked
  const c = await $.session.compact({ trigger: 'manual', instructions: 'handoff', messages: [] })
  after.finish()
  await running
  expect(String(c.messages?.[0]?.text)).toContain('## Next\nShip it')
  expect(toasts.join(' ')).toContain('starts fresh')
  expect(written[PATH]).toContain('## Files that matter')
  expect(compacted).toEqual([]) // the mod answered the compaction itself
})

test('passing 60% full hands off once', async ($, on) => {
  const { written, clock } = engine(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const measure = (percent: number) =>
    $.session.measure({ context: { window: 200000, tokens: percent * 2000, percent }, rateLimits: [], changed: ['context'] })
  await measure(40)
  expect(Object.keys(written)).toEqual([])
  await measure(62)
  await clock.advance(1)
  expect(Object.keys(written)).toEqual([PATH])
  await measure(65)
  await clock.advance(1)
  expect(Object.keys(written).length).toBe(1)
})
