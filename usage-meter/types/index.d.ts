/** Percentages 0-100; null where the engine has no reading yet. */
export type Meter = { chat: number | null; fiveHour: number | null; week: number | null }

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      meter: Meter
      /** $.clock.now() of the last message sent or answer finished; null before the first. */
      lastActive: number | null
    }
  }
}
