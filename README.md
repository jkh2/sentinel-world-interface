# SIDLF World Interface

A local desktop environment where a human and an AI partner meet, move around,
and do **real work together** — not a game, but an alternative interface for
working with an AI coding agent.

Instead of a terminal window, each participant has an avatar in a peaceful 3D
park. The conversation connects to a live **Claude Code** or **Codex CLI**
session, so a request made inside the world results in actual file changes,
commands, research, and tests.

> **The world is the interface, but the CLI remains the operational engine.**

This app is fully self-contained. It does not read from, write to, or depend on
any other project on this machine. When it runs an agent, that agent operates
only in the project directory **you** explicitly choose.

---

## Status — Phase 1 complete (CLI Bridge)

| Piece | State |
|-------|-------|
| Operational engine (adapter layer) | ✅ built + live-verified |
| Claude Code adapter (structured stream-json) | ✅ real session, streamed |
| Codex adapter (`codex exec`) | ✅ minimal real |
| Mock adapter (offline) | ✅ deterministic |
| Electron Phase 1 window | ✅ builds + runs |
| 3D park, avatars, movement | ⏳ Phase 2 |
| Voice (push-to-talk / TTS) | ⏳ Phase 5 |

See [`docs/architecture.md`](docs/architecture.md) for the full design and the
staged plan, and [`docs/security-model.md`](docs/security-model.md) for the
permission model.

---

## Requirements (verified on the build machine)

- **Node.js** ≥ 20.12 (20.17+ recommended — npm warns below that)
- **Claude Code** CLI on PATH (verified 2.1.217) — for the Claude backend
- **Codex** CLI on PATH (verified 0.145.0) — for the Codex backend
- Windows 10/11, macOS, or Linux. On Windows, node-pty loads a prebuilt binary
  (no compiler needed); a Visual Studio C++ toolchain is only a fallback.

You can run the whole app in **Mock** mode with none of the CLIs installed.

---

## Setup

```bash
npm install
```

## Run

```bash
npm run dev      # development, with hot reload
```

Then in the window:

1. Pick a backend — start with **Mock (offline)** to explore with zero cost.
2. For a real agent, choose **claude-code** (or **codex**) and **Choose
   project…** to pick the working directory the agent operates in.
3. **Start session**, then type. Watch the response stream back; open the
   terminal drawer to audit raw output.

## Other scripts

```bash
npm run build      # production build of all three contexts
npm test           # headless engine test (Mock suite; RUN_LIVE=1 adds a live Claude round-trip)
npm run typecheck  # strict TypeScript check
npm run spike:pty  # prove node-pty can spawn a CLI on this machine
```

---

*Built by James Keith Harwood II & Claude Sentinel. Part of the Sentinel Alliance.*
