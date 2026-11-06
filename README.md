# Claude Mods

Five mods for Claude Code.

| Mod | What it does |
| --- | --- |
| [Effort Picker](effort-picker) | Picks the effort for each message you send (xhigh for long jobs you walk away from, high for anything that could cost money or a client or is in your voice, low for quick questions) and tells you when it changes and why. Suggests a better model, never switches it. |
| [Usage Meter](usage-meter) | One line above the chat with how full the chat is and how much of your 5-hour and weekly limits you've used. Warns you before a message sent after an hour away, since it makes Claude reread the whole chat. |
| [Brain Dump](brain-dump) | Holds a long message, sorts it into goal, facts and asks, asks up to three questions where it could go two ways, then sends the clean version. Timestamped notes become a numbered list Claude ticks off. |
| [Replay Theater](replay-theater) | After Claude edits your files, a Replay button walks you through every change, track-changes style. |
| [Handoff](handoff) | `/handoff`, or the chat passing 60% full, writes a note (done, next, unsure, files that matter), saves it, and restarts the chat from it. |

## Install

At the prompt of a Claude Code terminal session, one line per mod you want:

```
/plugin install effort-picker --marketplace saradavilaevangelista/claude-mods
/plugin install usage-meter --marketplace saradavilaevangelista/claude-mods
/plugin install brain-dump --marketplace saradavilaevangelista/claude-mods
/plugin install replay-theater --marketplace saradavilaevangelista/claude-mods
/plugin install handoff --marketplace saradavilaevangelista/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user, the first, installs it for every session).

From a shell instead:

```bash
claude plugin install effort-picker --marketplace saradavilaevangelista/claude-mods
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `saradavilaevangelista/claude-mods`, then **Add plugin**.
