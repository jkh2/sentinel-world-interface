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

## Found in live play (Session 110) — one fixed, two open

James live-tested the MCP wiring and chat hotkeys tonight (both worked — real
tool-call-driven avatar movement, G/H quick actions fired mid-fight with zero
unlock) and surfaced three real gameplay issues digging/mining.

- ✅ **Fixed**: bumping an undug wall while caving launched the player back to
  the surface. Root cause: `Player.tsx` had no horizontal collision at all —
  position could slip into a column you hadn't dug, and `surfaceHeight()` for
  an undug column reports the *original* terrain height; the vertical
  floor-follow then snapped straight up to match. Fixed with axis-separated
  collision (checked at foot + head height, so you slide along a wall instead
  of sticking or slipping through it) — this removes the root cause, not just
  the symptom, since position can no longer enter an unmined column at all.
- **Open — mesh-rebuild stutter**: "mine ~4-5 blocks fast, then digging pauses
  a few seconds before working again." Near-certain cause: `VoxelTerrain.tsx`'s
  `buildGeometry(world)` rebuilds the *entire* ~100k-cell mesh synchronously on
  every single dig/place — a burst of rapid edits queues that many full
  rebuilds back-to-back. The scoped fix (smaller than real chunking): batch
  rapid edits into one remesh per animation frame (dirty-flag + rAF) instead of
  one synchronous rebuild per click. True incremental/local remeshing (only
  recompute faces for the edited cell + neighbors) is the fuller fix, but
  bigger — worth doing if batching alone doesn't feel smooth enough once tried.
- **Open — side-face mining, needs one more live data point before touching
  code**: clicking an exposed pit-wall side face didn't register; clicking a
  block's top always did. Traced `VoxelTerrain.tsx`'s dig-cell math and
  `mesher.ts`'s per-face normals — both look correct for any face on paper, so
  this may be **line-of-sight occlusion** (the near lip of the pit blocking the
  ray to the wall behind it) rather than a code bug. Next test: back up a step
  or change angle when it happens and see if the side face then mines fine — if
  it does, this isn't a bug; if it still fails from a clearly unobstructed
  angle, that's the real repro to chase.

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

- **Water flow simulation** (parked, design ready; Minecraft mechanics verified
  Session 109). How Minecraft does it: water carries a **level 0–7** (source =
  full, flowing gets emptier with distance); falls **downward infinitely**,
  spreads **7 blocks horizontally** from a source losing one level per step;
  updates on a **tick (~1 block / 5 ticks), not per frame**; a flowing cell
  touching **2+ sources on a solid base becomes a source** (the infinite-water
  2×2 trick); remove the source and unfed cells drain backward.
  - **Our v1**: parallel `level` array + `sources` set; downward-infinite,
    horizontal −1/step capped at 7, blocked by solids; a **cellular-automaton
    "water tick"** over a **dirty set** of recently-changed cells (quiet when
    nothing changes); drain = the same pass removing unfed cells; a **translucent
    two-geometry mesher pass** with surface height scaled by level. `WATER` block
    id + palette already exist. Self-contained, medium effort.
  - **Honest v1 simplification**: skip Minecraft's flow-toward-nearest-drop
    pathfinding — plain flood-spread still pools/fills/drains, just less "smart"
    about racing to a cliff edge. Weighted flow is a later polish.
  - **Decision (James's, gameplay)**: include the infinite-source 2×2 rule?
    Lean **yes** — keeps lakes/moats stable and enables a refillable well.
  - **Gameplay it unlocks**: a **moat as base defense** (do zombies cross water?
    — a real lever), flooding a mine as a hazard, dam/flood events (Orion's brief).
- **Infinite procedural world**: chunk the world, generate at the edges, per-chunk
  meshing. Demoted from "flagship" — a bounded-but-unknown valley delivers the
  shared-discovery feeling first; infinite is a later *scaling* concern.
- **Bigger footprint**: belongs with chunking (a bigger single mesh is throwaway).
- **Vehicles (2–4 passengers)** — horse/motorcycle, car, hot air balloon, each a
  different speed (James's idea). Primary *purpose*, not just speed: **extract an
  injured player back to the revive point** — a faster, higher-stakes alternative
  to carrying them out on foot. Refinements:
  - *Horse first* — a single-rider mount is our existing movement + a speed
    multiplier + mount/dismount state (reuses the jump-gravity work). The 4-seat
    car (multi-occupant, terrain handling) is the bigger lift; prove the mount loop cheaply first.
  - *Found, not only crafted* — an abandoned truck in a ruined town you repair, a
    horse you tame — so vehicles live inside the functional-loot exploration economy.
  - *Balloon must not defeat fog-of-war* — aerial view reveals **terrain shape**
    (canyon there, structure in the trees) but **never** POI contents or threats;
    you still enter the unknown on foot. A planning tool, not a map-reveal cheat.
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
