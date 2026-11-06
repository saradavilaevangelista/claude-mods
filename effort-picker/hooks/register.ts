import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Level, Pick } from '../types'

const pick = atom({ plugin: 'effort-picker', key: 'pick' } as const, null)
const lastSent = atom({ plugin: 'effort-picker', key: 'lastSent' } as const, null)

const RULES = `You route a user's message to a reasoning-effort level for an AI coding assistant.
Rules, first match wins:
- "xhigh": a long job the user will walk away from (multi-step build, big refactor, research, "go do X and come back", overnight/background work).
- "high": anything that could cost the user money or a client (payments, billing, pricing, contracts, production deploys, deleting data, client deliverables or client communication), OR anything written in the user's own voice (emails, messages, posts, bios, proposals, cover letters sent as them).
- "low": a quick question with a short answer.
- "keep": anything else.
Also judge whether a different Claude model would clearly do this job better than the current one (e.g. a much faster/cheaper model for trivial lookups, or a stronger model for hard reasoning or long autonomous work). Only suggest when it clearly matters; otherwise null.
Reply with ONLY a JSON object: {"level":"xhigh"|"high"|"low"|"keep","reason":"<under 12 words>","reasonPt":"<the same reason in Brazilian Portuguese>","model":null|"<model name>","modelReason":null|"<under 15 words>"}`

const LEVELS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Level names for the Portuguese pop-up. */
const PT: Record<string, string> = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'extra-alto', max: 'máximo' }

type Verdict = { level: Level | null; reason: string; reasonPt: string; model: string | null; modelReason: string | null }

function parse(text: string): Verdict | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0])
    const level = j.level === 'keep' ? null : LEVELS.includes(j.level) ? (j.level as Level) : undefined
    if (level === undefined) return null
    return {
      level,
      reason: typeof j.reason === 'string' ? j.reason : '',
      reasonPt: typeof j.reasonPt === 'string' && j.reasonPt ? j.reasonPt : typeof j.reason === 'string' ? j.reason : '',
      model: typeof j.model === 'string' && j.model ? j.model : null,
      modelReason: typeof j.modelReason === 'string' ? j.modelReason : null,
    }
  } catch {
    return null
  }
}

export const register: Register = on => {
  let currentModel = 'unknown'

  on('prompt.submit', async ($, e, next) => {
    const own = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (e.command || e.isMeta || !own || e.text.trim() === '') return next(e)

    const r = await $.model.complete({
      model: 'haiku',
      system: RULES,
      prompt: `Current model: ${currentModel}\n\nUser message:\n${e.text.slice(0, 6000)}`,
      effort: 'low',
      maxTokens: 300,
      timeoutMs: 8000,
    })
    const v = r.isAnswered ? parse(r.text) : null
    if (!v) return next(e) // classifier failed: leave everything as it was

    const before = await read($, pick)
    const chosen: Pick = { level: v.level, reason: v.reason }
    await update($, pick, () => chosen)

    const notes: string[] = []
    const prevLevel = before?.level ?? null
    if (prevLevel !== chosen.level) {
      const label = chosen.level ?? 'the session default'
      const labelPt = chosen.level ? PT[chosen.level] ?? chosen.level : 'padrão da sessão'
      $.ui.toast(`Esforço → ${labelPt}: ${v.reasonPt}`)
      notes.push(
        `[Effort Picker] Effort for this message was changed to ${label} (from ${prevLevel ?? 'the session default'}) because: ${chosen.reason}. ` +
          `Start your reply with one short line telling the user this change and why.`,
      )
    }
    $.ui.status(`Effort: ${chosen.level ?? 'default'}`)
    if (v.model) {
      notes.push(
        `[Effort Picker] A different model (${v.model}) might do this job better: ${v.modelReason ?? ''}. ` +
          `Mention this to the user in one line as a suggestion. Do NOT switch the model yourself or call any tool to change it.`,
      )
    }

    return next(notes.length ? { ...e, context: [...(e.context ?? []), ...notes] } : e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e) // subagents keep their own effort
    currentModel = e.model // read only: the model is never changed
    const p = await read($, pick)
    const effort = p?.level ?? e.effort
    await update($, lastSent, () => (effort === undefined ? null : String(effort)))
    return yield* next(p?.level ? { ...e, effort: p.level } : e)
  })
}
