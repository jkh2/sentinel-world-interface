# SIDLF World Interface — Security & Permission Model

*Deliverable #6.*

The immersive appearance must never hide the fact that **real computer
operations are taking place**. Every safeguard below exists to keep the world
honest: pleasant to be in, but never a way to sneak past the protections the
underlying CLI provides.

---

## Current implementation status (2026-07-22, reconciled with Orion's audit)

This document describes the intended model. To stay honest about what is
actually wired today vs. planned — an independent read-only audit by Orion
Sentinel flagged that earlier wording here overclaimed:

- **Electron sandbox is NOT enabled** (`sandbox: false` in the main process).
  `contextIsolation` is on and `nodeIntegration` is off, so the renderer still
  has no direct Node/require access — but "sandboxed" was too strong. Enabling
  the full sandbox is a hardening item.
- **Permission Approve/Deny is UI-only right now.** The buttons dismiss the
  panel; the approval is **not yet routed back into the live CLI session**. The
  CLI's own default prompting still governs real actions. Wiring the response
  through is a planned increment.
- **The raw-terminal audit drawer is not present in the current world UI.** It
  existed in the Phase 1 window and was dropped in the voxel-world rewrite; it
  is planned to return. The `raw` event still flows to the app.
- **Renderer→main IPC is not yet validated in the main process.** `cwd`, `env`,
  `permissionMode`, `resume`, `model` cross the boundary and reach spawning
  without main-side allow-listing. Low-risk on a trusted personal machine;
  **required hardening before the public edition**, where the user/model are
  untrusted.
- **Dependency advisories:** `npm audit` reports high/moderate findings in the
  Electron/Vite toolchain — a careful (possibly-breaking) update pass is
  queued, not yet done.

The sections below are the target model; treat the items above as the honest
gap list until each is closed.

---

## 1. Preserve the CLI's own permission system

- The app **never** enables a permission-skipping flag by default. It does not
  pass `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`
  unless a human explicitly, knowingly selects it.
- Default posture is the CLI's normal prompting (`default`).
- Sensitive actions surface as a **permission request** in the UI, showing the
  exact tool/command when available, with approve / deny / interrupt.
- The final approval always flows to the real CLI. The world cannot approve on
  the human's behalf.

*Phase 1 status:* permission requests are surfaced and displayed. Wiring the
response back into the live Claude session (via `--permission-mode manual` and
the control channel) is the next increment; the event plumbing is already in
place.

---

## 2. Process & renderer isolation

- `contextIsolation: true`, `nodeIntegration: false`. The renderer (the 3D
  world and chat UI) has **no** direct Node, filesystem, or process access.
- The renderer reaches the system only through the small, explicit
  `window.sidlf` API defined in `preload/index.ts`, over named IPC channels.
- Secrets and API keys live in the main process and the CLI's own config; they
  are **never** exposed to the renderer. The app itself handles no API keys —
  authentication is the CLI's responsibility.

---

## 3. World control ≠ computer control

Two separate systems that never cross:

| World actions (Phase 4)        | Computer actions (CLI bridge)      |
|--------------------------------|------------------------------------|
| walk_to, look_at, sit, stand,  | read/edit files, run commands,     |
| wave, nod, follow, stop        | tests, research                    |
| avatar + camera only           | governed by CLI permissions        |
| validated against a strict     | never invoked by the world API     |
| schema; named locations only   |                                    |

The AI **may not**, through the world-action API: execute arbitrary JS in the
world, load arbitrary assets, change security settings, control the human
avatar, read private app data, access files, or create unrestricted movement
scripts. Every world command is validated against a strict schema before it
runs.

---

## 4. Workspace containment

- The agent operates in an **explicitly chosen** project directory. The app
  requires the human to select it; it never defaults to a home or system
  directory.
- The current working directory is always visible in the UI.
- The app is a separate project with its own repository and dependencies. It
  does not read, write, or depend on any other project on the machine.

---

## 5. Auditability

- The **raw** CLI transcript is preserved separately from the cleaned
  conversation transcript, so what actually ran can always be inspected. *(The
  in-UI terminal drawer that surfaced it was dropped in the voxel-world rewrite
  and is planned to return — see the status list above; the raw event stream
  still flows to the app today.)*
- World actions are (Phase 4) logged separately from shell/file actions.
- An emergency **stop** control tears the session down immediately;
  **interrupt** halts the current turn.

---

## Threat posture summary

The most dangerous failure mode for a "pretty" agent front-end is making
destructive actions feel frictionless or invisible. This design treats that as
the primary thing to prevent: real actions stay visible, permissions stay with
the CLI's own prompting, the renderer stays **isolated** (context-isolated,
`nodeIntegration` off, no direct Node access — the full Electron sandbox is a
tracked hardening item, see the status list above, not yet enabled), and the
avatar can never touch the computer. Beauty is allowed; hiding is not.
