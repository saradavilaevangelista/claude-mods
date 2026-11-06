import type { Register } from 'claude-code'

/** A message at least this many words long counts as a brain dump. */
const MIN_WORDS = 250
const MAX_QUESTIONS = 3

const SORT = `You tidy up a user's long "brain dump" message to an AI assistant before it is sent.
Sort it into:
- goal: one sentence, what the user is ultimately trying to achieve.
- facts: every piece of background, context, constraint or detail they gave. Keep ALL of them, including names, numbers, links, file paths and quoted text, exactly as written. Do not add anything.
- asks: each concrete thing they want done, as a short imperative, in their order.
- questions: ONLY where the message could reasonably be read two (or more) different ways and the choice would change the work. At most ${MAX_QUESTIONS}. Each has 2-4 short option labels (1-5 words). If nothing is ambiguous, return [].
Write everything in the same language the user wrote in.
Reply with ONLY JSON: {"goal":"...","facts":["..."],"asks":["..."],"questions":[{"question":"...?","options":["...","..."]}]}`

const NOTES = `You tidy up a user's timestamped notes to an AI assistant before they are sent.
Return:
- goal: one sentence, what the notes are for.
- items: each note as one numbered-list item, in order, keeping its timestamp at the front and every detail (names, numbers, links) exactly as written. Merge only exact duplicates. Do not add anything.
Write in the same language the user wrote in.
Reply with ONLY JSON: {"goal":"...","items":["..."]}`

const TIME = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:am|pm|h)?\b|\b\d{4}-\d{2}-\d{2}\b/gi

type Question = { question: string; options: string[] }
type Sorted = { goal: string; facts: string[]; asks: string[]; questions: Question[] }
type Notes = { goal: string; items: string[] }

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

function json(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

function asSorted(j: Record<string, unknown> | null): Sorted | null {
  if (!j || typeof j.goal !== 'string') return null
  const qs = Array.isArray(j.questions) ? j.questions : []
  const questions = qs
    .map(q => ({ question: String(q?.question ?? ''), options: strings(q?.options).slice(0, 4) }))
    .filter(q => q.question && q.options.length >= 2)
    .slice(0, MAX_QUESTIONS)
  return { goal: j.goal, facts: strings(j.facts), asks: strings(j.asks), questions }
}

function asNotes(j: Record<string, unknown> | null): Notes | null {
  if (!j || typeof j.goal !== 'string') return null
  const items = strings(j.items)
  return items.length ? { goal: j.goal, items } : null
}

const bullets = (xs: string[]) => xs.map(x => `- ${x}`).join('\n')
const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n')

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const own = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    const words = e.text.trim().split(/\s+/).length
    if (!own || e.isMeta || e.command || words < MIN_WORDS) return next(e)

    const isNotes = (e.text.match(TIME) ?? []).length >= 2
    $.ui.status('Brain Dump: sorting your message…')
    const r = await $.model.complete({
      model: 'sonnet',
      system: isNotes ? NOTES : SORT,
      prompt: e.text,
      effort: 'low',
      maxTokens: 4000,
      timeoutMs: 45000,
    })
    $.ui.status(undefined)

    const parsed = r.isAnswered ? json(r.text) : null

    if (isNotes) {
      const n = asNotes(parsed)
      if (!n) return fallback()
      const text = `Goal: ${n.goal}\n\nNotes:\n${numbered(n.items)}`
      $.ui.toast(`Brain Dump: ${n.items.length} timestamped notes turned into a numbered list`)
      return next({
        ...e,
        text,
        context: [
          ...(e.context ?? []),
          `[Brain Dump] The user's notes were turned into the numbered list above. Work through it, and END your reply with the same numbered list, each item marked ✅ done or ⬜ not done (with a few words on why for any ⬜).`,
        ],
      })
    }

    const s = asSorted(parsed)
    if (!s || (s.asks.length === 0 && s.facts.length === 0)) return fallback()

    const decisions: string[] = []
    for (const q of s.questions) {
      try {
        const answer = await $.ui.ask(q.question, { options: q.options, header: 'Brain dump' })
        decisions.push(`${q.question} → ${answer}`)
      } catch {
        decisions.push(`${q.question} → (not answered: use your judgment and say which way you went)`)
      }
    }

    const parts = [`Goal: ${s.goal}`]
    if (s.facts.length) parts.push(`Facts:\n${bullets(s.facts)}`)
    if (s.asks.length) parts.push(`Asks:\n${numbered(s.asks)}`)
    if (decisions.length) parts.push(`Decisions:\n${bullets(decisions)}`)
    $.ui.toast(
      `Brain Dump: sorted into ${s.facts.length} facts and ${s.asks.length} asks` +
        (decisions.length ? `, ${decisions.length} question${decisions.length > 1 ? 's' : ''} settled` : ''),
    )
    return next({ ...e, text: parts.join('\n\n') })

    function fallback() {
      $.ui.toast("Brain Dump couldn't sort that message, so it went as you wrote it.")
      return next(e)
    }
  })
}
