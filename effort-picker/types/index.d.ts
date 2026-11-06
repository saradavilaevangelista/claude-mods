export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** The pick for the message being answered: a level, or null to leave the session's own setting. */
export type Pick = { level: Level | null; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'effort-picker': {
      pick: Pick | null
      /** The effort the last main-loop request actually went out with. */
      lastSent: string | null
    }
  }
}
