import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const long = (s: string) => `${s} ` + 'word '.repeat(160)

function engine(on: On, reply: object, asks: string[]) {
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: JSON.stringify(reply), usage: USAGE } }) as any)
  on('tool.call', (_, e: any) => {
    asks.push(e.questions[0].question)
    return { result: { questions: e.questions, answers: { [e.questions[0].question]: 'Option B' } } } as any
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context, origin: e.origin }))
}

test('a short message goes through untouched', async ($, on) => {
  const asks: string[] = []
  engine(on, {}, asks)
  const r: any = await $.prompt.submit({ text: 'quick one', wait: false, origin: { kind: 'composer' } })
  expect(r.text).toBe('quick one')
})

test('a long message is sorted, its question asked, and the clean version sent', async ($, on) => {
  const asks: string[] = []
  engine(on, {
    goal: 'Launch the site',
    facts: ['Client is Acme'],
    asks: ['Fix the header', 'Ship Friday'],
    questions: [{ question: 'Which header?', options: ['Option A', 'Option B'] }],
  }, asks)
  const r: any = await $.prompt.submit({ text: long('please'), wait: false, origin: { kind: 'composer' } })
  expect(asks).toEqual(['Which header?'])
  expect(r.text).toContain('Goal: Launch the site')
  expect(r.text).toContain('- Client is Acme')
  expect(r.text).toContain('2. Ship Friday')
  expect(r.text).toContain('Which header? → Option B')
})

test('timestamped notes skip questions and become a list to tick off', async ($, on) => {
  const asks: string[] = []
  engine(on, { goal: 'Meeting follow-up', items: ['09:15 call Ana', '09:40 send deck'] }, asks)
  const r: any = await $.prompt.submit({ text: long('09:15 call Ana 09:40 send deck'), wait: false, origin: { kind: 'composer' } })
  expect(asks).toEqual([])
  expect(r.text).toContain('1. 09:15 call Ana')
  expect(r.context.join(' ')).toContain('✅')
})
