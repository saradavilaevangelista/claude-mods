import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Change } from '../types'

const PANE = 'replay-theater'
const changes = atom({ plugin: 'replay-theater', key: 'changes' } as const, [], { shape: 'changes-1' })
const isOffered = atom({ plugin: 'replay-theater', key: 'isOffered' } as const, false)
const index = atom({ plugin: 'replay-theater', key: 'index' } as const, 0)

const MAX_CHANGES = 200
const MAX_LINES = 300

type Hunk = { oldStart: number; newStart: number; lines: string[] }

function fromPatch(file: string, patch: readonly Hunk[]): Change[] {
  return patch.map(h => ({ file, line: h.newStart, lines: h.lines.slice(0, MAX_LINES) }))
}

function short(path: string, cwd: string): string {
  return path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path
}

async function play($: EngineInterface) {
  await update($, index, () => 0)
  await update($, isOffered, () => false)
  await $.ui.open({ id: PANE, title: 'Replay', focus: true })
}

export const register: Register = on => {
  let turn: Change[] = []
  let cwd = ''

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({ name: 'replay', description: 'Walk through the last set of file changes, one at a time' })
    return next(e)
  })

  on('command.run', { command: 'replay' }, async $ => {
    if ((await read($, changes)).length === 0) return { text: 'No file changes to replay yet.' }
    await play($)
    return { text: 'Replay opened.' }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) turn = []
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ('deny' in ran && ran.deny !== undefined) return ran
    if (ran.isError) return ran
    const r = ran.result as { filePath?: string; structuredPatch?: Hunk[]; originalFile?: string | null; content?: string; type?: string } | undefined
    if (!r || typeof r.filePath !== 'string') return ran
    if (e.tool === 'Edit' || e.tool === 'Write') {
      let found = fromPatch(r.filePath, r.structuredPatch ?? [])
      if (found.length === 0 && e.tool === 'Write' && r.type === 'create' && typeof r.content === 'string') {
        found = [{ file: r.filePath, line: 1, lines: r.content.split('\n').slice(0, MAX_LINES).map(l => '+' + l) }]
      }
      turn.push(...found)
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && turn.length > 0) {
      const done = turn.slice(0, MAX_CHANGES)
      turn = []
      await update($, changes, () => done)
      await update($, isOffered, () => true)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await read($, isOffered))) return below
    const list = await read($, changes)
    const files = new Set(list.map(c => c.file)).size
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {below}
        <Box gap={1}>
          <Text dimColor>
            {list.length} change{list.length === 1 ? '' : 's'} in {files} file{files === 1 ? '' : 's'}
          </Text>
          <Button key="replay" label="▶ Replay" onPress={() => play($)} />
          <Button key="dismiss" label="✕" dimColor onPress={() => update($, isOffered, () => false)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, changes)
    if (list.length === 0) return <Text dimColor>No changes to replay.</Text>
    const i = Math.min(await read($, index), list.length - 1)
    const c = list[i]

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>
          Change {i + 1} of {list.length}: {short(c.file, cwd)}, line {c.line}
        </Text>
        <Box flexDirection="column">
          {c.lines.map(l =>
            l.startsWith('-') ? (
              <Text color="diffRemoved" strikethrough mono>{l.slice(1) || ' '}</Text>
            ) : l.startsWith('+') ? (
              <Text color="diffAdded" mono>{l.slice(1) || ' '}</Text>
            ) : (
              <Text dimColor mono>{l.slice(1) || ' '}</Text>
            ),
          )}
        </Box>
        <Box gap={1}>
          <Button key="back" label="◀ Back" dimColor={i === 0} onPress={() => update($, index, n => Math.max(0, n - 1))} />
          {i < list.length - 1 ? (
            <Button key="next" label="Next ▶" onPress={() => update($, index, n => Math.min(list.length - 1, n + 1))} />
          ) : (
            <Button key="done" label="Done" onPress={() => $.ui.close({ id: PANE })} />
          )}
        </Box>
      </Box>
    )
  })
}
