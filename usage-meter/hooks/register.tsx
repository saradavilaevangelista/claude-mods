import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Meter } from '../types'

const EMPTY: Meter = { chat: null, fiveHour: null, week: null }
const meter = atom({ plugin: 'usage-meter', key: 'meter' } as const, EMPTY)
const lastActive = atom({ plugin: 'usage-meter', key: 'lastActive' } as const, null)

const HOUR = 60 * 60 * 1000
const SEND = 'Send anyway'
const HOLD = "Don't send"

function toMeter(context: SessionContextUsage, limits: readonly SessionRateLimit[]): Meter {
  const pct = (kind: string) => limits.find(l => l.kind === kind)?.percentUsed ?? null
  return { chat: context.percent ?? null, fiveHour: pct('five_hour'), week: pct('seven_day') }
}

const tone = (p: number | null) => (p === null ? undefined : p >= 90 ? 'error' : p >= 70 ? 'warning' : undefined)
const show = (p: number | null) => (p === null ? '–' : `${Math.round(p)}%`)

function ago(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 120) return `${min} minutes`
  return `${Math.round(min / 60)} hours`
}

async function touch($: EngineInterface) {
  const now = await $.clock.now()
  await update($, lastActive, () => now)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const u = await $.session.usage()
    await update($, meter, () => toMeter(u.context, u.rateLimits))
    return r
  })

  on('session.measure', async ($, e, next) => {
    await update($, meter, () => toMeter(e.context, e.rateLimits))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await touch($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const own = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (!own || e.isMeta || e.command || e.turnId !== undefined) {
      if (own) await touch($)
      return next(e)
    }

    const last = await read($, lastActive)
    const idle = last === null ? 0 : (await $.clock.now()) - last
    if (idle > HOUR) {
      const { chat } = await read($, meter)
      const size = chat === null ? '' : ` (it's ${Math.round(chat)}% full)`
      let answer = SEND
      try {
        answer = await $.ui.ask(
          `It's been ${ago(idle)} since your last message, so sending now makes Claude reread the whole chat${size}, which uses more of your limits. Send anyway?`,
          { options: [SEND, HOLD], header: 'Idle chat' },
        )
      } catch {
        $.ui.toast(`Heads up: ${ago(idle)} idle, so this message rereads the whole chat.`)
      }
      if (answer === HOLD) {
        await $.prompt.fill({ text: e.text })
        return { drop: 'Held back after more than an hour idle; your text is back in the prompt box.' }
      }
    }

    await touch($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const m = await read($, meter)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {below}
        <Box>
        <Text dimColor>Chat </Text>
        <Text color={tone(m.chat)}>{show(m.chat)}</Text>
        <Text dimColor> full · 5-hour </Text>
        <Text color={tone(m.fiveHour)}>{show(m.fiveHour)}</Text>
        <Text dimColor> used · Week </Text>
        <Text color={tone(m.week)}>{show(m.week)}</Text>
        <Text dimColor> used</Text>
        </Box>
      </Box>
    )
  })
}
