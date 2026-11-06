import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'replay-theater',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, columns: 80 },
} as const

const PANE = {
  plugin: 'replay-theater',
  component: 'Pane',
  requestId: 'replay-theater',
  props: { title: 'Replay', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('an edit offers Replay, which steps through each change with the old line crossed out', async ($, on) => {
  let opened = 0
  on('command.register', () => ({ value: { command: 'replay' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ((opened += 1), { value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as any)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('tool.call', () => ({
    result: {
      filePath: '/p/a.ts',
      oldString: 'x',
      newString: 'y',
      originalFile: 'x',
      userModified: false,
      replaceAll: false,
      structuredPatch: [
        { oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-const a = 1', '+const a = 2'] },
        { oldStart: 9, oldLines: 1, newStart: 9, newLines: 1, lines: ['-old b', '+new b'] },
      ],
    },
  }) as any)

  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'x', new_string: 'y' } as any)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false } as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: '2 changes in 1 file' }))?.text).toBe('2 changes in 1 file')
    if (surface === 'desktop') await band.press({ key: 'replay' })
    await band.unmount()
  }
  expect(opened).toBe(1)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: 'Change 1 of 2: a.ts, line 3' }))?.text).toBe('Change 1 of 2: a.ts, line 3')
    const old = await pane.find({ type: 'Text', text: 'const a = 1' })
    expect(old?.props.strikethrough).toBe(true)
    expect((await pane.find({ type: 'Text', text: 'const a = 2' }))?.props.strikethrough).toBe(undefined)
    await pane.press({ key: 'next' })
    expect((await pane.find({ type: 'Text', text: 'Change 2 of 2: a.ts, line 9' }))?.text).toBe('Change 2 of 2: a.ts, line 9')
    await pane.press({ key: 'back' })
    await pane.unmount()
  }
})
