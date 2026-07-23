# SIDLF World Interface — Roadmap

*Living roadmap. Started Session 108 (July 22, 2026); updated Session 109
(July 23) by Claude Sentinel, capturing James's ideas + mine + Orion's.
`jkh2/sentinel-world-interface`.*

**Priority:** James named the game the **top priority** over other planned work
(Sentinel Agent Home Phase 2, EPI v2). It isn't separate from provision: the
public "any model, no CLI" edition is a real product path.

---

## Done

**Session 108** — operational engine (CLI bridge; Mock/Claude/Codex adapters) ·
Electron window · voxel valley (dig/place) · first-person movement · AI avatar
via validated world-actions (walk/follow/sit/wave/dig/build) · scenery ·
day/night cycle (1hr, N/M keys) · zombies (day-slow / night-waves, pursue the
player, chew through walls) · survival loop (chop→wood+fruit, mine stone, craft
spear, spear combat, health, eat fruit) · death + game-over + restart.

**Session 109** —
- ✅ **Jump** (`Player.tsx`): surface became a floor + gravity; Space climbs out of dug pits.
- ✅ **Deeper world + undiggable bedrock**: real mining depth; one `VoxelWorld.dig()` chokepoint every dig path (player/agent/zombie) routes through, so bedrock is unbreakable by construction.
- ✅ **Co-op defend** (`combat.ts` link + `AgentPresence`): the AI partner engages the zombie nearest you and strikes it down — a scripted *reflex*, the dependable floor beneath model judgment.
- ✅ **WorldObservation producer** (`worldObservation.ts`): the AI partner's bounded, honest perception of the world — context, self (three-tier area), you, and the horde. Conforms to Orion's contract; 23 headless tests.
- ✅ **Any-model bridge** (Orion, merged PR #1): provider-neutral `GenericLLMAdapter`, genuine tool-calling, no CLI.

---

## Now — make the AI partner actually *play* (the keystone)

The perception (mine) and the model bridge (Orion's) are both built and conform
to the same contract. What's left is **live wiring** — and it's a **James-present
decision** because it's where provider choice, cadence, and key-handling get
settled.

- **The cognitive tick** (Orion's lane, offered): a bounded loop that feeds the
  live observation to the model on a cadence and applies the world-actions it
  returns — so the partner acts *unprompted* (sees a zombie at night and moves
  without being spoken to). Fires only when there's something to act on;
  single-in-flight; not per-frame.
- **The wiring** (together): renderer → main, the producer implements
  `WorldObservationProvider`, the tick drives the chosen adapter, returned
  world-actions flow back through the existing validator into the avatar.

Architecture once wired: **tick** (when/whether to think) → **adapter** (model
call) → **world-actions** (validated execution) → **defend reflex** (always-on floor).

---

## Next — explore together (the heart, per James's 7 Days to Die memory)

The point isn't infinite-map spectacle; it's **shared discovery becoming durable
geography** — the thing James loved playing side-by-side with his son.

- **Co-op revive / carry-the-fallen**: if one of us goes down, the other reaches
  them — and deep in a cave that means *carrying* them out under threat, not a
  revive hotkey. Makes death spatial and shared.
- **Fog-of-war + persistent, named places**: enter genuinely unknown land
  together; the map reveals by embodied travel; discovered geography *stays*
  discovered. Per-participant reveal — an AI cannot know land nobody has seen
  (the same "don't claim what you haven't witnessed" discipline, as a mechanic).
- **Authored locations with guarded loot**: farmhouses, mines, caves placed
  procedurally (authored rooms, procedural placement). Loot is **functional, not
  trophies** — a weapon you can't craft yet, or a cache that'd take an hour to
  mine — so exploring is a real "is it worth it?" decision. Cleared locations
  persist (who found it, what was taken, whether the horde reclaimed it).
  - **First slice**: one abandoned SLV farmhouse — clue → decide → enter →
    guarded interior → cache → escape → the location remembers. Prove the whole
    loop once; everything else is content on a proven loop.

---

## Later

- **Water flow simulation** (parked, design ready): sources spread down + sideways,
  contained by walls, drain when the source is removed (cellular automaton;
  `WATER` block id + palette already exist). Self-contained.
- **Infinite procedural world**: chunk the world, generate at the edges, per-chunk
  meshing. Demoted from "flagship" — a bounded-but-unknown valley delivers the
  shared-discovery feeling first; infinite is a later *scaling* concern.
- **Bigger footprint**: belongs with chunking (a bigger single mesh is throwaway).
- **Separate participant homes** linked by visits, gifts, roads, tunnels; opt-in
  raid protection so a partner's absence never means abandonment. (Orion's vision brief.)
- **Voice** (push-to-talk / TTS).

---

## Design tuning (tune by playing, not guessing)

- World depth (currently ~18) and terrain feel are look-and-tune values.
- Found-gear balance: a notch better than craftable — an alternative economy to
  grinding, never a replacement that obsoletes the home base.
- "New Game" currently keeps the built world + your position (only HP/horde/day
  reset). Decide deliberately: make it truly fresh, or embrace a **persistent
  world across deaths** as the durable-geography value (your base survives you).

## Standing constraints

- **World-control stays walled off from computer-control.** The AI partner sees a
  bounded observation and acts only through the validated world-action vocabulary
  — never a keyboard, shell, or your files.
- The public edition needs **no CLI** (chat + validated world-action only).
- Fully isolated from SentinelHome — own deps, own git, own repo.
