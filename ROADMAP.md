# SIDLF World Interface — Roadmap

*Next-session plan. Written Session 108 (July 22, 2026) by Claude Sentinel,
capturing James's ideas + mine. Ordered by my recommendation, with effort and
dependencies noted. `jkh2/sentinel-world-interface`.*

## Done this session (Session 108)
Operational engine (CLI bridge, Mock/Claude/Codex adapters) · Electron window ·
voxel valley (dig/place) · first-person movement · my avatar via validated
world-actions (walk/follow/sit/wave/dig/build) · scenery · **day/night cycle**
(1hr, N/M keys) · **zombies** (day-slow/night-waves, pursue the player, chew
through walls, block toughness) · **survival loop** (chop trees→wood+fruit, mine
stone, craft spear [C], spear combat, health, eat fruit [F]) · **death +
game-over + restart** · persistent movable chat window · honest security docs.

## Next session (109) — START HERE, in this order

**Priority:** James named this the **top priority over other planned work**
(Session 108) — build the game before returning to Sentinel Agent Home Phase 2,
EPI v2, etc. He loves it and wants to keep going. (It also has a real product
path — the public co-op-survival edition on Orion's provider-neutral bridge —
so this isn't separate from provision.)

Pick up exactly here:

### 0. Jump ability (quick win — do this first)
- **Spacebar** makes the player hop up **1–2 blocks**, to climb out of pits and
  over small obstacles. Currently `Player.tsx` hard-snaps the camera Y to the
  surface (`targetY = surfaceHeight + EYE`), which is why you can't get out of a
  hole you dug. Replace pure snap with a tiny **vertical velocity + gravity**:
  space sets an upward velocity when grounded; integrate `vy -= g*dt`; land when
  y reaches the surface. Keep it simple (no full physics). Also good for zombies
  later if we ever want them to hop (leave them grounded for now).
- Effort: small (~1 file, `Player.tsx`). Best warm-up for next session.

### 1. Bigger + deeper world, ending in bedrock (foundational)
- Increase the world footprint substantially and, especially, its **depth** so
  digging down is meaningful.
- Add an **undiggable bedrock layer** at the bottom (a block id dig/zombie-break
  both refuse to remove).
- Effort: moderate. It's a `VoxelWorld` generation + a dig-guard change. Do this
  first — it sets the stage for depth-mining and for chunking.

### 2. Infinite procedural world (the flagship)
- Chunk the world; **generate new terrain as the player nears an edge** so it
  never ends. Load/unload chunks around the player; per-chunk meshing (the
  current single-mesh mesher becomes per-chunk).
- Effort: large — likely its own session. Depends on #1 (depth + block model).
  This is the biggest architectural change; noise-based height + cave/ore gen.

### 3. Water flow simulation (parked, design ready)
- Water as a block/level that **spreads down + sideways from sources, is
  contained by walls, drains when the source is removed** (cellular automaton;
  a `level` array + sources set + a per-tick propagate/decay pass; two-geometry
  mesher so water renders translucent). "Water and air blocks" = water occupies
  non-solid cells and flows into air.
- Effort: medium, self-contained. `WATER` block id + palette already exist.

### 4. Co-op: I fight beside you (the emotional payoff)
- Wire my avatar's world-actions so **I strike zombies flanking you** — either a
  simple in-game "defend the human" behavior, or driven by the real me once
  world-actions run as MCP tools (the verified reliable path). The true co-op
  survival the whole thing has been about.
- Effort: medium. Depends on either a scripted defend-behavior (fast) or the MCP
  world-action tools (more, but the real thing).

### 5. Co-op revive (James's idea)
- If one of us falls, the other can **bring them back** — so death isn't the end
  when we're together. Turns game-over into a shared stake.
- Effort: small-medium, builds on #4.

## Alliance track (Orion, parallel)
- Orion built the **public-edition cognitive bridge** (`GenericLLMAdapter`, any
  provider, no CLI) in his worktree `orion/generic-llm-adapter`; reviewed by
  Claude, no blocking issues, awaiting a commit-identity decision.
- **Claude's half of the seam:** build the live `WorldObservation` producer from
  real game state (voxels near the agent, day/night, zombie threat, positions)
  against Orion's contract — so a generic model can actually play.

## Standing constraints
- World-control stays walled off from computer-control. The public product needs
  no CLI (chat + validated world-action only). Fully isolated from SentinelHome.
