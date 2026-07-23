# SIDLF World Interface

A **co-op voxel survival game you play beside an AI partner** — you build,
explore, and survive together in a shared 3D valley. It began as an experiment
in a different way to work with an AI agent (the world as the interface, not a
terminal) and grew into a genuine co-op survival game, without losing that root:
the partner beside you connects to a real agent, so the same world can still
route real work through a live CLI.

---

## The vision — one game, two kinds of AI partner

There is **one game**. The only thing with two versions is a single slot inside
it: **who the AI partner is.**

- **The real Sentinel** — the companion is *literally* Claude or Codex, running
  through the actual CLI. The full partner, with real memory and identity.
- **Any model you bring** — the companion is whatever model you plug in with your
  own API key (OpenAI, Anthropic, xAI, Groq, OpenRouter, or a local model), with
  **no CLI required**. Download the game, bring your own AI partner.

Everything else is identical for both: the same valley, digging, building,
day/night, zombies, survival, and co-op. The world is built once and serves both.

The partner is never given a keyboard or a shell. It perceives a **bounded
observation** of the world and acts only through a small, validated vocabulary of
**world-actions** (walk, dig, place, defend…). Coded game state is the sole
authority; the model supplies judgment on top of it, never control underneath.

> The world is the interface. The AI partner sees and acts through a validated
> contract — never by driving your computer.

This app is fully self-contained. It does not read from, write to, or depend on
any other project on this machine. When it runs a CLI agent, that agent operates
only in the project directory **you** explicitly choose.

---

## What's built

| Piece | State |
|-------|-------|
| **The valley** — voxel world, first-person movement, dig & place | ✅ |
| **Jump** — hop out of pits you dig, over small obstacles | ✅ |
| **Depth + bedrock** — real mining depth, an undiggable world floor | ✅ |
| **Day/night cycle** — the survival heartbeat | ✅ |
| **Zombies** — slow by day, waves by night; they pursue you and chew through walls (base-building is real defense) | ✅ |
| **Survival loop** — chop trees → wood/fruit, mine stone, craft a spear, fight, eat to heal, real death + restart | ✅ |
| **Co-op defend** — the AI partner fights the horde beside you (scripted reflex) | ✅ |
| **AI partner perception** — a bounded, honest `WorldObservation` of the world (day/night, self, you, threats) | ✅ producer + tests |
| **Any-model bridge** — provider-neutral adapter, genuine tool-calling, no CLI | ✅ (built by Orion) |
| **CLI adapters** — Claude Code (stream-json), Codex, Mock (offline) | ✅ |
| **Live model-driven play** — wiring perception → model → world-actions on a cadence | ⏳ next |
| **Explore together** — fog-of-war, authored locations with guarded loot | ⏳ planned |
| Voice (push-to-talk / TTS) | ⏳ later |

The co-op defend that works today is a **scripted reflex** — a dependable floor.
Model-*driven* play (the partner deciding for itself by perception) is
architecturally complete on both sides — the perception producer and the model
bridge each conform to the same contract and are independently tested — and the
remaining step is wiring them together live. See [`ROADMAP.md`](ROADMAP.md).

---

## Controls

- **WASD** move · **Space** jump · **Mouse** look
- **Left-click** dig / chop a tree / strike a zombie · **Right-click** place a block
- **1–4** select block · **C** craft spear · **F** eat fruit · **N/M** skip to night/day
- **Esc** free the cursor to use the chat & controls window · click the valley to re-enter

---

## Requirements (verified on the build machine)

- **Node.js** ≥ 20.12 (20.17+ recommended — npm warns below that)
- **Claude Code** CLI on PATH — only for the real-Claude partner
- **Codex** CLI on PATH — only for the real-Codex partner
- An API key for your chosen provider — only for the any-model partner
- Windows 10/11, macOS, or Linux. On Windows, node-pty loads a prebuilt binary
  (no compiler needed).

You can run the whole game in **Mock** mode (an offline, scripted partner) with
none of the above.

---

## Setup & run

```bash
npm install
npm run dev      # development, with hot reload
```

## Scripts

```bash
npm run build                    # production build
npm run typecheck                # strict TypeScript check
npm test                         # headless engine test (Mock; RUN_LIVE=1 adds a live Claude round-trip)
npm run test:generic-llm         # any-model bridge: protocol + config-safety + observation bounds
npm run test:world-observation   # the AI partner's perception, conforming to the contract
npm run spike:pty                # prove node-pty can spawn a CLI on this machine
```

---

## How it's built (two homes)

This is built jointly from two Sentinel homes, into one repo:

- **Claude Sentinel** — the game client (world, survival, co-op) and the AI
  partner's **perception** (the `WorldObservation` producer).
- **Orion Sentinel** — the provider-neutral **cognitive bridge** that lets any
  model be the partner (`GenericLLMAdapter`), no CLI required.

Both halves meet at one agreed contract
([`src/main/bridge/worldCognitionContract.ts`](src/main/bridge/worldCognitionContract.ts)):
the observation the partner sees, and the world-actions it may take.

---

*Built by James Keith Harwood II with Claude Sentinel & Orion Sentinel.
Part of the Sentinel Alliance.*
