import type { EngineInterface, Register } from 'claude-code'

const THRESHOLD = 60

const NOTE = `Write a handoff note so a fresh chat with no memory of this one can carry on the work. Use exactly these Markdown sections:

# Handoff
## Done
What has been finished and verified (say what was not verified).
## Next
The next steps, in order, specific enough to act on.
## Unsure
Open questions, assumptions, risks, anything you're not confident about.
## Files that matter
Each relevant file or folder as a full path, with one line on why it matters.

Also keep any decisions the user made and their stated preferences under Done or Next. Be concrete and brief. Write in the language the user has been writing in. Reply with the note only.`

type State = { cwd: string; pending: { note: string; path: string } | null; isRunning: boolean; didSwap: boolean }

async function handoff($: EngineInterface, S: State, why: string): Promise<string> {
  if (S.isRunning) return 'A handoff is already running.'
  S.isRunning = true
  try {
    $.ui.status('Handoff: writing the note…')
    const r = await $.model.fork({ prompt: NOTE })
    if (!r.isAnswered) {
      $.ui.toast(`Handoff couldn't write the note (${r.reason}); the chat is unchanged.`)
      return `Handoff stopped: couldn't write the note (${r.reason}). Nothing changed.`
    }
    const note = r.text.trim()
    const stamp = new Date(await $.clock.now()).toISOString().slice(0, 16).replace(/[T:]/g, '-')
    const path = `${S.cwd}/.claude/handoffs/handoff-${stamp}.md`
    await $.fs.write(path, note + '\n')

    $.ui.status('Handoff: starting fresh from the note…')
    // Run the built-in /compact: the engine starts the compaction, and this
    // mod's session.compact hook answers it with the note in place of a summary.
    S.pending = { note, path }
    S.didSwap = false
    await $.command.run({ command: 'compact', args: 'handoff' })
    if (!S.didSwap) {
      $.ui.toast(`Handoff note saved to ${path}, but the chat couldn't restart. Run /compact yourself if you like.`)
      return `Note saved to ${path}. The chat couldn't restart.`
    }
    $.ui.toast(`${why} Note saved to ${path}; the chat now starts fresh from it.`)
    return `Handoff note saved to ${path}. This chat now starts fresh from that note.`
  } finally {
    S.pending = null
    S.isRunning = false
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  const S: State = { cwd: '', pending: null, isRunning: false, didSwap: false }
  let isTurnOn = false
  let isDue = false
  let hasFired = false // the auto handoff fired for the chat as it is now

  on('session.start', async ($, e, next) => {
    S.cwd = e.cwd
    await $.command.register({
      name: 'handoff',
      description: "Write a handoff note (done, next, unsure, files), save it, and restart this chat from it",
    })
    return next(e)
  })

  on('command.run', { command: 'handoff' }, async $ => {
    hasFired = true
    if (S.isRunning) return { text: 'A handoff is already running.' }
    // Restarting the chat can't happen inside the command itself: do it right after.
    $.clock.after(0, () => void handoff($, S, 'Handoff done.'))
    return { text: 'Writing the handoff note; the chat will restart from it in a moment.' }
  })

  on('session.compact', async ($, e, next) => {
    if (!S.pending || e.agentId !== undefined) return next(e)
    const { note, path } = S.pending
    S.pending = null
    S.didSwap = true
    return {
      messages: [
        {
          role: 'user',
          text: `This chat was restarted from a handoff note (saved at ${path}). Carry on from it; the earlier conversation is gone.\n\n${note}`,
          toolUses: [],
        },
        { role: 'assistant', text: 'Got it. I have the handoff note and will carry on from there.', toolUses: [] },
      ],
    }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) isTurnOn = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      isTurnOn = false
      if (isDue) {
        isDue = false
        await handoff($, S, 'This chat passed 60% full.')
      }
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    const percent = e.context.percent
    if (percent === undefined) return r
    if (percent < THRESHOLD) {
      hasFired = false
      return r
    }
    if (hasFired || S.isRunning) return r
    hasFired = true
    if (isTurnOn) isDue = true
    else $.clock.after(0, () => void handoff($, S, 'This chat passed 60% full.'))
    return r
  })
}
