# SIDLF World Interface — Architecture

*Deliverables #1 (architecture), #2 (folder structure), #3 (data flow),
#7 (staged plan), consolidated. Grounded in capabilities verified on the build
machine, not assumptions.*

---

## Central principle

**The world is the interface; the CLI remains the operational engine.**

The 3D world is a *presentation and interaction* layer. All real work — files,
commands, tests, research — happens inside a normal Claude Code / Codex CLI
session. The world never fakes work; it visualizes work that is actually
happening, and it never bypasses the CLI's own permission system.

---

## The five systems (and their boundaries)

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER (sandboxed, no Node access)                        │
│                                                              │
│  ① 3D World Client          ② Conversation Interface         │
│     (R3F/Three — Phase 2)      (React — Phase 1: chat panel)  │
│         │                          │                         │
│         └──────────┬───────────────┘                         │
│                    │  window.sidlf  (contextBridge)          │
└────────────────────┼─────────────────────────────────────────┘
                     │  named IPC channels (validated)
┌────────────────────┼─────────────────────────────────────────┐
│  MAIN (Node)        ▼                                          │
│  ⑤ Orchestrator (SessionManager)                              │
│         │                     │                               │
│  ③ CLI Bridge          ④ World Action Controller (Phase 4)    │
│     (adapters)             (validated avatar actions only)    │
│         │                                                     │
│   child_process / node-pty                                    │
│         ▼                                                     │
│   claude-code  |  codex  |  mock                              │
└───────────────────────────────────────────────────────────────┘
```

**Hard rules that keep this honest:**
- World rendering contains no CLI logic. The CLI bridge contains no avatar/
  animation logic.
- **World control and computer control are separate systems.** The avatar API
  (walk, sit, wave) can never reach the filesystem or a shell; the CLI bridge
  can never move an avatar.
- The renderer is sandboxed. It reaches the operating system only through the
  small, explicit `window.sidlf` API defined in the preload.

---

## Folder structure

```
sentinel-world-interface/
├─ electron.vite.config.ts     # 3 build contexts: main / preload / renderer
├─ tsconfig.json
├─ package.json                # main → out/main/index.js
├─ docs/
│  ├─ architecture.md          # this file
│  └─ security-model.md
├─ scripts/
│  ├─ pty-spike.mjs            # node-pty proof
│  └─ test-adapters.ts         # headless engine test
└─ src/
   ├─ shared/                  # types + event schemas (cross every boundary)
   │  ├─ types.ts
   │  └─ events.ts
   ├─ main/                    # Node — the operational engine
   │  ├─ index.ts              # window + IPC surface
   │  ├─ SessionManager.ts     # orchestrator (system ⑤)
   │  └─ bridge/               # CLI Bridge (system ③)
   │     ├─ AgentSessionAdapter.ts   # the contract (deliverable #5)
   │     ├─ ClaudeCodeAdapter.ts     # primary: stream-json duplex
   │     ├─ CodexCliAdapter.ts       # codex exec
   │     ├─ MockAgentAdapter.ts      # offline
   │     ├─ claudeStreamParser.ts    # native events → normalized events
   │     ├─ capability.ts            # detect, never assume
   │     └─ index.ts                 # adapter factory
   ├─ preload/
   │  └─ index.ts              # contextBridge — the only renderer↔main door
   └─ renderer/                # UI (systems ① + ②)
      ├─ index.html            # strict CSP
      ├─ main.tsx / App.tsx / styles.css
      └─ global.d.ts
```

---

## Data flow (one turn)

```
Human types ──▶ App.onSend
   └─▶ window.sidlf.sendMessage(text)          [renderer]
        └─▶ IPC "session:send"                 [preload → main]
             └─▶ SessionManager.send           [orchestrator]
                  └─▶ adapter.sendMessage       [CLI bridge]
                       └─▶ stdin JSON line ──▶ claude/codex process

