# Handoff

Type `/handoff`, or let the chat pass 60% full, and Handoff:

1. writes a note with what's done, what's next, what Claude is unsure about and which files matter,
2. saves it to `.claude/handoffs/handoff-<date-time>.md` in your project,
3. restarts the chat from that note, so Claude carries on with a clean, small context.

The automatic handoff waits until Claude finishes its current reply, and fires once each time the chat crosses 60%.
