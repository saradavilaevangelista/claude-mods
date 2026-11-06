/** One hunk of one edit: the file, where it starts, and its diff lines (' ', '-', '+' prefixed). */
export type Change = { file: string; line: number; lines: string[] }

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': {
      /** The changes of the last turn that edited files. */
      changes: Change[]
      /** Whether the Replay button shows. */
      isOffered: boolean
      /** Which change the pane shows. */
      index: number
    }
  }
}