claude/codex stdout (NDJSON) ──▶ ClaudeStreamParser
   └─▶ normalized AgentOutputEvent
        └─▶ SessionManager sink
             └─▶ webContents.send "agent:event"  [main → renderer]
                  └─▶ App.handleEvent
                       ├─ assistant-delta  → streaming speech bubble / transcript
                       ├─ tool-activity    → work-activity indicator
                       ├─ permission-request → permission panel
                       └─ result           → finalize + cost
```

Two transcripts are kept separate (per the brief): the **cleaned** conversation
(normalized events) and the **raw** CLI output (the `raw` event → terminal
drawer, for auditing).

---

## Verified CLI capabilities (detected, not assumed)

Captured live off the installed CLIs — this is what steered the design toward
structured streaming rather than TUI screen-scraping.

**Claude Code 2.1.217**
- `-p --input-format stream-json --output-format stream-json
  --include-partial-messages` → one persistent process, multi-turn over stdin,
  structured events out (message deltas, thinking, tool use, result).
- `--continue` / `--resume` / `--fork-session` — session persistence.
- `--permission-mode` (default | acceptEdits | manual | bypassPermissions).
- Real event families are parsed in `claudeStreamParser.ts`.

**Codex 0.145.0**
- `codex exec` (stdin-driven, non-interactive) + `codex exec resume --last`.
- `codex mcp-server` (stdio) available for a future structured path.
- Structured-event schema not yet mapped → adapter treats output as text
  (`structuredOutput: false`) until a capture-first pass is done.

**Capability report** (`capability.ts`) surfaces this per backend so the UI can
adapt (e.g. show/hide the structured permission panel).

---

## The adapter contract (deliverable #5)

```ts
interface AgentSessionAdapter {
  readonly kind: CliKind;
  startSession(options: SessionOptions): Promise<void>;
  sendMessage(message: string): Promise<void>;
  resizeTerminal(columns: number, rows: number): void;
  interrupt(): Promise<void>;
  stopSession(): Promise<void>;
  onOutput(callback: (event: AgentOutputEvent) => void): void;
  getStatus(): AgentSessionStatus;
  getCapability(): CapabilityReport | null;
}
```

Every backend normalizes its native output into the CLI-agnostic
`AgentOutputEvent` union (`src/shared/events.ts`), so nothing downstream — the
orchestrator, the conversation panel, the future avatar — needs to know which
CLI is running.

---

## Staged implementation plan (deliverable #7)

- **Phase 1 — CLI Bridge prototype** ✅ *done.* Window, adapters, streaming,
  controls, permission panel, terminal drawer. Real Claude session verified.
- **Phase 2 — 3D environment.** Park, avatars, WASD + third-person camera,
  named navigation points, animation system. Built against the Mock adapter.
- **Phase 3 — Conversation integration.** Wire the world's UI to the live
  bridge; agent state drives the AI avatar.
- **Phase 4 — AI world control.** The validated world-action API (walk_to,
  sit, wave, follow…), exposed as local MCP tools or a validated action
  envelope. Strictly separate from computer control.
- **Phase 5 — Voice.** Push-to-talk transcription (review-before-send) + TTS,
  loosely synced to a speaking animation. Code/logs never read aloud.
- **Phase 6 — Persistence & polish.** Session history, config, reconnection,
  saved avatar positions, accessibility, launch script.

---

## Key technical decisions

1. **Structured streaming over screen-scraping.** Claude's stream-json protocol
   gives clean, reliable events. node-pty (proven working) is reserved for the
   raw-terminal drawer and as a fallback for TUI-only CLIs.
2. **Phase 1 uses `child_process`, not node-pty** → no native-module rebuild
   against Electron's ABI needed to get a running window. node-pty enters when
   the raw terminal drawer does.
3. **Node ≥20.12 `.cmd` guard.** Spawning the Windows `.cmd` shims requires
   `shell: true` (CVE-2024-27980 behavior). Handled in the adapters and
   capability detection.
4. **Isolation by construction.** Separate repo, separate node_modules; the app
   requires explicit project-dir selection and never defaults to a home dir.
